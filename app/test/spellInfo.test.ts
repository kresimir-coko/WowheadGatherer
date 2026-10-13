import { describe, expect, it } from 'vitest';
import { buildSpellInfo } from '../src/main/spellInfo';
import { parseZoneNames } from '../src/main/zones';
import { fixture } from './fixtures';

const zones = parseZoneNames(fixture('global-tbc.js.gz'));

describe('buildSpellInfo', () => {
  it('Arcane Shot: name, icon and every comment', () => {
    const spell = buildSpellInfo(27019, fixture('spell-27019.html.gz'), zones);
    expect(spell).toMatchObject({ kind: 'spell', name: 'Arcane Shot', quality: 1, icon: 'ability_impalingbolt', commentTotal: 29 });
    expect(spell?.comments).toHaveLength(29);
  });

  it('Aimed Shot, a talent', () => {
    expect(buildSpellInfo(27065, fixture('spell-27065.html.gz'), zones))
      .toMatchObject({ name: 'Aimed Shot', icon: 'inv_spear_07', commentTotal: 50 });
  });

  it('returns null when the page lacks the spell', () => {
    expect(buildSpellInfo(1, fixture('spell-27019.html.gz'), zones)).toBeNull();
  });
});
