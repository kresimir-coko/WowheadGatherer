import type { Session } from 'electron';
import { describe, expect, it } from 'vitest';
import { configureWowheadSession } from '../src/main/wowheadSession';

type Handler = (...args: never[]) => unknown;

/** A stand-in for Electron's Session that records what gets set on it. */
function fakeSession() {
  const set: Record<string, Handler> = {};
  let userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) wowhead-gatherer/0.1.0 Chrome/138.0.7204.97 Electron/44.7.0 Safari/537.36';
  const session = {
    getUserAgent: () => userAgent,
    setUserAgent: (value: string) => {
      userAgent = value;
    },
    setPermissionRequestHandler: (handler: Handler) => {
      set.request = handler;
    },
    setPermissionCheckHandler: (handler: Handler) => {
      set.check = handler;
    },
    webRequest: {
      onBeforeRequest: (handler: Handler) => {
        set.beforeRequest = handler;
      },
    },
  };
  return { session: session as unknown as Session, set, userAgent: () => userAgent };
}

describe('configureWowheadSession', () => {
  it('says it is plain Chrome', () => {
    const fake = fakeSession();
    configureWowheadSession(fake.session);
    expect(fake.userAgent()).not.toMatch(/Electron|wowhead-gatherer/);
  });

  it.each(['media', 'notifications', 'geolocation', 'clipboard-read'])("refuses Wowhead's scripts the %s permission", (permission) => {
    const fake = fakeSession();
    configureWowheadSession(fake.session);
    const answers: boolean[] = [];
    (fake.set.request as (w: unknown, p: string, cb: (ok: boolean) => void) => void)(null, permission, (ok) => answers.push(ok));
    expect(answers).toEqual([false]);
    expect((fake.set.check as (w: unknown, p: string) => boolean)(null, permission)).toBe(false);
  });

  it("skips the hidden window's pictures but never the app's own requests", () => {
    const fake = fakeSession();
    configureWowheadSession(fake.session);
    const decide = (details: { webContentsId?: number; resourceType: string }) => {
      let cancel: boolean | undefined;
      (fake.set.beforeRequest as (d: unknown, cb: (r: { cancel: boolean }) => void) => void)(details, (r) => {
        cancel = r.cancel;
      });
      return cancel;
    };
    expect(decide({ webContentsId: 3, resourceType: 'image' })).toBe(true);
    expect(decide({ webContentsId: 3, resourceType: 'script' })).toBe(false);
    expect(decide({ resourceType: 'image' })).toBe(false);
  });
});
