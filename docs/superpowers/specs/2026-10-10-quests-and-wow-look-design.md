# Wowhead Gatherer: quests and a WoW look

**Date:** 2026-10-10
**Author:** Krešimir Čoko (with Claude)
**Status:** Draft, awaiting review
**Builds on:** [2026-10-09-wowhead-gatherer-design.md](2026-10-09-wowhead-gatherer-design.md)

## Goal

Three changes the player asked for after the first build:

1. **Change the key to Ctrl+D.** Settled: keep the single Ctrl+C (see below).
2. **Make the popup look like the game's own panels.** The reference is a screenshot of the Serene add-on's settings window, which uses Blizzard's modern panel style.
3. **Quests.** Hover a quest, press Ctrl+C, and the popup shows the quest's chain and its best comments. This works in the quest log, on chat quest links, and in Blizzard's quest tracker. The add-on also loads in **WoW Forever** from now on, including Forever's tracker and quest log.

## Decisions taken with the player

- **The key stays Ctrl+C.** Add-ons can't write the clipboard. Only one of the game's edit boxes can, and only on Ctrl+C or Ctrl+X. A key binding can be anything, but on Ctrl+D the add-on could only select the link, not copy it. So one press of Ctrl+D would need the app to press C into the game, which is synthetic input; "Ctrl+D, then C" was offered too. The player chose to keep one Ctrl+C.
- **A quest popup shows the chain and the top comments.** It doesn't show the start and end NPCs, the objective or the rewards.
- **Where quests work:**
  - the quest log;
  - chat quest links;
  - Blizzard's tracker in TBC;
  - Blizzard's tracker and quest log in Forever.

  Questie's tracker is left out. (The player's Questie has its tracker on, which hides Blizzard's TBC tracker, so the TBC tracker path only helps with Questie's tracker off.)
- **Forever is written now**, against Blizzard's Forever code. It can't be tried before Forever launches on 2026-11-04.

## 1. The look

Only the app's popup changes. The add-on's own link box, the combat fallback, already uses the game's tooltip frame.

The popup copies the look of Blizzard's modern panels in CSS. It copies no Blizzard artwork into the app.

- **Frame:** a dark brown background, warmer in the middle (a radial gradient from about `#3b1f12` at the centre to `#130b07` at the edges). A 1 px gold-brown border (`#5c4a35`) with 6 px rounded corners, and a thin black line outside it.
- **Inset panels:** each source section, the quest chain and each comment sits in its own panel. Each panel has a slightly darker fill (black at about 25 %), a 1 px brown border (`#4a3a2a`) and 6 px corners, like Serene's "Modules" box.
- **Text:**
  - Titles and section headings are in the game's gold (`#ffd100`).
  - Rows are white, with their details in a muted parchment tone (`#b5a98f`).
  - Item names keep their quality colours. Quest names are gold.
- **Buttons:**
  - "Open on Wowhead" is a red button: a dark red gradient (`#a01010` → `#5a0505`), a thin gold-grey rim, gold text, and lighter on hover.
  - Close is a small square red button with a gold ×.
- **Font:** the game's Friz Quadrata is a paid font, and the client keeps it inside its game data, not as a loose file. So the app bundles **Marcellus** instead: free under the SIL Open Font License, with the same chiselled serifs.
  - It goes in `app/static/fonts/` with its licence.
  - The page's Content Security Policy gains `font-src 'self'`.
  - Fallbacks: `Georgia, serif`.
- **Scrollbar:** thin, with a dark brown track and a gold-brown thumb.

The look is checked by rendering the popup to an image and comparing it with the reference, and finally by the player.

## 2. Quests in the add-on

### What's under the cursor

`ns.GetHovered()` replaces `ns.GetHoveredItem()`. It returns a kind (`"item"` or `"quest"`), an ID and, when known, a name or link. It checks these in order:

1. **Item tooltips**, exactly as today: a hovered `ItemRefTooltip`, then `GameTooltip`.
2. **Chat quest links.** A hook on `ItemRefTooltip:SetHyperlink` remembers the quest ID when the link is `quest:<id>:…`, and forgets it for any other link. The quest counts while `ItemRefTooltip` is shown and under the cursor. This is the same rule chat item links follow.
3. **Quest log titles.** Blizzard announces these hovers through `EventRegistry`:
   - **TBC:** `"QuestLogFrame.MouseOver"` with `(button, logIndex)`. It fires for every title, in a group or not (Blizzard_UIPanels_Game/TBC/QuestLogFrame.lua, `QuestLog_UpdatePartyInfoTooltip`). It also fires for Leatrix's taller quest log, which reuses Blizzard's title buttons.
   - **Forever:** `"QuestMapLogTitleButton.OnEnter"` with `(button, questID)` (Mainline/QuestMapFrame.lua, build 1.60.1.70338).

   The add-on remembers the button. The quest counts while that button is shown and under the cursor. The quest is read from the button when it's used, not from the event, so scrolling with the wheel is followed:
   - in TBC, `GetQuestLogTitle(button:GetID() + FauxScrollFrame_GetOffset(QuestLogListScrollFrame))`, where a header has no quest;
   - in Forever, `button.questID`.
4. **The tracker.**
   - **TBC.** The tracker's lines are FontStrings (`QuestWatchLine1` … `QuestWatchLine30`) that don't take the mouse, so Blizzard announces nothing. A post-hook on `QuestWatch_Update` maps each shown line to its quest. It follows Blizzard's own count: for each watch `i`, `GetQuestIndexForWatch(i)`; for a quest with objectives, one title line, then one line per objective. On a lookup, the first shown line under the cursor gives the quest, if `QuestWatchFrame` is visible. Lines are checked with `IsMouseOver()`, which every region has (`SimpleScriptRegionAPI`).
   - **Forever.** Blizzard announces `"OnQuestBlockHeader.OnEnter"` with `(block, questID)` (Blizzard_ObjectiveTracker/Blizzard_QuestObjectiveTracker.lua). The quest counts while that block is under the cursor, read from `block.id`.

The URL comes from `ns.BuildURL(kind, id, projectID, locale)`, e.g. `https://www.wowhead.com/tbc/quest=10482`. `ns.BuildItemURL` stays as a thin wrapper.

### One-press copy

- **Same keys:** hold Ctrl over a quest, then press C. Pressing Ctrl readies whatever `GetHovered()` finds. Entering a quest log title or a Forever tracker header while Ctrl is held readies it too, through the same events, just as `OnTooltipSetItem` does for items.
- **TBC tracker:** its lines announce nothing, so there you hover first and then press Ctrl.
- **Letting go:**
  - **Items:** unchanged; the item tooltip closing lets go.
  - **Quests** have no tooltip that closes. While a quest is readied, the ready box checks on each frame that the quest's button, line or tooltip is still under the cursor. Once it isn't, the box lets go. That isn't the "let go until Ctrl is pressed again" of other keys, so moving back onto a quest log title re-readies it.
- **Unchanged rules:**
  - Nothing is readied in combat, while typing, or over an action button.
  - Any key other than C lets go.

### The fallback link box

The binding and the double Ctrl+C box handle quests too.

- **Contents:** the box shows the quest icon (`Interface\GossipFrame\AvailableQuestIcon`) and the quest's name. The name comes from the quest log, the tracker or the link text; otherwise it's "Quest 10482".
- **Text changes:**
  - The binding's name becomes "Look up hovered item or quest".
  - The "nothing hovered" message becomes "Hover over an item or quest to look it up on Wowhead."
  - The `.toc` Notes say "item or quest".

### Loading in Forever

- **The `.toc`:** `## Interface: 20506, 16001`. Forever hasn't published its interface number yet; 16001 is a guess from build 1.60.1. The player checks it at launch with `/dump select(4, GetBuildInfo())`, and a wrong number only means the "load out of date add-ons" box must be ticked until it's fixed.
- **Existing code:** it already takes the mainline paths when they exist (`TooltipUtil`, `TooltipDataProcessor`). As part of the work, every global the add-on uses is checked against the `forever` branch's API documentation, and any gap gets a guarded fallback.
- **The app** already treats `Wow.exe` and `WowClassic.exe` as the game, and accepts the `/forever/` path.

## 3. Quests in the app

### Links

`parseWowheadLink` accepts `…/quest=<id>` as well as `…/item=<id>`. `WowheadLink` gets `kind: 'item' | 'quest'`, and `itemId` becomes `id`. Everything else about links is unchanged: the site path, then the language, 300 characters at most, and an anchored match.

### Reading a quest page

`parseQuestPage(html)` reads, from `https://www.wowhead.com/<site>/<lang>/quest=<id>`:

- **Name:** the page heading `<h1 class="heading-size-1">…</h1>`, which is in the page's language, with HTML entities decoded. The Gatherer data can't be trusted for the name, because the German page carries both `name_enus` and `name_dede` entries for the same quest.
- **Icon:** the Gatherer quest entry's `icon` (`quest-start`), or none.
- **Chain:** the "Series" box, `<table class="series">`.
  - Each row is a step: its number from `<th>`, then each `<div>` in the `<td>` is one quest.
  - A quest is either a link (`<a href="…/quest=<id>/…">Name</a>`) or, for the quest on show, bold (`<b>Name</b>`).
  - A step with more than one quest shows them joined with " or ". None of the saved pages has such a step, so a made-up page covers it.
  - No box means no chain.
- **Comments:** `lv_comments0`, picked and trimmed exactly as for items.

`isCompleteItemPage` becomes `isCompletePage`, with the same check: every saved quest page has Gatherer data and a Listview. The unknown-quest page has both too, but its 404 is caught first.

### Shapes

- `ItemInfo` gets `kind: 'item'`.
- New: `QuestInfo { kind: 'quest', name, icon, chain: ChainStep[], comments, commentTotal }`.
- New: `ChainStep { position: number, quests: { name: string, current: boolean }[] }`.
- The `ready` state carries `ItemInfo | QuestInfo`.
- The error header becomes `{ kind, name, quality, icon }`.

### The client

- **One lookup for both kinds.** `WowheadClient.lookup` picks the reader by `link.kind`.
- **Cache:**
  - Keys are `<kind>-v2-<site>-<lang>-<id>`. The version goes to 2 because cached item entries have no `kind`.
  - Entries stay fresh for a day, as before.
- **Error header:** when the page can't be read, the header comes from the tooltip service, `nether.wowhead.com/<site>[/<lang>]/tooltip/quest/<id>`, which answers `{"name": …}`. It was checked on quest 10482.
- **Messages:**
  - "Wowhead doesn't know quest 999999." Wowhead answers an unknown quest with a 404, as it does for items.
  - "Wowhead didn't let the app read this page."
  - The others are unchanged.

### The popup

- **Header:** the quest icon and the name in gold, with "Open on Wowhead" and close.
- **Quest chain:** a numbered list such as "1. Know your Enemy", "2. Fel Orc Scavengers", "3. Ill Omens". The quest on show is gold and bold; the others are white.
- **Comments:** after the chain, as for items.
- **Empty pages:** a quest with no chain shows only its comments. With neither: "Wowhead lists no chain or comments for this quest."

## Testing

- **Saved pages** in `app/test/fixtures/`, fetched once on 2026-10-10 through Electron's network stack:

  | File | Why |
  |---|---|
  | `quest-10482.html.gz` | Fel Orc Scavengers: step 2 of a 3-step chain, 21 comments. |
  | `quest-10288.html.gz` | Arrival in Outland: step 7 of 9, 3 comments. |
  | `quest-9977.html.gz` | The Ring of Blood: The Final Challenge: no Series box, 101 comments. |
  | `quest-de-10482.html.gz` | The German page: German heading and chain names. |
  | `quest-999999.html.gz` | An unknown quest: the 404 page. |
  | `tooltip-quest-10482.json` | The tooltip service's answer for a quest. |

  The tests never fetch Wowhead.
- **Add-on (pytest + lupa):** fakes for `EventRegistry`, the quest log title buttons and `FauxScrollFrame_GetOffset`, `GetQuestLogTitle`, the watch lines and `GetQuestIndexForWatch`, and `ItemRefTooltip:SetHyperlink`. They cover:
  - each of the four places;
  - scrolling;
  - headers;
  - letting go when the cursor leaves;
  - the Forever events.
- **App (Vitest):** links, the quest reader on every saved page, the client (cache, 404, blocked, tooltip header) and the popup's rendering.
- **The look:** rendered to an image with a throwaway script and compared with the reference screenshot. The player makes the final call.

## Not in this change

- Questie's tracker, NPCs, spells and zones.
- A quest's start and end NPCs, objective and rewards.
- Ctrl+D, and any input sent to the game.
- Trying Forever before its launch.

## Player checks after the build

- **Quest log:** hover a quest title, press Ctrl+C, and the popup shows its chain and comments. Scroll with the wheel while hovering, press Ctrl+C, and it's the new quest under the cursor.
- **Chat link:** click a chat quest link, hover the box that opens, and press Ctrl+C.
- **TBC tracker:** with Questie's tracker off, hover a tracked quest's title or objective, then press Ctrl+C.
- **Letting go:** hold Ctrl over a quest title, move off it, and press 1. Your Ctrl+1 binding fires.
- **The look:** the popup matches the game's panels, and the font reads well at its size.
- **Forever (after 2026-11-04):**
  - `/dump select(4, GetBuildInfo())`, so the `.toc`'s number can be fixed.
  - The quest log and tracker hovers work.
