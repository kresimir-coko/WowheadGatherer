import { app, clipboard, Menu, nativeImage, Tray } from 'electron';
import path from 'node:path';
import type { WowheadLink } from '../shared/wowheadLink';
import { fetchText, loadInBrowser, prepareWowheadSession } from './browserFetch';
import { DiskCache } from './cache';
import { ClipboardWatcher } from './clipboardWatcher';
import { latestOnly } from './latestOnly';
import { Popup } from './popupWindow';
import { TRAY_ICON_SIZE, trayIconPixels } from './trayIcon';
import { clipboardSequence, foregroundExeName } from './win32';
import { WowheadClient } from './wowheadClient';

// Held here so they aren't garbage-collected while the app runs.
let tray: Tray | undefined;
let watcher: ClipboardWatcher | undefined;

function start(): void {
  prepareWowheadSession();
  const popup = new Popup();
  const client = new WowheadClient({
    fetchText,
    loadInBrowser,
    cache: new DiskCache(path.join(app.getPath('userData'), 'cache')),
  });
  const lookUp = latestOnly((link: WowheadLink) => client.lookup(link), (state) => popup.update(state));
  const ownExe = path.basename(process.execPath).toLowerCase();

  watcher = new ClipboardWatcher({
    clipboardSequence,
    foregroundExeName,
    readClipboardText: () => clipboard.readText(),
    onLink: (link) => {
      popup.open({ kind: 'loading', link });
      lookUp(link);
    },
    onForeground: (gameInFront, exeName) => {
      // Switching to another program hides the popup. Clicking the popup doesn't, since it never takes focus.
      if (!gameInFront && exeName !== '' && exeName.toLowerCase() !== ownExe) popup.hide();
    },
  });
  watcher.start();

  tray = new Tray(nativeImage.createFromBitmap(trayIconPixels(), { width: TRAY_ICON_SIZE, height: TRAY_ICON_SIZE }));
  tray.setToolTip('Wowhead Gatherer: hold Ctrl over an item in WoW and press C');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Wowhead Gatherer', enabled: false },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
}

// One copy at a time: a second start just ends.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // The app lives in the tray, so closing its last window mustn't quit it.
  app.on('window-all-closed', () => {});
  void app.whenReady().then(start);
}
