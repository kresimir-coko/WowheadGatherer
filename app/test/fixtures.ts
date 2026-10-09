import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

/** A saved Wowhead file from test/fixtures, unzipped when its name ends in .gz. */
export function fixture(name: string): string {
  const data = readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
  return (name.endsWith('.gz') ? gunzipSync(data) : data).toString('utf8');
}
