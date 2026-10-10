import { describe, expect, it } from 'vitest';
import { parseQuestPage } from '../src/main/questPage';
import { fixture } from './fixtures';

describe('parseQuestPage', () => {
  it('reads the name and the chain, marking the quest on show (Fel Orc Scavengers)', () => {
    const page = parseQuestPage(fixture('quest-10482.html.gz'));
    expect(page.name).toBe('Fel Orc Scavengers');
    expect(page.chain).toEqual([
      { position: 1, quests: [{ id: 10160, name: 'Know your Enemy', current: false }] },
      { position: 2, quests: [{ id: 0, name: 'Fel Orc Scavengers', current: true }] },
      { position: 3, quests: [{ id: 10483, name: 'Ill Omens', current: false }] },
    ]);
    expect(page.data.comments).toHaveLength(21);
  });

  it('reads a long chain (Arrival in Outland, step 7 of 9)', () => {
    const { chain } = parseQuestPage(fixture('quest-10288.html.gz'));
    expect(chain).toHaveLength(9);
    expect(chain[0].quests[0]).toEqual({ id: 64028, name: 'A New Beginning', current: false });
    expect(chain[6]).toEqual({ position: 7, quests: [{ id: 0, name: 'Arrival in Outland', current: true }] });
    expect(chain.filter((step) => step.quests.some((quest) => quest.current))).toHaveLength(1);
  });

  it('has no chain when the page has no Series box (The Ring of Blood: The Final Challenge)', () => {
    const page = parseQuestPage(fixture('quest-9977.html.gz'));
    expect(page.name).toBe('The Ring of Blood: The Final Challenge');
    expect(page.chain).toEqual([]);
  });

  it('reads the German page in German', () => {
    const page = parseQuestPage(fixture('quest-de-10482.html.gz'));
    expect(page.name).toBe('Plünderer der Höllenorcs');
    expect(page.chain.map((step) => step.quests[0].name)).toEqual(['Den Feind kennen', 'Plünderer der Höllenorcs', 'Schwarze Magie']);
  });

  it('decodes entities and keeps every quest of a branching step', () => {
    const html = '<h1 class="heading-size-1">Lieutenant&#039;s Orders</h1>'
      + '<table class="series"><tr><th>1.</th><td><div><a href="/tbc/quest=1/a">Arms &amp; Armor</a></div>'
      + '<div><a href="/tbc/quest=2/b">Shields</a></div></td></tr>'
      + '<tr><th>2.</th><td><div><b>Lieutenant&#039;s Orders</b></div></td></tr></table>';
    const page = parseQuestPage(html);
    expect(page.name).toBe("Lieutenant's Orders");
    expect(page.chain).toEqual([
      { position: 1, quests: [{ id: 1, name: 'Arms & Armor', current: false }, { id: 2, name: 'Shields', current: false }] },
      { position: 2, quests: [{ id: 0, name: "Lieutenant's Orders", current: true }] },
    ]);
  });

  it('copes with a page that is not a quest page', () => {
    expect(parseQuestPage('<p>Nothing here</p>')).toMatchObject({ name: null, chain: [] });
  });
});
