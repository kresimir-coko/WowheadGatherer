import { BrowserWindow, globalShortcut, ipcMain, screen, shell, type IpcMainEvent } from 'electron';
import path from 'node:path';
import type { PopupState } from '../shared/types';
import { placePopup, type Point } from './placement';

/** The popup's width, and the range its height fits its content within, in pixels. */
const POPUP_WIDTH = 420;
const POPUP_MIN_HEIGHT = 96;
const POPUP_MAX_HEIGHT = 560;

/** What clicks inside the popup ask of the app. */
export interface PopupHandlers {
  openQuest(id: unknown): void;
  goBack(index: unknown): void;
  /** The popup was closed: by Escape, its ×, Open on Wowhead or switching away. */
  closed(): void;
}

/** The always-on-top window that shows a lookup by the cursor without taking the keyboard from the game. */
export class Popup {
  private readonly window: BrowserWindow;
  private state: PopupState | null = null;
  private anchor: Point = { x: 0, y: 0 };
  private height = POPUP_MIN_HEIGHT;

  constructor(private readonly handlers: PopupHandlers) {
    this.window = new BrowserWindow({
      width: POPUP_WIDTH,
      height: POPUP_MIN_HEIGHT,
      show: false,
      frame: false,
      resizable: false,
      movable: false,
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
  }

  /** Shows a new lookup by the cursor. */
  open(state: PopupState): void {
    this.anchor = screen.getCursorScreenPoint();
    this.show(state);
  }

  /** Shows a lookup's result, if the popup still shows that lookup. */
  update(state: PopupState): void {
    if (this.window.isVisible() && this.state?.link.url === state.link.url) this.show(state);
  }

  /** The lookup on show, or null when the popup is hidden. */
  current(): PopupState | null {
    return this.state;
  }

  /** Shows another page where the popup already is: a click inside it. */
  replace(state: PopupState): void {
    if (this.window.isVisible()) this.show(state);
  }

  hide(): void {
    if (!this.window.isVisible()) return;
    this.window.hide();
    this.state = null;
    globalShortcut.unregister('Escape');
    this.handlers.closed();
  }

  private show(state: PopupState): void {
    this.state = state;
    this.window.webContents.send('popup:state', state);
    this.place();
    if (!this.window.isVisible()) {
      this.window.showInactive();
      // While the popup is up, Escape closes it, as it closes the game's own windows.
      globalShortcut.register('Escape', () => this.hide());
    }
  }

  private fitHeight(height: unknown): void {
    if (typeof height !== 'number' || !Number.isFinite(height)) return;
    this.height = Math.round(Math.min(Math.max(height, POPUP_MIN_HEIGHT), POPUP_MAX_HEIGHT));
    this.place();
  }

  private place(): void {
    const area = screen.getDisplayNearestPoint(this.anchor).workArea;
    const { x, y } = placePopup(this.anchor, { width: POPUP_WIDTH, height: this.height }, area);
    this.window.setBounds({ x, y, width: POPUP_WIDTH, height: this.height });
  }

  private openOnWowhead(): void {
    // Only ever the link the add-on copied, as parseWowheadLink rebuilt it.
    const url = this.state?.link.url;
    this.hide();
    if (url) void shell.openExternal(url);
  }
}
