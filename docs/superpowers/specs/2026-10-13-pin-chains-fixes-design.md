# Wowhead Gatherer 0.4.0: pin and move, long chains, sticky header, fixes

**Date:** 2026-10-13
**Author:** Krešimir Čoko (with Claude)
**Status:** Approved in chat ("go"). The player asked to carry straight on to the build and to push to `main`.
**Builds on:** [2026-10-13-spells-design.md](2026-10-13-spells-design.md)

## Goal

1. Fix every small issue the four reviews left for later.
2. Keep the popup's header (breadcrumb, icon, name, buttons) at the top while the rest scrolls.
3. Let the player pin the popup, so it stays open while they play, and drag it anywhere.
4. Show long quest chains such as attunements. The full chain comes from Questie's database, when it's installed. Wowhead's guides for the quest are listed too.
5. Release 0.4.0:
   - rebuild the program;
   - put the work on a branch, fast-forward `main` to it, and push both. No pull request.

WoW Forever comes first wherever the clients differ. The player tests in TBC Anniversary.

## 1. Fixes

| # | What the player gets | Fix |
|---|---|---|
| 1 | The tray tooltip, the package description and the notes say "item or quest". | They say "item, quest or spell". CLAUDE.md's link contract gains `spell` and `#chain`. |
| 2 | Comments are stale. Examples: types.ts's `quest-start` icon example; "over an item" in Core.lua and ReadyCopy.lua; the comment in popupWindow.ts that the add-on copied every link; comments saying TBC lacks `C_Spell` (it has it); the `details =[` spacing. | They're corrected. |
| 3 | The title reads "Quest 10160" while a clicked quest loads, though its name is on the page. | The trail passes the clicked quest's name, or the name of the breadcrumb step being returned to, into the loading state. |
| 4 | Saved lookups grow without limit, and old versions are never deleted. | At start-up, the cache deletes files from older versions and files older than the zone names' 7 days. |
| 5 | Copying the same uncached thing again while it loads sends a second request. | The client shares a lookup that's in flight with any new lookup of the same page. |
| 6 | A lookup the player has moved past keeps its hidden window open for up to 20 s. | When a newer hidden-window load starts, an older one ends at once. Its answer was going to be dropped anyway. |
| 7 | A request that times out isn't really cancelled. | `fetchText` aborts the request when it times out. |
| 8 | The hidden window loads ad frames. | Its sub-frames are skipped, like its pictures. |
| 9 | When the page is blocked, an unknown item says the page "looks different". | The hidden window reports its final address. One with `notFound=` is "doesn't know item N". |
| 10 | Results saved when the zone names failed to load are missing zones for a day. | A result isn't saved unless the zone names came. |
| 11 | The app asks which program is in front, and opens that process, 10 times a second. | It looks the program up only when the foreground window changes. |
| 12 | Holding Ctrl while the wheel scrolls the quest log lets go, so the next quest takes two presses. | The ready box readies the quest now under the cursor if Ctrl is still held. |
| 13 | The shortest popups leave an invisible, clickable strip below them. | The popup's minimum height goes from 96 px to 64 px. |
| 14 | The first popup after start-up is sized before its font loads. | The popup page loads the font at start and re-fits once fonts are ready. |
| 15 | A chat-link quest the client hasn't cached shows as "Quest N" in the fallback box. | The name comes from the chat-link tooltip's first line. That quest is also forgotten when the tooltip closes. |
| 16 | Two tests are missing: an error state with a breadcrumb, and HTML in a clickable quest name. | Both are added. |

## 2. The sticky header

The breadcrumb and the title row (icon, name, "Open on Wowhead", Pin, ×) sit in one bar. The bar stays at the top of the popup while the rest scrolls. It has an opaque dark-brown background and a thin rim along its bottom edge, so the scrolling content doesn't show through.

## 3. Pin and move

- **The Pin button** sits between "Open on Wowhead" and ×. It reads **Pin**, or **Pinned** (gold) while pinned. Clicking it toggles the pin.
- **While pinned:**
  - Escape is not taken from the game: the app's Escape shortcut is released while pinned.
  - A new Ctrl+C lookup shows in the pinned popup, where it is. It isn't moved to the cursor.
  - When another program comes to the front, the popup hides and keeps its page. It comes back when the game is in front again.
  - × closes the popup and unpins it. Open on Wowhead also closes it, as before.
- **Moving:** dragging the header bar moves the popup, pinned or not. Buttons and links in the bar stay clickable (`-webkit-app-region: drag`, with `no-drag` on the controls).
  - **The window's position is kept from then on.** A taller page grows the popup downwards from where it is. It moves only to stay on the screen.
  - **When not pinned,** the next lookup from the game opens by the cursor again.

## 4. Long chains

### From Questie (the add-on)

- **Where the data comes from:** QuestieDB (version 1.0.5 and later) exposes `_G.LibQuestieDB`. Its `LibQuestieDB.Quest.Get(questID, key)` reads the keys `name`, `preQuestGroup` (all of these come first), `preQuestSingle` (one of these comes first) and `nextQuestInChain`. It's in TBC, and Questie ships a Forever version too.
- **The chain:**
  - **Earlier quests:** the prerequisites of both kinds, followed back depth-first. A prerequisite always comes before the quests that need it. Positive IDs only: Questie marks exclusions with negative ones.
  - **Then** the quest itself.
  - **Then the later quests:** `nextQuestInChain`, followed forward.
  - **Limits:** at most 25 quests each way. No quest is listed twice.
  - **Errors:** every Questie call is wrapped in `pcall`. Without Questie, or with no other quest in the chain, there is no chain.
- **In the copied link:** a quest's link gets `#chain=` followed by `id~name` entries joined by `.`. The names are percent-encoded byte by byte: letters, digits, `-` and `_` stay as they are.
  - Example: `https://www.wowhead.com/tbc/quest=9836#chain=9824~Arcane%20Disturbances.9825~Restless%20Activity.9836~The%20Master%27s%20Touch`.
  - A browser ignores everything after `#`.
  - The ready box and the fallback box take any length of text (`SetMaxLetters(0)`).

### In the app

- **Reading the chain:** `parseWowheadLink` reads the `#chain=` fragment into `link.chain: { id, name }[]`.
  - It takes at most 51 entries, each with a positive whole ID and a decoded name of at most 100 characters.
  - Broken entries are skipped.
  - `link.url` stays without the fragment, so "Open on Wowhead" and the cache use the plain address.
  - The longest clipboard text read goes from 300 to 6,000 characters.
- **The chain shown:** for a quest whose link has a chain, the popup's Quest chain shows that chain, numbered 1…N. The quest on show is gold and every other one is clickable. Otherwise Wowhead's Series box shows, as before. `chainFor(state)` (shared) decides this for the page and for the trail's clickable quests.
- **Clicking within the chain:** a quest opened from inside the chain keeps the chain, with that quest as the one on show.

### Guides

- **Reading them:** quest pages carry a `guides` Listview whose rows have `title` and `url`. `QuestInfo.guides` keeps up to 3, in Wowhead's order, whose `url` is on `https://www.wowhead.com/`.
- **Showing them:** a **Guides** section after the chain lists their titles as links. A click sends the guide's index. The app checks it against the page on show, checks the address again, and opens it in the browser.
- **Saved lookups:** the cache version goes to 4.

## 5. Release

- **Version 0.4.0:** in `app/package.json` (and its lock file) and the `.toc`. Then rebuild `app/release/Wowhead Gatherer 0.4.0.exe`.
- **Git:**
  - The work is committed on `feat/pin-and-chains`, branched from `feat/wowhead-gatherer`.
  - Then `git checkout main` and `git merge --ff-only feat/pin-and-chains`. `main` is an ancestor, so this is a fast-forward.
  - Then `git push origin main feat/pin-and-chains`. Never a force push.

## Testing

- **Saved page:** `quest-9836.html.gz` (The Master's Touch, an attunement step with 2 guides), saved on 2026-10-13 through a hidden browser window.
- **Add-on tests:**
  - the chain from a fake `LibQuestieDB`: order, both kinds of prerequisite, no repeats, the 25 cap, a Questie error, no Questie;
  - the fragment and its encoding;
  - the link with and without a chain;
  - re-readying after a scroll;
  - the chat-link name, and forgetting it on hide.
- **App tests:**
  - the chain fragment: valid, broken, too long, hostile names;
  - `chainFor`, the trail with chains (clickable, carried on, loading names);
  - guides: reading, the address check, rendering, opening;
  - the sticky bar, the Pin button and its state;
  - the shared in-flight lookup;
  - cache pruning;
  - not saving without zones;
  - not-found from the browser path;
  - the remembered foreground lookup;
  - `fitHeight`'s new minimum;
  - the two missing tests.
- **Electron glue (pin, Escape, suspend, moved):** checked in a throwaway Electron run, as before, and by the player.

## Player checks

1. **Header:** scroll a long popup. The header stays, and × works at any point.
2. **Pin:**
   - Pin the popup, then press Escape in game: the game menu opens and the popup stays.
   - Ctrl+C another item: it shows in the pinned popup.
   - Alt-tab away and back: the popup comes back.
   - Drag the header: the popup moves and stays.
3. **Long chains:** with Questie, look up "The Master's Touch" (Karazhan attunement). Quest chain shows the whole attunement, every quest clickable. Guides lists the Attunements guide, which opens in the browser.
4. **The fixes:**
   - Ctrl held while scrolling the quest log still copies with one C.
   - A chat quest link the game hasn't loaded shows its name in the fallback box.
