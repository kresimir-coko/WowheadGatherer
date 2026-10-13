# Wowhead Gatherer: spells

**Date:** 2026-10-13
**Author:** Krešimir Čoko (with Claude)
**Status:** Approved in chat ("go"); the player asked to carry straight on to the build and the push
**Builds on:** [2026-10-10-popup-navigation-design.md](2026-10-10-popup-navigation-design.md)

## Goal

Hover a spell in the spell book, press Ctrl+C once, and the popup shows the spell's best comments. **WoW Forever comes first:** it's the client the add-on is being built for. The player tests in TBC Anniversary, so TBC must work too. Then:
- version 0.3.0;
- rebuild the program;
- push the feature branch.

## Decisions taken with the player

- **The popup shows the spell's top comments only:** the best 3, then "Show 5 more comments". There are no trainers, ranks or tooltip text.
- **Push** the feature branch `feat/wowhead-gatherer`. `main` stays as it is.

## 1. The add-on

### Reading a spell from a tooltip

A spell counts wherever the game's tooltip shows one. Mainly that's the spell book, but anything else that shows a real spell tooltip counts too. The ID is the exact rank hovered.

- **Forever (mainline family).**
  - **The spell book:** Blizzard_PlayerSpells/SpellBook/Blizzard_SpellBookItem.lua shows a spell with `tooltip:SetSpellBookItem(slotIndex, spellBank)`. That gives the tooltip `Enum.TooltipDataType.Spell` (1) data.
  - **Reading it:** `TooltipUtil.GetDisplayedSpell(tooltip)` returns `name, id` (Blizzard_SharedXMLGame/Tooltip/TooltipUtil.lua).
  - **Readying while Ctrl is held:** `TooltipDataProcessor.AddTooltipPostCall(Enum.TooltipDataType.Spell, …)`, alongside the item one.
- **TBC Anniversary.**
  - **The spell book:** Classic/SpellBookFrame.lua shows a spell with `GameTooltip:SetSpellBookItem(slot, bookType)`. That fires the `OnTooltipSetSpell` script, which the client's UI.xsd lists.
  - **Reading it:** `TooltipUtil` doesn't exist there, so the spell comes from `tooltip:GetSpell()`. Modern clients return `name, spellID`; older ones return `name, rank, spellID`. The add-on takes the last value that is a number, so both work.
  - **Readying while Ctrl is held:** `GameTooltip:HookScript("OnTooltipSetSpell", …)`, alongside `OnTooltipSetItem`.
- **Which tooltips:** `ItemRefTooltip` (while hovered, for chat spell links) and `GameTooltip`, the same two that items use.

### What's under the cursor

- **Lookup:** `ns.GetHovered()` checks **items, then spells, then quests**.
- **The URL:** `ns.BuildURL("spell", id, …)`, e.g. `https://www.wowhead.com/forever/spell=27019`.
- **One-press copy:** the same rules as for items.
  - Never in combat or while typing.
  - Off over action bar buttons, because Ctrl+number is a key binding there. The double Ctrl+C link box still works over them.
  - A spell tooltip that refreshes while Ctrl is held re-readies only until another key has been pressed (the existing let-go rule).

### The fallback link box

- **Icon:** `C_Spell.GetSpellTexture(id)` in Forever, `GetSpellTexture(id)` in TBC.
- **Name:** the tooltip's name. Otherwise `C_Spell.GetSpellName(id)` in Forever or `GetSpellInfo(id)` in TBC. Otherwise "Spell 27019".

### Texts

- **The binding:** "Look up hovered item, quest or spell".
- **The flash when nothing is hovered:** "Hover over an item, quest or spell to look it up on Wowhead."
- **The login line, the options page and the `.toc` Notes:** they name spells too.

## 2. The app

- **Links:** `parseWowheadLink` accepts `…/spell=<id>`, and `LookupKind` gains `'spell'`.
- **`SpellInfo`:** `{ kind: 'spell', name, quality: 1, icon, comments, commentTotal }`, which joins `LookupInfo`.
- **Reading a spell page:** `buildSpellInfo(spellId, html, zones)`.
  - It reads the page's Gatherer data and comments as for items.
  - **Name:** the page heading, so it's in the page's language. Failing that, the Gatherer name.
  - **Icon:** the Gatherer icon.
  - **No data:** null when the page has no Gatherer entry for the spell, which gives the existing "page looks different" error.
- **The client:**
  - It picks the spell reader by `link.kind`.
  - Saved under `spell-v3-…`, a day as for the others.
  - **When the page can't be read:** the tooltip service's `tooltip/spell/<id>` gives the header's name and icon, as checked on Arcane Shot.
- **The popup:**
  - **The name:** white, like a spell name in the game's tooltip (quality 1).
  - **Comments:** with "Show 5 more comments". If there are none: "Wowhead lists no comments for this spell."
  - **Nothing clickable:** no quest links, and nothing in the breadcrumb logic.
  - **The fallback name:** "Spell 27019".

## 3. Release

- **Version 0.3.0:** in `app/package.json` (with its lock file) and `WowheadGatherer.toc`.
- **The program:** rebuild `app/release/Wowhead Gatherer 0.3.0.exe`.
- **Push:** `git push origin feat/wowhead-gatherer`.
  - Git's stored GitHub sign-in was rejected on 2026-10-13. If the push fails for that reason, the player signs in and pushes.
  - Never a force push.

## Testing

- **Saved pages** (fetched once on 2026-10-13 through a hidden browser window, after Wowhead lifted a temporary block):
  - `spell-27019.html.gz`: Arcane Shot, 29 comments;
  - `spell-27065.html.gz`: Aimed Shot, a talent, 50 comments;
  - `tooltip-spell-27019.json`.
- **Add-on tests:**
  - spells read in TBC (both `GetSpell` return shapes) and in Forever (tooltip data);
  - the order items › spells › quests;
  - readying on the spell tooltip hook in both clients;
  - the fallback box's icon and name in both clients;
  - the texts.
- **App tests:** links, the spell reader on both pages, the client (ready, tooltip header), the popup (white name, comments, empty message), `pageName` ("Spell 27019"), and that no spell is clickable.

## Player checks

- **TBC:** in the spell book, hold Ctrl over Arcane Shot and press C. The popup shows Arcane Shot's comments. Also try a talent spell, and a spell on an action bar (the double Ctrl+C link box).
- **Forever, after launch:** the same in the new spell book.
