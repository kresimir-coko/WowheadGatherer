# Wowhead Gatherer: clicking through quests, and more comments

**Date:** 2026-10-10
**Author:** Krešimir Čoko (with Claude)
**Status:** Draft, awaiting review
**Builds on:** [2026-10-10-quests-and-wow-look-design.md](2026-10-10-quests-and-wow-look-design.md)

## Goal

Make the app's popup interactive:

1. **Quest chain.** Click another quest in a quest's chain, and the popup shows that quest. A breadcrumb leads back to where you came from.
2. **Quest items.** When the popup is about an item that starts a quest, or that a quest needs, it lists those quests, and they're clickable the same way.
3. **More comments.** A popup opens with the best 3 comments. A "Show 5 more comments" button adds five more each time it's clicked.

Only the app changes. The add-on and the link contract between the two stay as they are.

## Decisions taken with the player

- **What's clickable:** quests in a chain, and an item's related quests. An item's "Quest reward" rows stay plain text.
- **A quest item's popup shows the item, as today, plus its quests.** It does not jump straight to the quest. The player chose this over opening the quest directly, or showing item and quest together.
- **Comments:** five more per click.

## 1. What the player sees

### The breadcrumb

- **Where:** once the player has clicked through to a quest, a line above the title shows the path, e.g. `Duron's Report › Arrival in Outland › Journey to Honor Hold`. The last step is the page on show and isn't clickable.
- **Going back:** clicking an earlier step goes back to it. Everything after it is dropped.
- **Starting fresh:** a new Ctrl+C in the game, or closing the popup, starts a new trail.
- **Long trails:** the line wraps.
- **No trail:** without one, the popup looks as it does today.

### The quest chain

- **Clickable:** every quest in the chain except the one on show, branches included. It's drawn like the other names (white) with a dotted underline, and turns gold on hover.
- **The quest on show:** stays gold, as today.

### Quest items

An item's popup gets two new sections when Wowhead lists them, placed first because they matter most for a quest item:

- **Starts quest**: Wowhead's `starts` table, e.g. Magtheridon's Head → *The Fall of Magtheridon*.
- **Needed for**: Wowhead's `objective-of` table, e.g. Unidentified Plant Parts → *Identify Plant Parts* and *Plants of Zangarmarsh*.

Each row shows the quest's name, which can be clicked, and its details as in the existing "Quest reward" section ("Level 70 · Alliance"). The 5-row limit and "+N more on Wowhead" apply as in other sections. Wowhead's `provided-for` table (quests that hand you the item) is left out; on the saved pages it repeats the quests the item is needed for. A quest already under Starts quest isn't repeated under Needed for: Magtheridon's Head lists *The Fall of Magtheridon* in both tables.

### Clicking a quest

- **While it loads:** the popup stays where it is and shows "Looking it up on Wowhead…" under the breadcrumb.
- **When it arrives:** it shows the quest's chain and comments, which are clickable again.
- **If it fails:** the error shows under the breadcrumb, so going back still works.
- **Open on Wowhead:** opens the page now on show.

### More comments

- **Opening:** a popup opens with the best 3 comments (pinned first, then by rating), as today.
- **The button:** if there are more, a **Show 5 more comments** button sits under them. Each click adds the next five. When fewer than five are left, it says how many ("Show 2 more comments"). It goes away once all are shown.
- **Height:** after each click the popup refits its height, up to its maximum height, and then scrolls.
- **Fresh starts:** a newly shown page always starts again at 3.

## 2. How it works

### Data

- **Chain quest IDs.** `ChainQuest` gains `id: number`, read from the link `…/quest=<id>/…`. The quest on show has no link on its page; `buildQuestInfo` gives it the page's own ID.
- **Related quest rows.** `SourceRow` gains an optional `questId: number`. Only rows in the Starts quest and Needed for sections carry one. The rows come from Listview tables with ids `starts` and `objective-of`, whose rows hold `id`, `name`, `level` and `side`.
- **All comments.** `pickComments` returns every top-level, not-deleted comment, best first, instead of the best three. Each one is still cut at 600 characters. The popup decides how many to show.
- **Saved lookups:** the cache version goes to 3, because what's saved changes shape.

### Navigation

- **The trail lives in the app**, not in the page. A new module holds it as a list of earlier steps, each a link and a name.
  - **Clicking a quest:** the page on show is pushed onto the trail, and the quest is looked up.
  - **Going back to step *i*:** the trail is cut to before *i*, and step *i*'s link is looked up again. That's usually answered from the cache.
  - **New Ctrl+C or close:** the trail is cleared.
- **What a step is called:** the page's name from the result, or from the error header, or "Quest 10482" / "Item 28105" when neither has one.
- **`PopupState` gains `trail: string[]`:** the names of the earlier steps, oldest first. It's empty for a fresh lookup.
- **The page sends only numbers.** The preload bridge gains `openQuest(id)` and `goBack(index)`.
- **What the app accepts:**
  - It opens a quest only if that ID is clickable on the page now on show: in its chain and not the current quest, or in its Starts quest or Needed for rows. Anything else is ignored.
  - It accepts a back index only if it's a whole number inside the trail.
  - It builds the quest's address itself, keeping the game and language of the page on show (`/tbc/de/quest=10160`). The page never sends an address.
- **Wowhead politeness:** one page request per click. Nothing is fetched ahead of time.
- **Overlapping lookups:** the existing latest-only rule applies. A slow answer to an earlier click is dropped if the player has clicked on since.

### The popup page

- **`PopupActions`** gains `openQuest(id)` and `goBack(index)`, plus `resized()`, which the page calls after "Show 5 more" changes its height.
- **Clickable names** are `<button>` elements, so they work without the popup taking focus, as the existing buttons do. Wowhead's text still goes in only as text.

## Testing

- **Saved pages:** `item-28105.html.gz` (Duron's Report), `item-32385.html.gz` (Magtheridon's Head) and `item-24401.html.gz` (Unidentified Plant Parts), fetched once on 2026-10-10. Together with the saved quest pages, they cover:
  - chain IDs;
  - an item that starts a quest;
  - an item two quests need;
  - an item with no comments (Duron's Report, 0);
  - one with 44 comments (Plant Parts);
  - one with 350 (Thunderfury).
- **Unit tests:**
  - chain IDs;
  - the related-quest sections;
  - the full comment list;
  - the trail module (open, back, restart, step names, refusing IDs and indexes that aren't clickable).
- **Popup tests:**
  - clicking a chain quest or a related quest calls `openQuest` with its ID;
  - the current quest and "Quest reward" rows aren't clickable;
  - breadcrumb steps call `goBack` with their index;
  - "Show 5 more" adds five, counts down, disappears at the end, and calls `resized`;
  - none of it turns Wowhead text into HTML.
- **The look:** rendered to an image and checked, as before.

## Not in this change

- Clickable quests in "Quest reward" rows, or in comments.
- Clicking NPCs, items or zones.
- Opening a quest item's quest automatically.
- Fetching anything ahead of a click.

## Player checks after the build

- **Chain:** look up Fel Orc Scavengers and click *Know your Enemy*. The popup shows it, with `Fel Orc Scavengers ›` above. Click that, and you're back.
- **Quest items:** look up an item in your bags that starts a quest, or that a quest needs. It shows the quest under "Starts quest" or "Needed for", and clicking it opens the quest.
- **More comments:** on an item with many comments, click "Show 5 more comments" a few times. The popup grows, then scrolls.
- **The game keeps working:** clicking in the popup never stops the game from taking your keys.
