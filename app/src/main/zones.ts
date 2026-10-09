import { sliceBracketed } from './wowheadPage';

/** Zone ID → name. */
export type ZoneNames = Map<number, string>;

const AREA_NAMES = /WH\.setPageData\(["']wow\.area\.names["'],\s*\{/;

/** Reads the zone names from Wowhead's data/global script. */
export function parseZoneNames(script: string): ZoneNames {
  const zones: ZoneNames = new Map();
  const match = AREA_NAMES.exec(script);
  if (!match) return zones;
  const text = sliceBracketed(script, match.index + match[0].length - 1);
  if (text === null) return zones;
  try {
    for (const [id, name] of Object.entries(JSON.parse(text) as Record<string, unknown>)) {
      if (typeof name === 'string') zones.set(Number(id), name);
    }
  } catch {
    // An unreadable table means rows without zone names, not a failed lookup.
  }
  return zones;
}
