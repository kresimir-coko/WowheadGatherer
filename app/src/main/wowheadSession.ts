import type { Session } from 'electron';
import { browserUserAgent } from './userAgent';

/** What the hidden window doesn't need to load: it only wants the page's scripts. */
const SKIPPED_RESOURCES = new Set(['image', 'media', 'font', 'stylesheet']);

/**
 * Sets up the session Wowhead's requests and the hidden window share. The hidden
 * window runs Wowhead's own and its ads' scripts, and Electron grants every
 * permission when nothing says otherwise, so every request is refused.
 */
export function configureWowheadSession(ses: Session): void {
  // Wowhead turns away agents that say Electron.
  ses.setUserAgent(browserUserAgent(ses.getUserAgent()));
  ses.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
  ses.webRequest.onBeforeRequest((details, callback) => {
    // Requests from fetchText have no web contents; only the hidden window's pictures and fonts are skipped.
    callback({ cancel: details.webContentsId !== undefined && SKIPPED_RESOURCES.has(details.resourceType) });
  });
}
