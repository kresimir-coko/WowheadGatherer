import { parseWowheadLink, type WowheadLink } from '../shared/wowheadLink';

export interface WatcherDeps {
  clipboardSequence(): number;
  foregroundExeName(): string;
  /** Electron's clipboard answers with a promise; tests answer at once. */
  readClipboardText(): string | Promise<string>;
  onLink(link: WowheadLink): void;
  /** Called on every check with whether the game is in front, so the popup can hide when it isn't. */
  onForeground?(gameInFront: boolean, exeName: string): void;
}

/** WoW's program names, in lower case: Classic clients (TBC Anniversary is WowClassic.exe), retail, and their test builds. */
export const GAME_EXE_NAMES = new Set(['wowclassic.exe', 'wowclassict.exe', 'wowclassicb.exe', 'wow.exe', 'wowt.exe', 'wowb.exe']);

/** How often the clipboard is checked, in milliseconds. */
const CHECK_INTERVAL_MS = 100;

export function isGame(exeName: string): boolean {
  return GAME_EXE_NAMES.has(exeName.toLowerCase());
}

/** Turns a Wowhead item link copied while the game is in front into a lookup. */
export class ClipboardWatcher {
  private lastSequence: number;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly deps: WatcherDeps) {
    // Whatever is on the clipboard at start was copied before; it isn't a lookup.
    this.lastSequence = deps.clipboardSequence();
  }

  tick(): void {
    const exeName = this.deps.foregroundExeName();
    const gameInFront = isGame(exeName);
    this.deps.onForeground?.(gameInFront, exeName);
    const sequence = this.deps.clipboardSequence();
    if (sequence === this.lastSequence) return;
    this.lastSequence = sequence;
    if (!gameInFront) return;
    const text = this.deps.readClipboardText();
    if (typeof text === 'string') {
      this.read(text);
    } else {
      text.then(
        (value) => this.read(value),
        () => {
          // Another program held the clipboard; this copy is missed, the next one isn't.
        },
      );
    }
  }

  private read(text: string): void {
    const link = parseWowheadLink(text);
    if (link) this.deps.onLink(link);
  }

  start(intervalMs = CHECK_INTERVAL_MS): void {
    this.stop();
    this.timer = setInterval(() => this.tick(), intervalMs);
  }

  stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }
}
