# Wowhead Gatherer: design

**Date:** 2026-10-09
**Author:** Krešimir Čoko (with Claude)
**Status:** Draft, awaiting review

## Goal

Hover any item in World of Warcraft, press **Ctrl+C once**, and a popup appears beside the cursor, over the game, with what Wowhead knows about where the item comes from (drops with their chances, vendors, quests, crafting, containers, gathering) and its best comments. One button opens the item's Wowhead page in the browser.

It's a third-party tool in the spirit of Awakened PoE Trade, which takes its mechanics from it (a key in game, an overlay popup), and **nothing to do with trading or prices**.

It targets **Burning Crusade Anniversary** (client 2.5.6, `## Interface: 20506`) on Windows 11. It replaces the Wowhead Lookup add-on, which it starts from.

## What the add-on can't do, and how the app gets round it

An add-on can't write the clipboard, open a browser, use the network, or write files while the game runs:

- `CopyToClipboard` and `LaunchURL` are `HasRestrictions = true` (checked in `Blizzard_APIDocumentationGenerated/OsDocumentation.lua` and `URLDocumentation.lua`, branch `classic_anniversary`, build 2.5.6.69795).
- SavedVariables are only written at `/reload` and logout.

So the work splits into two halves that meet at the clipboard:

```
 WoW (add-on)                                Windows                    Wowhead Gatherer (app)
 ─────────────                               ───────                    ──────────────────────
 Ctrl goes down over an item
   → hidden edit box gets the item's link,
     selected, with keyboard focus
 C goes down
   → the game's own edit box copies it  ──►  clipboard changes  ──►  WowClassic.exe in front + Wowhead item link?
                                                                        → popup by the cursor ("Looking it up…")
                                                                        → fetch + read the Wowhead page (cached a day)
                                                                        → popup shows sources and comments
```

The player's own keypress copies the text, through the game's own edit box. The app never sends input to the game, never reads its memory and never reads the screen.

### Ways of getting the item out that were considered

| Way | Presses | Verdict |
|---|---|---|
| **Readied copy:** holding Ctrl over an item focuses a hidden edit box holding the link, so C copies it | 1 (Ctrl+C) | **Chosen.** Only the player's input, through the game's own edit box. Needs an in-game check (Task 2 is the gate). |
| Today's Wowhead Lookup popup: Ctrl+C opens a box, a second Ctrl+C copies | 2 | Kept as the fallback: in combat, over action buttons, when the option is off, or if the readied copy fails in game. |
| The app sends Ctrl+C to the game on its own hotkey (how Awakened PoE Trade reads Path of Exile items) | 1 | Rejected. That's injected input, and Blizzard bans input broadcasting in WoW ([policy](https://worldofwarcraft.blizzard.com/en-us/news/23558957/policy-update-for-input-broadcasting-software)). |
| A pixel beacon: the add-on draws a coloured code, and the app reads the screen | 1 | Rejected. It's fragile (UI scale, HDR, colour profiles) and it's how pixel bots work. |
| Chat log or SavedVariables files | n/a | Rejected. SavedVariables are only written at `/reload` or logout; the chat log needs a server round trip and is buffered. |

### The readied copy's trade-off

Key bindings don't fire while an edit box has focus. While Ctrl is held over an item, a Ctrl+key binding would reach the hidden box instead. So:

- it's never readied **in combat**, **while another edit box has focus** (chat, a search box, the link popup) or **over an action button**;
- **any key other than C** lets the focus go at once, though that one press is used up;
- it can be turned off ("Copy with one Ctrl+C").

When it isn't readied, the lookup key (Ctrl+C by default) opens Wowhead Lookup's link popup as before.

## Research findings

### TBC Anniversary client (verified against `Gethe/wow-ui-source`, branch `classic_anniversary`, 2.5.6.69795)

- `MODIFIER_STATE_CHANGED` exists, with payload `key` (e.g. `"LCTRL"`) and `down` (1 or 0) (`KeyBindingsDocumentation.lua`).
- `GetCurrentKeyBoardFocus()` exists on 2.5.6 (the DialogueUI add-on uses it there).
- Action buttons keep their slot in `self.action` (`Blizzard_ActionBar/Shared/ActionButton.lua`).
- Item tooltips: Classic clients have `TooltipDataProcessor`, but their own tooltips only run the old scripts. So hook `OnTooltipSetItem` unless `GameTooltip.GetPrimaryTooltipData` exists. Questie makes exactly this check, and Leatrix Plus and Syndicator hook `OnTooltipSetItem` on this client.
- The game's program is `WowClassic.exe`. On this PC its window runs in Windowed (Fullscreen) mode (`GxMaximize 1`), so an always-on-top window can draw over it. Exclusive full screen would hide the popup.

### Wowhead (live requests, 2026-10-08 and 09)

| What | Address | Notes |
|---|---|---|
| Item page | `https://www.wowhead.com/tbc/item=<id>` | Has everything: inline `WH.Gatherer.addData(type, env, {...})` (names, quality, icons of everything mentioned), `new Listview({id: '...', data: [...]})` tables, and `var lv_comments0 = [...]`. **Protected by AWS WAF/CloudFront**: plain requests get 403, a full set of browser headers got 200 about nine times, then that IP got 403 for everything. |
| Unknown item | same | HTTP 404, redirected to `/tbc/items?notFound=<id>`. |
| Tooltip service | `https://nether.wowhead.com/tbc[/de]/tooltip/item/<id>` | JSON `{name, quality, icon, tooltip}`, not blocked, meant for third-party use. Also `spell`, `npc`, `quest`, `object`, and `/forever/`. 404 `{"error":"ID is out of range"}` for unknown IDs. |
| Zone names | `https://nether.wowhead.com/tbc/data/global` | `WH.setPageData("wow.area.names", {"3457":"Karazhan",...})`, 168 TBC zones. Not blocked. |
| Icons | `https://wow.zamimg.com/images/wow/icons/large/<icon>.jpg` | |

Source tables seen on item pages (Listview `id`: what each row holds):

- `dropped-by` (NPC: `name`, `location` [zone IDs], `count`, `outof`, `classification`, `boss`)
- `sold-by` (NPC: `name`, `location`, `cost` = `[[copper, currencies, [[itemId, count], ...]]]`, `react` = `[alliance, horde]` with 1 = friendly)
- `reward-from-q` (quest: `name`, `level`, `side` 1 Alliance / 2 Horde / 3 both)
- `created-by-spell` (spell: `name`, `reagents` = `[[itemId, count], ...]`)
- `contained-in-item`, `contained-in-object`, `mined-from-object`, `fished-in`, `pick-pocketed-from` (`name`, `location`, `count`, `outof`)
- Expected but **unverified**: `gathered-from-object` (herbs) and `skinned-from`. A wrong guess just hides that section; Task 10 checks them in game.

Comments: `body` (Wowhead markup: `[b] [i] [u] [small] [quote] [ul] [li] [url=…] [item=…] [npc=…] [quest=…] [spell=…] [zone=…] [money=…]` and others), `rating`, `date`, `user` (a number for early-days authors), `indent` (replies > 0), `sticky`, `deleted`.

What it costs to read: one page (70–830 KB) per lookup, which is why results are cached.

### Overlays

Awakened PoE Trade is Electron + Vue. It uses libuiohook for hotkeys and sends Ctrl+C to the game, then reads the clipboard; it needs the game in windowed or borderless mode. Wowhead Gatherer keeps the Electron overlay idea and drops the hotkey and the injected keys.

## Design

### Add-on (repo root, from Wowhead Lookup)

Wowhead Lookup's files are copied and renamed (`WowheadLookup` → `WowheadGatherer`, `/whl` → `/whg`, `WOWHEADLOOKUP` → `WOWHEADGATHERER`), and one file is added:

- `ReadyCopy.lua`: `ns:ReadyCopy()`, `ns:UnreadyCopy()`, `ns:CanReadyCopy()`, `ns:GetReadyURL()`, `ns:InitializeReadyCopy()`, and the event handlers `ns:MODIFIER_STATE_CHANGED(key, down)` and `ns:PLAYER_REGEN_DISABLED()`.
  - Ctrl (or Cmd) down → ready the hovered item's link. Up → let go.
  - `GameTooltip` shows another item while Ctrl is held → ready that one instead. `GameTooltip` hides → let go.
  - In the box: C with Ctrl copies, and says "Wowhead link copied." Another modifier changes nothing. Any other key lets go, and so do Escape and entering combat. Typing can't change the link.
- New saved setting `readyCopy` (default on), with an options checkbox "Copy with one Ctrl+C".
- `ns.MODIFIER_KEYS` (from Popup.lua) is shared.

### App (`app\`, Electron + TypeScript)

| File | Role |
|---|---|
| `src/shared/wowheadLink.ts` | `parseWowheadLink(text)`: the link contract (`https://www.wowhead.com/[site/][lang/]item=<id>[/slug]`), or null. |
| `src/shared/types.ts` | `ItemInfo`, `SourceSection`, `SourceRow`, `ItemComment`, `MarkupNode`, `ItemHeader`, `PopupState`. |
| `src/shared/money.ts` | `formatMoney(copper)` → `"1g 23s 45c"`. |
| `src/main/wowheadPage.ts` | `parseItemPage(html)` → gatherer data, Listviews, raw comments; `sliceBracketed`. |
| `src/main/zones.ts` | `parseZoneNames(script)`. |
| `src/main/markup.ts` | `parseMarkup(body, nameOf)` → safe `MarkupNode[]` (600 characters at most). |
| `src/main/comments.ts` | `pickComments(page, nameOf)`: the 3 best top-level comments (pinned first, then rating). |
| `src/main/itemInfo.ts` | `buildItemInfo(itemId, page, zones)`: sections, row details, sorting, 5 rows each. |
| `src/main/cache.ts` | `DiskCache`: JSON files with a save time. |
| `src/main/wowheadClient.ts` | `WowheadClient.lookup(link)` → `PopupState`; the fetch, browser fallback, cache and tooltip-header fallback; `withTimeout`. |
| `src/main/win32.ts` | koffi calls: `clipboardSequence()`, `foregroundExeName()`. |
| `src/main/clipboardWatcher.ts` | `ClipboardWatcher` (polls the clipboard sequence number every 100 ms); `isGame(exe)`. |
| `src/main/placement.ts` | `placePopup(cursor, size, workArea)`. |
| `src/main/userAgent.ts`, `latestOnly.ts`, `trayIcon.ts` | Small pure helpers for the Electron shell. |
| `src/main/browserFetch.ts` | `fetchText` (Electron session fetch) and `loadInBrowser` (hidden window), sharing the `persist:wowhead` session. |
| `src/main/popupWindow.ts` | `Popup`: the always-on-top, non-focusable window; `open`, `update`, `hide`; Escape while shown. |
| `src/main/main.ts` | Wiring, the tray icon (Quit), single instance. |
| `src/preload/preload.ts` | The `window.gatherer` bridge: `onState`, `close`, `openWowhead`, `reportHeight`. |
| `src/renderer/popup.ts`, `static/popup.html`, `static/popup.css` | Rendering, all text through `textContent`. |

### What the popup shows

- **Header:** icon, name in its quality colour, "Open on Wowhead", × (and Escape).
- **Sections, in this order, only when Wowhead has rows:** Dropped by · Sold by · Quest reward · Crafted with · Contained in (items and objects together) · Mined from · Gathered from · Skinned from · Fished in · Pickpocketed from.
  - Each row: the name, then details joined with " · ".
    - Chance rows: up to 2 zones, then "+N", then the chance.
    - Vendors: zone, price (money and/or "50 × Badge of Justice"), "Alliance" or "Horde" when only one side can buy.
    - Quests: "Level N", and the side.
    - Crafting: the reagents, e.g. "6 × Netherweave Cloth".
  - Chance = count ÷ outof: ≥10% whole numbers, ≥1% one decimal, ≥0.01% two decimals, below that "<0.01%".
  - Chance sections are sorted by chance, but rows Wowhead saw fewer than **20** times go last, so "2 of 2 kills = 100%" doesn't top Netherweave Cloth.
  - Vendors, quests and recipes keep Wowhead's order.
  - 5 rows per section, then "+N more on Wowhead".
- **Comments (N):** the 3 best top-level comments, pinned first, then by rating, each cut at 600 characters, with "★ rating · user · Feb 2007". Authors Wowhead knows only by number are left out.
- **States:**
  - "Looking it up on Wowhead…"
  - "Wowhead doesn't know item N."
  - "Couldn't reach Wowhead. Check your internet connection."
  - "Wowhead didn't let the app read this item's page. Open it on Wowhead instead." (with the name and icon from the tooltip service)
  - "Wowhead's page looks different from what the app knows…" (also with the name and icon)
  - "Wowhead lists no sources or comments for this item."

### Behaviour

- **Lookups:** only a clipboard change while `WowClassic.exe` (or another WoW client program) is in front counts. A link already on the clipboard at start doesn't, and nor does a link copied in the browser.
- **The popup:** placed right of the cursor, or left when that runs off the screen, clamped to the screen. Its height fits its content, from 96 to 560 px, and it scrolls beyond that. It never takes focus from the game.
  - Escape (only while it's shown), ×, "Open on Wowhead" or switching to another program hides it.
  - A newer lookup replaces it, and a late answer to an older lookup is dropped.
- **Fetching:**
  1. The item page goes through Electron's session fetch (Chromium's own network stack) with a plain Chrome user agent.
  2. If the answer isn't a 200 with item data, the page is loaded in a hidden window on the same session. That window passes Wowhead's bot check like any browser, and the cookie it earns helps later fetches. It skips images, fonts, stylesheets and media.
  3. The 404 / `notFound=` answer means an unknown item.
- **Cache:** items stay fresh for 24 h (keyed by game, language and ID) and zone names for 7 days, as JSON in `%APPDATA%\Wowhead Gatherer\cache`.
- **Politeness:** one page per lookup, at the pace of the player's key presses. Nothing is fetched in the background.

## Testing

- **Add-on:** pytest + lupa (Lua 5.1 with WoW stubs), as in Wowhead Lookup, plus `tests/test_ready_copy.py`.
- **App:** Vitest.
  - The pure modules are tested against **saved Wowhead pages** in `app/test/fixtures`: Gorehowl 28773, Netherweave Cloth 21877, Refreshing Spring Water 159, Bolt of Netherweave 21840, Fel Iron Ore 23424, Faceguard of Determination 32083, Thunderfury 19019, the not-found page for 999999, the TBC zone script and Gorehowl's tooltip JSON.
  - The renderer is tested in happy-dom.
  - koffi gets a Windows-only smoke test.
- **In game:**
  - Task 2's check is the gate for the readied copy.
  - Task 10 checks the whole thing: the overlay over the game, Escape, alt-tab, the browser, offline, and the unverified gathering and skinning tables.

## Out of scope (backlog)

- Spells, NPCs, quests and objects (the tooltip service supports them; the add-on would read spell and unit tooltips).
- The full tooltip (stats) in the popup.
- Localised zone names (they're English for every language for now).
- Starting with Windows, an installer and auto-update.
- The WoW Forever port: its program name and Wowhead's `/forever/` pages. The add-on's `Url.lua` already knows `/forever/`.
- Prices, auctions and anything to do with trading (explicitly not wanted).
