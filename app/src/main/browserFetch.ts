import { BrowserWindow, session, type Session } from 'electron';
import type { FetchResult } from './wowheadClient';
import { isCompletePage, isErrorPage } from './wowheadPage';
import { configureWowheadSession } from './wowheadSession';

/** Requests and the hidden window share this session, so a bot-check cookie the window earns helps later requests. */
const PARTITION = 'persist:wowhead';
/** How long one request may take, in milliseconds; after that it's cancelled. */
const FETCH_TIMEOUT_MS = 10_000;
/** How long the hidden window may take, bot check included, in milliseconds. */
const BROWSER_TIMEOUT_MS = 20_000;
/** How often the hidden window is checked for the page's data, in milliseconds. */
const BROWSER_POLL_MS = 500;
/** The page's HTML once the browser has finished parsing it, or null while it's still reading. */
const READ_PARSED_PAGE = "document.readyState === 'loading' ? null : document.documentElement.outerHTML";

/** Counts hidden-window loads, so a newer one can end an older one. */
let newestLoad = 0;

function wowheadSession(): Session {
  return session.fromPartition(PARTITION);
}

/** Sets up Wowhead's session once, after the app is ready. */
export function prepareWowheadSession(): void {
  configureWowheadSession(wowheadSession());
}

/** A GET through Chromium's own network stack, cancelled if it takes too long. */
export async function fetchText(url: string, headers: Record<string, string>): Promise<FetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await wowheadSession().fetch(url, { headers, signal: controller.signal });
    return { status: response.status, url: response.url, text: await response.text() };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Loads the page in a hidden window, which runs Wowhead's bot check like any browser, and
 * returns its HTML and final address once the whole page is in it. A newer load ends this one:
 * its lookup has been moved past, and its answer would be dropped anyway.
 */
export function loadInBrowser(url: string): Promise<{ html: string; url: string } | null> {
  const load = ++newestLoad;
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
    const finish = (page: { html: string; url: string } | null) => {
      if (done) return;
      done = true;
      clearInterval(poll);
      clearTimeout(timeout);
      if (!window.isDestroyed()) window.destroy();
      resolve(page);
    };
    // The bot check can reload the page, so keep looking until the whole page is there.
    poll = setInterval(() => {
      // On Wowhead's error page the page never comes, so give up now rather than at the timeout.
      if (window.isDestroyed() || load !== newestLoad || isErrorPage(window.webContents.getURL())) {
        finish(null);
        return;
      }
      window.webContents.executeJavaScript(READ_PARSED_PAGE).then(
        (html: unknown) => {
          if (typeof html === 'string' && isCompletePage(html) && !window.isDestroyed()) {
            finish({ html, url: window.webContents.getURL() });
          }
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
