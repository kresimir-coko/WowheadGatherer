import { app, BrowserWindow, globalShortcut, ipcMain, screen, shell, type IpcMainEvent } from 'electron';
import path from 'node:path';
import type { PopupState } from '../shared/types';
import { fitHeight, keepOnScreen, placePopup, POPUP_MIN_HEIGHT, POPUP_WIDTH, type Point } from './placement';

/** What clicks inside the popup ask of the app. */
export interface PopupHandlers {
  openQuest(id: unknown): void;
  goBack(index: unknown): void;
  /** Opens one of the page's Wowhead guides, by its place in the list. */
  openGuide(index: unknown): void;
  /** The popup was closed: by Escape, its ×, Open on Wowhead or switching away. */
  closed(): void;
}

/** The always-on-top window that shows a lookup by the cursor without taking the keyboard from the game. */
export class Popup {
  private readonly window: BrowserWindow;
  private state: PopupState | null = null;
  private anchor: Point = { x: 0, y: 0 };
  private height = POPUP_MIN_HEIGHT;
  /** Set while a page clicked inside the popup loads: the height doesn't shrink until it's in. */
  private holdHeight = false;
  /** Pinned: stays open while the player plays (no Escape shortcut), and lookups show where it is. */
  private pinned = false;
  /** Hidden while another program is in front, keeping its page, because it's pinned. */
  private suspended = false;
  /** The window's top-left once placed or dragged; null places it by the cursor next time. */
  private position: Point | null = null;

  constructor(private readonly handlers: PopupHandlers) {
    this.window = new BrowserWindow({
      width: POPUP_WIDTH,
      height: POPUP_MIN_HEIGHT,
      show: false,
      frame: false,
      resizable: false,
      // Dragging the top bar moves it (-webkit-app-region in popup.css).
      movable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      // Clicking it doesn't take the keyboard from the game.
      focusable: false,
      // See-through, so the frame's rounded corners show the game behind them.
      transparent: true,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });
    // The highest level, so it stays above the game's full-screen window.
    this.window.setAlwaysOnTop(true, 'screen-saver');
    this.window.webContents.on('will-navigate', (event) => event.preventDefault());
    this.window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    // A lookup that arrived while the page was still loading is sent again.
    this.window.webContents.on('did-finish-load', () => {
      if (this.state) this.window.webContents.send('popup:state', this.state);
    });
    void this.window.loadFile(path.join(__dirname, '..', 'static', 'popup.html'));

    // Only the popup's own page may ask; the hidden windows that load Wowhead pages have no bridge, but check anyway.
    const fromPopup = (event: IpcMainEvent) => event.sender === this.window.webContents;
    ipcMain.on('popup:close', (event) => fromPopup(event) && this.hide());
    ipcMain.on('popup:open-wowhead', (event) => fromPopup(event) && this.openOnWowhead());
    ipcMain.on('popup:height', (event, height: unknown) => fromPopup(event) && this.fitHeight(height));
    ipcMain.on('popup:open-quest', (event, id: unknown) => fromPopup(event) && this.handlers.openQuest(id));
    ipcMain.on('popup:go-back', (event, index: unknown) => fromPopup(event) && this.handlers.goBack(index));
    ipcMain.on('popup:open-guide', (event, index: unknown) => fromPopup(event) && this.handlers.openGuide(index));
    ipcMain.on('popup:pin', (event, on: unknown) => fromPopup(event) && typeof on === 'boolean' && this.setPinned(on));
    // The player dragged it: it stays there, also as it grows.
    this.window.on('moved', () => {
      const [x, y] = this.window.getPosition();
      this.position = { x, y };
    });
    // Right-clicking the top bar would open Windows' window menu, whose Close destroys the window for good.
    this.window.on('system-context-menu', (event) => event.preventDefault());
    // Any close only hides the popup; the window lives until Quit.
    let quitting = false;
    app.on('before-quit', () => { quitting = true; });
    this.window.on('close', (event) => {
      if (quitting) return;
      event.preventDefault();
      this.hide();
    });
  }

  /** Shows a new lookup: by the cursor, or where the popup is while it's pinned. */
  open(state: PopupState): void {
    if (!this.pinned) {
      this.anchor = screen.getCursorScreenPoint();
      this.position = null;
    }
    this.holdHeight = false;
    this.show(state);
  }

  /** Shows a lookup's result, if the popup still shows that lookup (a pinned popup keeps it while suspended). */
  update(state: PopupState): void {
    if (!(this.window.isVisible() || this.suspended) || this.state?.link.url !== state.link.url) return;
    this.holdHeight = false;
    this.show(state);
  }

  /** The lookup on show, or null when the popup is closed. */
  current(): PopupState | null {
    return this.state;
  }

  /** Shows another page where the popup already is: a click inside it. */
  replace(state: PopupState): void {
    if (!this.window.isVisible()) return;
    // Keep the size while the clicked page loads, so the popup stays where it is.
    this.holdHeight = true;
    this.show(state);
  }

  /** Pins the popup open while the player plays, or unpins it. Pinned, Escape belongs to the game again. */
  setPinned(on: boolean): void {
    this.pinned = on;
    if (on) globalShortcut.unregister('Escape');
    else if (this.window.isVisible()) this.registerEscape();
    if (this.state) this.show(this.state);
  }

  isPinned(): boolean {
    return this.pinned;
  }

  /** Hides a pinned popup while another program is in front, keeping its page. */
  suspend(): void {
    if (!this.window.isVisible()) return;
    this.window.hide();
    this.suspended = true;
  }

  /** Brings a suspended popup back when the game is in front again. */
  resume(): void {
    if (!this.suspended) return;
    this.suspended = false;
    if (this.state) this.window.showInactive();
  }

  /** Closes the popup, and unpins it. */
  hide(): void {
    this.suspended = false;
    this.pinned = false;
    this.position = null;
    if (!this.window.isVisible()) return;
    this.window.hide();
    this.state = null;
    globalShortcut.unregister('Escape');
    this.handlers.closed();
  }

  private show(state: PopupState): void {
    this.state = { ...state, pinned: this.pinned };
    this.window.webContents.send('popup:state', this.state);
    if (this.suspended) return;
    this.place();
    if (!this.window.isVisible()) {
      this.window.showInactive();
      if (!this.pinned) this.registerEscape();
    }
  }

  /** While the popup is up and not pinned, Escape closes it, as it closes the game's own windows. */
  private registerEscape(): void {
    if (!globalShortcut.isRegistered('Escape')) globalShortcut.register('Escape', () => this.hide());
  }

  private fitHeight(reported: unknown): void {
    const height = fitHeight(reported, this.height, this.holdHeight);
    if (height === null) return;
    this.height = height;
    this.place();
  }

  private place(): void {
    const size = { width: POPUP_WIDTH, height: this.height };
    const area = screen.getDisplayNearestPoint(this.position ?? this.anchor).workArea;
    // Once placed (or dragged), it stays put and only moves to stay on the screen.
    this.position = this.position ? keepOnScreen(this.position, size, area) : placePopup(this.anchor, size, area);
    this.window.setBounds({ ...this.position, ...size });
  }

  private openOnWowhead(): void {
    // Only the address of the page on show, as parseWowheadLink rebuilt it.
    const url = this.state?.link.url;
    this.hide();
    if (url) void shell.openExternal(url);
  }
}
