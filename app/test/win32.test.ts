import { describe, expect, it } from 'vitest';

// Real Windows calls through koffi, so only on Windows.
describe.runIf(process.platform === 'win32')('win32', () => {
  it('reads the clipboard sequence number', async () => {
    const { clipboardSequence } = await import('../src/main/win32');
    expect(Number.isInteger(clipboardSequence())).toBe(true);
  });

  it('names the program in front', async () => {
    const { foregroundExeName } = await import('../src/main/win32');
    expect(foregroundExeName()).toMatch(/^$|\.exe$/i);
  });
});
