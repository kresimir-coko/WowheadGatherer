import { BrowserWindow, session, type Session } from 'electron';
import { withTimeout, type FetchResult } from './wowheadClient';
import { isCompletePage } from './wowheadPage';
import { configureWowheadSession } from './wowheadSession';

/** Requests and the hidden window share this session, so a bot-check cookie the window earns helps later requests. */
const PARTITION = 'persist:wowhead';
/** How long one request may take, in milliseconds. */
const FETCH_TIMEOUT_MS = 10_000;
/** How long the hidden window may take, bot check included, in milliseconds. */
const BROWSER_TIMEOUT_MS = 20_000;
/** How often the hidden window is checked for the item data, in milliseconds. */
const BROWSER_POLL_MS = 500;
/** The page's HTML once the browser has finished parsing it, or null while it's still reading. */
const READ_PARSED_PAGE = "document.readyState === 'loading' ? null : document.documentElement.outerHTML";

function wowheadSession(): Session {
  return session.fromPartition(PARTITION);
}

/** Sets up Wowhead's session once, after the app is ready. */
export function prepareWowheadSession(): void {
  configureWowheadSession(wowheadSession());
}

/** A GET through Chromium's own network stack. */
export async function fetchText(url: string, headers: Record<string, string>): Promise<FetchResult> {
  const response = await withTimeout(wowheadSession().fetch(url, { headers }), FETCH_TIMEOUT_MS);
  return { status: response.status, url: response.url, text: await withTimeout(response.text(), FETCH_TIMEOUT_MS) };
}

/** Loads the page in a hidden window, which runs Wowhead's bot check like any browser, and returns its HTML once the whole item page is in it. */
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
    // The bot check can reload the page, so keep looking until the whole item page is there.
    poll = setInterval(() => {
      if (window.isDestroyed()) {
        finish(null);
        return;
      }
      window.webContents.executeJavaScript(READ_PARSED_PAGE).then(
        (html: unknown) => {
          if (typeof html === 'string' && isCompletePage(html)) finish(html);
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
