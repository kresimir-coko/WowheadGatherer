import fs from 'node:fs';
import path from 'node:path';

interface Entry<T> {
  savedAt: number;
  value: T;
}

/** JSON files in one folder, each with the time it was saved. */
export class DiskCache {
  constructor(private readonly dir: string) {}

  /** The value saved under key, if it's younger than maxAgeMs. */
  get<T>(key: string, maxAgeMs: number, now = Date.now()): T | undefined {
    try {
      const entry = JSON.parse(fs.readFileSync(this.file(key), 'utf8')) as Entry<T>;
      if (typeof entry.savedAt !== 'number' || now < entry.savedAt || now - entry.savedAt > maxAgeMs) return undefined;
      return entry.value;
    } catch {
      return undefined;
    }
  }

  set<T>(key: string, value: T, now = Date.now()): void {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.writeFileSync(this.file(key), JSON.stringify({ savedAt: now, value } satisfies Entry<T>));
    } catch {
      // A cache that can't save just fetches again next time.
    }
  }

  /** Deletes the JSON files keep says no to (older versions), those older than maxAgeMs, and unreadable ones. */
  prune(keep: (fileName: string) => boolean, maxAgeMs: number, now = Date.now()): void {
    let names: string[];
    try {
      names = fs.readdirSync(this.dir);
    } catch {
      return;
    }
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      const file = path.join(this.dir, name);
      try {
        const entry = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<Entry<unknown>>;
        const stale = typeof entry.savedAt !== 'number' || now - entry.savedAt > maxAgeMs;
        if (!keep(name) || stale) fs.rmSync(file, { force: true });
      } catch {
        fs.rmSync(file, { force: true });
      }
    }
  }

  private file(key: string): string {
    return path.join(this.dir, `${key.replace(/[^a-z0-9-]/gi, '_')}.json`);
  }
}
