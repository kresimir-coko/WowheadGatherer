# Wowhead Gatherer: project notes

By Krešimir Čoko. Hover any item or quest in World of Warcraft and press **Ctrl+C once**. A popup beside the cursor, over the game, shows what Wowhead knows: for an item, its sources (drops with chances, vendors, quests, crafting, containers, gathering); for a quest, its chain; for both, the best comments, with quests in a chain or an item's Starts quest / Needed for lists clickable, and a breadcrumb back, with a button that opens the Wowhead page. It's mechanically inspired by Awakened PoE Trade, and has **nothing to do with trading or prices**.

It targets **Burning Crusade Anniversary** (2.5.6) on Windows 11, and also loads in **WoW Forever** (`## Interface: 20506, 16001`; 16001 is a guess until Forever launches on 2026-11-04, so check `/dump select(4, GetBuildInfo())` there). It replaces the Wowhead Lookup add-on it started from. Designs: `docs/superpowers/specs/2026-10-09-wowhead-gatherer-design.md` and `docs/superpowers/specs/2026-10-10-quests-and-wow-look-design.md`; plans in `docs/superpowers/plans/`.

## Two halves, one contract

- **The add-on** (repo root). Holding Ctrl over an item or quest readies its Wowhead link in a hidden, focused edit box, so C copies it with the game's own edit box. When that isn't possible (combat, action buttons, typing, option off), the lookup key opens Wowhead Lookup's link popup instead.
- **The app** (`app\`, Electron + TypeScript). Watches the clipboard while `WowClassic.exe` is in front, reads the item's or quest's Wowhead page and shows the popup.
- **The contract** is the link: `https://www.wowhead.com/[site/][lang/]<item|quest>=<id>`, with the language **after** the site. Change it on both sides or neither.

## Hard limits

- Add-ons **can't write the clipboard or open a browser** (`CopyToClipboard` and `LaunchURL` are `HasRestrictions = true`). Don't try to work around it in Lua.
- The app **never sends input to the game, reads its memory or reads the screen**. The player's own keypress does the copying. Blizzard bans input broadcasting, so no synthetic keys.
- **Wowhead's item and quest pages sit behind AWS WAF.** Scripted requests get 403 after a handful. The app fetches through Electron's Chromium stack, falls back to a hidden browser window, and caches everything (items 24 h, zone names 7 days).
  - Never add background fetching or crawling.
  - Never fetch pages from a test; use the saved pages in `app/test/fixtures`.

## Environment

- **Install:** `E:\Games\World of Warcraft\_anniversary_\Interface\AddOns\WowheadGatherer` is a **junction** to this repo, so add-on edits are live. WoW only loads what the `.toc` lists, so `app\`, `tests\`, `docs\` and `.venv\` are ignored in game.
- **`/reload`** picks up Lua edits to existing files. **New files, `.toc` changes, `Bindings.xml` and new SavedVariables need a full client restart.**
- **Add-on tests:**
  - Run: `.venv/Scripts/python -m pytest tests -v`. They run Lua 5.1 through `lupa`, with WoW stubs in `tests/conftest.py`.
  - Setup: `python -m venv .venv`, then `.venv/Scripts/python -m pip install -r requirements-dev.txt`.
  - `test_toc_lists_every_lua_file` fails if a new Lua file isn't in the `.toc`.
- **App:** `cd app`, then:
  - `npm test` (Vitest; the renderer tests use happy-dom)
  - `npm run typecheck`
  - `npm run build` (esbuild writes `dist/`)
  - `npm start`
  - If Git Bash can't find `npm`, run `export PATH="/c/Program Files/nodejs:$PATH"` first.
- **Run the app:** from source, `cd app && npm start`. As a program, `cd app && npm run dist`, then run `app\release\Wowhead Gatherer 0.2.0.exe` (portable; copy it anywhere). It lives in the tray, where Quit ends it.
- **`ELECTRON_RUN_AS_NODE`:** shells started by VS Code extensions (including Claude Code's) set `ELECTRON_RUN_AS_NODE=1`, which makes Electron run as plain Node and fail with "Cannot find module 'electron'". Start it with `env -u ELECTRON_RUN_AS_NODE npm start`, or from a normal terminal.
- **Display mode:** WoW must be in Windowed or Windowed (Fullscreen) mode. Exclusive full screen hides the overlay.
- **Verifying WoW APIs:** clone `github.com/Gethe/wow-ui-source` (branch `classic_anniversary`) to the scratchpad and grep `Interface/AddOns/Blizzard_APIDocumentationGenerated`.

## Add-on files

| File | Role |
|---|---|
| `Core.lua` | Defaults, SavedVariables (`WowheadGathererDB`, `WowheadGathererCharDB`), event dispatch to `ns:EVENT()`, `ns:LookupHovered`, `ns:TryOfferDefaultKey`, `/whg`. |
| `Url.lua` | `ns.BuildURL(kind, id, projectID, locale)` (`BuildItemURL` wraps it), `ns.ParseItemLink`, `ns.ParseQuestLink`. |
| `Lookup.lua` | `ns.GetHoveredItem()` (on TBC, `GetItem()`; `TooltipUtil` exists only on mainline-family clients) and `ns.GetHovered()` → `kind, id, label`, items first. |
| `Quests.lua` | `ns.GetHoveredQuest()`: quest log titles and Forever's tracker through `EventRegistry` hover announcements, TBC's tracker lines through a `QuestWatch_Update` post-hook, chat quest links through `ItemRefTooltip:SetHyperlink`. Every TBC-only global is behind an existence check. |
| `Keybinding.lua` | `WOWHEADGATHERER_LOOKUP`, `WowheadGatherer_OnBinding`, `ns:OfferDefaultKey()` (Ctrl+C, once per binding set). |
| `Popup.lua` | `ns.CreateCopyWatcher()`, `ns:ShowCopyPopup(url, kind, id, label)`, `ns.MODIFIER_KEYS`. The fallback link popup. |
| `ReadyCopy.lua` | The one-press copy: `ns:ReadyCopy()`, `ns:UnreadyCopy()`, `ns:CanReadyCopy()`, `MODIFIER_STATE_CHANGED`. A readied quest lets go when the cursor leaves it (the box's `OnUpdate`). |
| `Options.lua` | Enabled, the key-binding row, "Copy with one Ctrl+C", Wowhead language, Close after copying. |

## App files (`app\src`)

| File | Role |
|---|---|
| `shared/wowheadLink.ts` | `parseWowheadLink`: the contract. |
| `shared/types.ts`, `shared/money.ts` | `ItemInfo`, `QuestInfo`, `PageHeader`, `PopupState` and friends; `formatMoney`. |
| `main/wowheadPage.ts`, `main/zones.ts` | Read a page's inline data (`WH.Gatherer.addData`, `new Listview`, `lv_comments0`) and the zone names. |
| `main/markup.ts`, `main/comments.ts`, `main/itemInfo.ts` | Comment markup → safe nodes; the best comments; source sections. |
| `main/questPage.ts`, `main/questInfo.ts` | A quest page's heading and "Series" box; the quest's popup info. Every quest shows the icon `inv_misc_note_01`: the pages name `quest-start`, which Wowhead's image server doesn't have. |
| `main/trail.ts`, `shared/pageName.ts` | The pages clicked through in the popup (`Trail`): it opens only quests the page on show lets the player click, builds their addresses itself, and goes back along the breadcrumb. `pageName` names a page. |
| `static/popup.css`, `static/fonts/` | The game's panel look in CSS; Marcellus (SIL OFL) stands in for Friz Quadrata. |
| `main/cache.ts`, `main/wowheadClient.ts` | Disk cache; fetch → browser fallback → tooltip-service header. |
| `main/win32.ts`, `main/clipboardWatcher.ts` | koffi calls; the clipboard watcher. |
| `main/placement.ts`, `main/popupWindow.ts`, `renderer/popup.ts`, `preload/preload.ts` | The overlay. The page sends only numbers back (a quest ID, a breadcrumb index, its height); `popupWindow.ts` takes them only from its own page. Comments show 3, then 5 more per click. |
| `main/browserFetch.ts`, `main/userAgent.ts`, `main/latestOnly.ts`, `main/trayIcon.ts`, `main/main.ts` | The Electron shell. |

## Conventions

- **Add-on:** everything hangs off `ns`, and the globals are only what WoW needs. **Never rename a saved key or `WOWHEADGATHERER_LOOKUP` after release.**
- **App:** pure logic lives in modules that don't import `electron`, and Vitest tests those. Wowhead text reaches the page only through `textContent`.
- **Style:** `UPPER_CASE` constants with their units in a comment, comments that say why, plain-English text for players. Every feature can be turned off.
- Each change ends with in-game test steps, and says whether `/reload` is enough or a restart is needed.

## Backlog

Spells and NPCs; Questie's tracker; the full tooltip; localised zone names; starting with Windows and an installer; checking Forever at launch (its interface number, program name and `/forever/` pages).
