import { BrowserWindow, globalShortcut, ipcMain, screen, shell } from 'electron';
import path from 'node:path';
import type { PopupState } from '../shared/types';
import { placePopup, type Point } from './placement';

/** The popup's width, and the range its height fits its content within, in pixels. */
const POPUP_WIDTH = 420;
const POPUP_MIN_HEIGHT = 96;
const POPUP_MAX_HEIGHT = 560;

/** The always-on-top window that shows a lookup by the cursor without taking the keyboard from the game. */
export class Popup {
  private readonly window: BrowserWindow;
  private state: PopupState | null = null;
  private anchor: Point = { x: 0, y: 0 };
  private height = POPUP_MIN_HEIGHT;

  constructor() {
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
      backgroundColor: '#0b0e17',
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

    ipcMain.on('popup:close', () => this.hide());
    ipcMain.on('popup:open-wowhead', () => this.openOnWowhead());
    ipcMain.on('popup:height', (_event, height: unknown) => this.fitHeight(height));
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

  hide(): void {
    if (!this.window.isVisible()) return;
    this.window.hide();
    this.state = null;
    globalShortcut.unregister('Escape');
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
