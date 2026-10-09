import { BrowserWindow, session, type Session } from 'electron';
import { browserUserAgent } from './userAgent';
import { withTimeout, type FetchResult } from './wowheadClient';

/** Requests and the hidden window share this session, so a bot-check cookie the window earns helps later requests. */
const PARTITION = 'persist:wowhead';
/** How long one request may take, in milliseconds. */
const FETCH_TIMEOUT_MS = 10_000;
/** How long the hidden window may take, bot check included, in milliseconds. */
const BROWSER_TIMEOUT_MS = 20_000;
/** How often the hidden window is checked for the item data, in milliseconds. */
const BROWSER_POLL_MS = 500;
/** What the hidden window doesn't need to load: it only wants the page's scripts. */
const SKIPPED_RESOURCES = new Set(['image', 'media', 'font', 'stylesheet']);
/** Text every item page carries (see wowheadClient.ts). */
const ITEM_DATA = 'WH.Gatherer.addData(';

function wowheadSession(): Session {
  return session.fromPartition(PARTITION);
}

/** Sets up Wowhead's session once, after the app is ready. */
export function prepareWowheadSession(): void {
  const ses = wowheadSession();
  // Wowhead turns away agents that say Electron.
  ses.setUserAgent(browserUserAgent(ses.getUserAgent()));
  ses.webRequest.onBeforeRequest((details, callback) => {
    // Requests from fetchText have no web contents; only the hidden window's pictures and fonts are skipped.
    callback({ cancel: details.webContentsId !== undefined && SKIPPED_RESOURCES.has(details.resourceType) });
  });
}

/** A GET through Chromium's own network stack. */
export async function fetchText(url: string, headers: Record<string, string>): Promise<FetchResult> {
  const response = await withTimeout(wowheadSession().fetch(url, { headers }), FETCH_TIMEOUT_MS);
  return { status: response.status, url: response.url, text: await withTimeout(response.text(), FETCH_TIMEOUT_MS) };
}

/** Loads the page in a hidden window, which runs Wowhead's bot check like any browser, and returns its HTML once the item data is in it. */
export function loadInBrowser(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const window = new BrowserWindow({
      show: false,
      webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    window.webContents.setAudioMuted(true);
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    let done = false;
    let poll: ReturnType<typeof setInterval> | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const finish = (html: string | null) => {
      if (done) return;
      done = true;
      clearInterval(poll);
      clearTimeout(timeout);
      if (!window.isDestroyed()) window.destroy();
      resolve(html);
    };
    // The bot check can reload the page, so keep looking until the item data is there.
    poll = setInterval(() => {
      if (window.isDestroyed()) {
        finish(null);
        return;
      }
      window.webContents.executeJavaScript('document.documentElement.outerHTML').then(
        (html: unknown) => {
          if (typeof html === 'string' && html.includes(ITEM_DATA)) finish(html);
        },
        () => {
          // Between two page loads; the next check tries again.
        },
      );
    }, BROWSER_POLL_MS);
    timeout = setTimeout(() => finish(null), BROWSER_TIMEOUT_MS);
    window.loadURL(url).catch(() => {
      // A failed load ends with the timeout.
    });
  });
}
