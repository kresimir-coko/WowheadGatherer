import { app, clipboard, Menu, nativeImage, shell, Tray } from 'electron';
import path from 'node:path';
import type { WowheadLink } from '../shared/wowheadLink';
import { fetchText, loadInBrowser, prepareWowheadSession } from './browserFetch';
import { DiskCache } from './cache';
import { ClipboardWatcher } from './clipboardWatcher';
import { latestOnly } from './latestOnly';
import { Popup } from './popupWindow';
import { guideUrl, Trail, type TrailStep } from './trail';
import { TRAY_ICON_SIZE, trayIconPixels } from './trayIcon';
import { clipboardSequence, foregroundExeName } from './win32';
import { isCurrentCacheFile, WowheadClient, ZONES_MAX_AGE_MS } from './wowheadClient';

// Held here so they aren't garbage-collected while the app runs.
let tray: Tray | undefined;
let watcher: ClipboardWatcher | undefined;

function start(): void {
  prepareWowheadSession();
  const trail = new Trail();
  const cache = new DiskCache(path.join(app.getPath('userData'), 'cache'));
  // Older versions' files and anything past the longest keep (zone names) are only clutter.
  cache.prune(isCurrentCacheFile, ZONES_MAX_AGE_MS);
  const client = new WowheadClient({ fetchText, loadInBrowser, cache });
  // Results carry the breadcrumb as it is when they arrive; latestOnly drops any the player has clicked past.
  const lookUp = latestOnly(
    (link: WowheadLink) => client.lookup(link),
    (state) => popup.update({ ...state, trail: trail.names() }),
  );
  // A click inside the popup: show the page loading where the popup is, then look it up.
  const goTo = (step: TrailStep | null) => {
    if (!step) return;
    popup.replace({ kind: 'loading', link: step.link, name: step.name, trail: trail.names() });
    lookUp(step.link);
  };
  const popup = new Popup({
    openQuest: (id) => goTo(trail.open(popup.current(), id)),
    goBack: (index) => goTo(trail.back(index)),
    openGuide: (index) => {
      const url = guideUrl(popup.current(), index);
      if (url) void shell.openExternal(url);
    },
    closed: () => trail.clear(),
  });
  const ownExe = path.basename(process.execPath).toLowerCase();

  watcher = new ClipboardWatcher({
    clipboardSequence,
    foregroundExeName,
    readClipboardText: () => clipboard.readText(),
    onLink: (link) => {
      // A lookup from the game starts a fresh trail.
      trail.clear();
      popup.open({ kind: 'loading', link });
      lookUp(link);
    },
    onForeground: (gameInFront, exeName) => {
      if (gameInFront) {
        popup.resume();
        return;
      }
      // Another program in front: a pinned popup waits for the game; any other closes.
      // Clicking or dragging the popup doesn't count, since it never takes focus.
      if (exeName === '' || exeName.toLowerCase() === ownExe) return;
      if (popup.isPinned()) popup.suspend();
      else popup.hide();
    },
  });
  watcher.start();

  tray = new Tray(nativeImage.createFromBitmap(trayIconPixels(), { width: TRAY_ICON_SIZE, height: TRAY_ICON_SIZE }));
  tray.setToolTip('Wowhead Gatherer: hold Ctrl over an item, quest or spell in WoW and press C');
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
