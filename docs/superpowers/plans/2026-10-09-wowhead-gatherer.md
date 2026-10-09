# Wowhead Gatherer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hover an item in WoW, press Ctrl+C once, and an always-on-top popup by the cursor shows Wowhead's drops, sources and best comments for it, with a button that opens the Wowhead page.

**Architecture:** Two halves meet at the clipboard.
- **Add-on (repo root):** a copy of Wowhead Lookup that also "readies" the hovered item's Wowhead link in a hidden, focused edit box while Ctrl is held. The game's own edit box then copies it on C.
- **Electron app (`app\`):** watches the clipboard sequence number and reacts only while the WoW program is in front. It fetches and parses the item's Wowhead page (with a hidden-browser-window fallback for Wowhead's bot check, and a day of caching), and shows the result in a non-focusable overlay.

**Tech Stack:** Lua 5.1 (WoW 2.5.6 add-on API), pytest 9 + lupa 2.8. Node LTS, Electron (latest), TypeScript, esbuild, Vitest, happy-dom, koffi (Win32 FFI), electron-builder.

**Spec:** `docs/superpowers/specs/2026-10-09-wowhead-gatherer-design.md` (read it first; this plan argues from it).

## Global Constraints

- Add-on: `## Interface: 20506` (Burning Crusade Anniversary 2.5.6). Lua 5.1. Everything hangs off `ns`.
  - Globals are only `WowheadGathererDB`, `WowheadGathererCharDB`, `SLASH_WOWHEADGATHERER1/2`, `BINDING_HEADER_WOWHEADGATHERER`, `BINDING_NAME_WOWHEADGATHERER_LOOKUP`, `WowheadGatherer_OnBinding` and the frame `WowheadGathererPopup`.
- Add-ons can't write the clipboard or open a browser (`CopyToClipboard` and `LaunchURL` are `HasRestrictions = true`). The add-on never tries to. **The app never sends input to the game, never reads its memory and never reads the screen.**
- **The link is the contract between the halves:** `https://www.wowhead.com/[site/][lang/]item=<id>`, with the language after the site (`/tbc/de/item=19019`). Language codes: `de es mx fr it pt ru ko cn tw`; English has none.
- The app reacts only to clipboard changes made while a WoW program is in front: `wowclassic.exe`, `wowclassict.exe`, `wowclassicb.exe`, `wow.exe`, `wowt.exe`, `wowb.exe` (any letter case).
- **Wowhead politeness:** one page request per lookup, never in the background. Item results are cached 24 h and zone names 7 days.
- **Popup security:** sandboxed, context-isolated renderer. Wowhead text only ever goes in through `textContent`. The only remote content is icons from `https://wow.zamimg.com`. "Open on Wowhead" opens only the link `parseWowheadLink` rebuilt.
- **Style** (as in Wowhead Lookup and Personal Resource Display): `UPPER_CASE` constants with their units in a comment, comments that say *why*, plain-English text for players.
- **Commands:**
  - Lua tests run from the repo root: `.venv/Scripts/python -m pytest tests -q`.
  - App commands run from `app/`: `npm test`, `npm run typecheck`, `npm run build`, `npm start`.
  - If `node` or `npm` isn't found in Git Bash after Task 3 installs Node, prefix the command with `export PATH="/c/Program Files/nodejs:$PATH" &&`.
- **Commits:** Conventional Commits, each ending with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (pass it as a second `-m`).
- **Paths:** the repo is `D:\Development\WoW Addons\WowheadGatherer` (Git Bash: `/d/Development/WoW Addons/WowheadGatherer`). The game is `E:\Games\World of Warcraft\_anniversary_`.

## Review Focus

These are the inputs the spec implies but its happy paths don't exercise. Each one has a test in the task named.

1. **A huge or non-text clipboard** (an image, a 5 MB log) copied while WoW is in front → no popup, no stall. *Task 3 (`rejects a huge clipboard quickly`) and Task 8 (`ignores a huge or empty clipboard`).*
2. **Two lookups racing** (Ctrl+C on item A, then B before A's page arrives) → the popup ends on B, and A's late answer is dropped. *Task 10 (`latestOnly` tests).*
3. **Sparse or odd Wowhead rows** (no location, count −1, money-less costs, unknown reagent IDs, rows without names) → still listed with fewer details, never a crash. *Task 6 (`lists rows with missing details`).*
4. **Wowhead's bot check answering 202 with a challenge page** (not 403) → the hidden-window fallback still kicks in. *Task 7 (`falls back … (202)`).*
5. **The in-game link popup is open and the player holds Ctrl** to copy from it → the readied copy must not take the keyboard focus from the popup's box. *Task 2 (`test_leaves_the_link_popup_focus_alone`).*

## File Structure

```
WowheadGatherer/                  repo root = the add-on folder (junctioned into the game)
  WowheadGatherer.toc  Bindings.xml
  Core.lua Url.lua Lookup.lua Keybinding.lua Popup.lua Options.lua   (from Wowhead Lookup, renamed)
  ReadyCopy.lua                   NEW: hold Ctrl over an item → link ready, C copies
  tests/                          pytest + lupa (from Wowhead Lookup) + test_ready_copy.py
  requirements-dev.txt
  app/                            the Electron app (WoW ignores folders its .toc doesn't list)
    package.json tsconfig.json vitest.config.ts
    src/shared/   wowheadLink.ts types.ts money.ts
    src/main/     wowheadPage.ts zones.ts markup.ts comments.ts itemInfo.ts cache.ts
                  wowheadClient.ts win32.ts clipboardWatcher.ts placement.ts userAgent.ts
                  latestOnly.ts trayIcon.ts browserFetch.ts popupWindow.ts main.ts
    src/preload/  preload.ts
    src/renderer/ popup.ts
    static/       popup.html popup.css
    test/         *.test.ts, fixtures.ts, fixtures/ (saved Wowhead pages, already committed)
```

---

### Task 1: The add-on, started from Wowhead Lookup

**Files:**
- Create (copied): `Bindings.xml`, `Core.lua`, `Url.lua`, `Lookup.lua`, `Keybinding.lua`, `Popup.lua`, `Options.lua`, `WowheadGatherer.toc`, `requirements-dev.txt`, `tests/conftest.py`, `tests/test_core.py`, `tests/test_keybinding.py`, `tests/test_lookup.py`, `tests/test_options.py`, `tests/test_popup.py`, `tests/test_url.py`
- Junction: `E:\Games\World of Warcraft\_anniversary_\Interface\AddOns\WowheadGatherer` → the repo root

**Interfaces:**
- Consumes: nothing.
- Produces: the renamed add-on. Everything is as described in Wowhead Lookup's `CLAUDE.md`, with names `WowheadGathererDB`, `WowheadGathererCharDB`, `ns.BINDING = "WOWHEADGATHERER_LOOKUP"`, the frame `WowheadGathererPopup` and the slash command `/whg`. The test harness `tests/conftest.py` has `ADDON_NAME = "WowheadGatherer"`.

- [ ] **Step 1: Copy Wowhead Lookup's add-on files and tests**

Copy from the working tree, not from git: Wowhead Lookup's flattening renames aren't committed.

```bash
cd "/d/Development/WoW Addons"
cp WowheadLookup/{Bindings.xml,Core.lua,Url.lua,Lookup.lua,Keybinding.lua,Popup.lua,Options.lua,requirements-dev.txt} WowheadGatherer/
cp WowheadLookup/WowheadLookup.toc WowheadGatherer/WowheadGatherer.toc
mkdir -p WowheadGatherer/tests
cp WowheadLookup/tests/*.py WowheadGatherer/tests/
```

- [ ] **Step 2: Rename everything**

```bash
cd "/d/Development/WoW Addons/WowheadGatherer"
sed -i -e 's/WowheadLookup/WowheadGatherer/g' -e 's/WOWHEADLOOKUP/WOWHEADGATHERER/g' \
       -e 's/Wowhead Lookup/Wowhead Gatherer/g' -e 's#/whl#/whg#g' -e 's#/wowheadlookup#/wowheadgatherer#g' \
       *.lua *.xml *.toc tests/*.py
grep -rn -i -E "wowheadlookup|wowhead lookup|/whl\b" *.lua *.xml *.toc tests/*.py
```

Expected: `grep` prints nothing.

- [ ] **Step 3: Set up Python and run the tests**

```bash
cd "/d/Development/WoW Addons/WowheadGatherer"
python -m venv .venv && .venv/Scripts/python -m pip install -q -r requirements-dev.txt
.venv/Scripts/python -m pytest tests -q
```

Expected: `85 passed`.

- [ ] **Step 4: Junction the add-on into the game**

Use the PowerShell tool (in Git Bash, `cmd` mangles the `/J`):

```powershell
cmd /c mklink /J "E:\Games\World of Warcraft\_anniversary_\Interface\AddOns\WowheadGatherer" "D:\Development\WoW Addons\WowheadGatherer"
```

Expected: `Junction created for ...`.

- [ ] **Step 5: In-game check (ask the user to do it)**

New add-on, so **fully restart the client**, not `/reload`.

1. At character select, under AddOns, turn **Wowhead Lookup off** and **Wowhead Gatherer on**. Both want Ctrl+C.
2. Log in. If chat says Ctrl-C "is already used", type `/whg` and set "Look up hovered item" to Ctrl+C.
3. Hover an item in your bags, press Ctrl+C, then Ctrl+C again. Expected: the link popup appears, then "Wowhead link copied.".
4. Ask the user to report any Lua error.

- [ ] **Step 6: Commit**

```bash
cd "/d/Development/WoW Addons/WowheadGatherer"
git add Bindings.xml *.lua WowheadGatherer.toc requirements-dev.txt tests/
git commit -m "feat: start Wowhead Gatherer's add-on from Wowhead Lookup" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: One Ctrl+C: the readied copy

**Files:**
- Create: `ReadyCopy.lua`, `tests/test_ready_copy.py`
- Modify: `Popup.lua` (share `MODIFIER_KEYS`), `Core.lua` (default, login hook, two events), `Options.lua` (checkbox), `WowheadGatherer.toc` (file list, notes), `tests/conftest.py` (focus and tooltip stubs), `tests/test_core.py`, `tests/test_options.py`

**Interfaces:**
- Consumes: from Task 1:
  - `ns.GetHoveredItem()` → `itemID, link`
  - `ns.BuildItemURL(itemID, projectID, locale)`
  - `ns:GetWowheadLocale()`
  - `ns.CreateCopyWatcher()`
  - `ns.Flash(text, r, g, b)`
  - `ns.db`
  - Core's event dispatch: `ns[event](ns, ...)`
- Produces:
  - `ns:ReadyCopy()`, `ns:UnreadyCopy()`, `ns:CanReadyCopy()` → boolean, `ns:GetReadyURL()` → string or nil, `ns:InitializeReadyCopy()`
  - `ns:MODIFIER_STATE_CHANGED(key, down)`, `ns:PLAYER_REGEN_DISABLED()`
  - `ns.MODIFIER_KEYS`
  - The saved setting `readyCopy` (default `true`)
  - Test helper `Addon.run_hook(tooltip, script)`

- [ ] **Step 1: Teach the test stubs about keyboard focus and tooltip hooks**

In `tests/conftest.py`, inside `WOW_STUBS`, make these changes.

After `function IsMacClient() return macClient end`, add:

```lua
-- Keyboard focus: the frame that last called SetFocus, as the game tracks it.
keyboardFocus = nil
function GetCurrentKeyBoardFocus() return keyboardFocus end
ChatFontNormal = Mock()
```

In `FakeTooltip`, replace

```lua
    if o.legacyLink then
        function tooltip:GetItem() return "Name", o.legacyLink end
    end
    return tooltip
end
```

with

```lua
    if o.legacyLink then
        function tooltip:GetItem() return "Name", o.legacyLink end
    end
    -- Scripts add-ons hook (run them with Addon.run_hook), and the owner frame.
    tooltip.hooks = {}
    function tooltip:HasScript(script) return script == "OnTooltipSetItem" or script == "OnHide" end
    function tooltip:HookScript(script, func) self.hooks[script] = func end
    function tooltip:GetOwner() return o.owner end
    return tooltip
end
```

In `CreateFrame`, after the `rawset(frame, "IsShown", ...)` line, add:

```lua
    rawset(frame, "SetFocus", function(self) keyboardFocus = self end)
    rawset(frame, "ClearFocus", function(self)
        if keyboardFocus == self then
            keyboardFocus = nil
            if self.scripts.OnEditFocusLost then self.scripts.OnEditFocusLost(self) end
        end
    end)
    rawset(frame, "HasFocus", function(self) return keyboardFocus == self end)
```

At the very end of `WOW_STUBS`, after `SlashCmdList = {}`, add:

```lua
-- A hidden tooltip, so code that hooks GameTooltip at login always finds one.
GameTooltip = FakeTooltip({ shown = false })
```

In `class Addon`, after `def values(self, name): ...`, add:

```python
    def run_hook(self, tooltip, script):
        """Runs the function the add-on hooked onto a fake tooltip's script."""
        self.lua.eval("function(t, s) t.hooks[s](t) end")(tooltip, script)
```

- [ ] **Step 2: Run the suite: the stubs alone change nothing**

Run: `.venv/Scripts/python -m pytest tests -q`
Expected: `85 passed`.

- [ ] **Step 3: Write the failing tests**

Create `tests/test_ready_copy.py`:

```python
import pytest

from conftest import Addon

ITEM = 0
URL = "https://www.wowhead.com/tbc/item=19019"
HEARTHSTONE_URL = "https://www.wowhead.com/tbc/item=6948"
THUNDERFURY = "|cffff8000|Hitem:19019::::::::70:::::|h[Thunderfury, Blessed Blade of the Windseeker]|h|r"
HEARTHSTONE = "|cffffffff|Hitem:6948::::::::70:::::|h[Hearthstone]|h|r"


@pytest.fixture
def addon(addon):
    """Logged in on TBC, hovering Thunderfury in a bag."""
    addon.g.GameTooltip = addon.tooltip(legacyLink=THUNDERFURY)
    addon.load_all()
    addon.fire("ADDON_LOADED", "WowheadGatherer")
    addon.run("function ns.Flash(text) table.insert(flashes, text) end")
    addon.fire("PLAYER_LOGIN")
    return addon


def hold_ctrl(addon):
    addon.g.ctrlDown = True
    addon.fire("MODIFIER_STATE_CHANGED", "LCTRL", 1)


def release_ctrl(addon):
    addon.g.ctrlDown = False
    addon.fire("MODIFIER_STATE_CHANGED", "LCTRL", 0)


def ready_url(addon):
    return addon.run("return ns:GetReadyURL()")


def ready_box(addon):
    return addon.g.keyboardFocus


def key(addon, script, name):
    box = ready_box(addon)
    box.scripts[script](box, name)


def test_holding_ctrl_over_an_item_readies_its_link(addon):
    hold_ctrl(addon)
    assert ready_url(addon) == URL
    assert ready_box(addon).text == URL


def test_releasing_ctrl_lets_go(addon):
    hold_ctrl(addon)
    release_ctrl(addon)
    assert ready_url(addon) is None
    assert addon.g.keyboardFocus is None


def test_ctrl_with_nothing_hovered_does_nothing(addon):
    addon.g.GameTooltip = addon.tooltip(shown=False)
    hold_ctrl(addon)
    assert ready_url(addon) is None
    assert addon.g.keyboardFocus is None


def test_never_in_combat(addon):
    addon.g.inCombat = True
    hold_ctrl(addon)
    assert ready_url(addon) is None


def test_entering_combat_lets_go(addon):
    hold_ctrl(addon)
    addon.fire("PLAYER_REGEN_DISABLED")
    assert ready_url(addon) is None
    assert addon.g.keyboardFocus is None


def test_leaves_chat_typing_alone(addon):
    addon.run('chatBox = CreateFrame("EditBox"); keyboardFocus = chatBox')
    hold_ctrl(addon)
    assert ready_url(addon) is None
    assert addon.run("return keyboardFocus == chatBox") is True


def test_leaves_the_link_popup_focus_alone(addon):
    # The fallback link popup is open with its box focused. Holding Ctrl to
    # copy from it must not move the focus to the hidden box.
    addon.run(f'ns:ShowCopyPopup("{HEARTHSTONE_URL}", 6948, nil); popupBox = keyboardFocus')
    hold_ctrl(addon)
    assert ready_url(addon) is None
    assert addon.run("return keyboardFocus == popupBox") is True


def test_not_over_action_buttons(addon):
    button = addon.lua.table_from({"action": 5})
    addon.g.GameTooltip = addon.tooltip(legacyLink=THUNDERFURY, owner=button)
    hold_ctrl(addon)
    assert ready_url(addon) is None


@pytest.mark.parametrize("setting", ["enabled", "readyCopy"])
def test_off_when_turned_off(addon, setting):
    addon.g.WowheadGathererDB[setting] = False
    hold_ctrl(addon)
    assert ready_url(addon) is None


def test_ctrl_c_copies_and_says_so(addon):
    hold_ctrl(addon)
    key(addon, "OnKeyDown", "C")
    key(addon, "OnKeyUp", "C")
    assert addon.values("flashes") == ["Wowhead link copied."]
    # Ctrl is still held, so the link stays ready for another copy.
    assert ready_url(addon) == URL


def test_any_other_key_lets_go(addon):
    hold_ctrl(addon)
    key(addon, "OnKeyDown", "1")
    assert ready_url(addon) is None
    assert addon.g.keyboardFocus is None


def test_other_modifiers_keep_it_ready(addon):
    hold_ctrl(addon)
    key(addon, "OnKeyDown", "LSHIFT")
    assert ready_url(addon) == URL


def test_escape_lets_go(addon):
    hold_ctrl(addon)
    box = ready_box(addon)
    box.scripts.OnEscapePressed(box)
    assert ready_url(addon) is None


def test_typing_cannot_change_the_link(addon):
    hold_ctrl(addon)
    box = ready_box(addon)
    box.SetText(box, "junk")
    box.scripts.OnTextChanged(box, True)
    assert box.text == URL


def test_ctrl_key_up_is_a_backstop_for_letting_go(addon):
    hold_ctrl(addon)
    addon.g.ctrlDown = False
    key(addon, "OnKeyUp", "LCTRL")
    assert ready_url(addon) is None


def test_moving_to_another_item_while_holding_ctrl(addon):
    tooltip = addon.g.GameTooltip
    hold_ctrl(addon)
    addon.run(f'function GameTooltip:GetItem() return "Hearthstone", "{HEARTHSTONE}" end')
    addon.run_hook(tooltip, "OnTooltipSetItem")
    assert ready_url(addon) == HEARTHSTONE_URL


def test_item_tooltip_without_ctrl_does_nothing(addon):
    addon.run_hook(addon.g.GameTooltip, "OnTooltipSetItem")
    assert ready_url(addon) is None


def test_tooltip_hiding_lets_go(addon):
    hold_ctrl(addon)
    addon.run_hook(addon.g.GameTooltip, "OnHide")
    assert ready_url(addon) is None


def test_shift_does_not_ready(addon):
    addon.fire("MODIFIER_STATE_CHANGED", "LSHIFT", 1)
    assert ready_url(addon) is None


def test_hooks_tooltip_data_on_mainline_clients():
    # WoW Forever's tooltips carry data; TooltipDataProcessor is the way in there.
    addon = Addon()
    addon.run("postCalls = {}; TooltipDataProcessor = { AddTooltipPostCall = function(kind, fn) postCalls[kind] = fn end }")
    addon.g.GameTooltip = addon.tooltip(dataType=ITEM, dataID=19019, dataLink=THUNDERFURY)
    addon.load_all()
    addon.fire("ADDON_LOADED", "WowheadGatherer")
    addon.fire("PLAYER_LOGIN")
    assert addon.run("return postCalls[Enum.TooltipDataType.Item] ~= nil") is True
    assert addon.run("return GameTooltip.hooks.OnTooltipSetItem == nil") is True
```

In `tests/test_core.py`, in `test_saved_variables_get_defaults`, add as the last line:

```python
    assert addon.g.WowheadGathererDB.readyCopy is True
```

In `tests/test_options.py`, in the `addon` fixture, replace the two `table_from({...})` lines with:

```python
    addon.ns.defaults = addon.lua.table_from({"enabled": True, "readyCopy": True, "language": "client", "closeOnCopy": True})
    addon.ns.db = addon.lua.table_from({"enabled": True, "readyCopy": True, "language": "client", "closeOnCopy": True})
```

and in `test_every_setting_is_on_the_page` replace the expected list with:

```python
    assert addon.values("registered") == ["enabled", "readyCopy", "language", "closeOnCopy"]
```

- [ ] **Step 4: Run the tests and watch them fail**

Run: `.venv/Scripts/python -m pytest tests -q`
Expected: failures in `test_ready_copy.py` (`attempt to call method 'GetReadyURL' (a nil value)` or similar), `test_saved_variables_get_defaults` and `test_every_setting_is_on_the_page`.

- [ ] **Step 5: Write `ReadyCopy.lua`**

```lua
local _, ns = ...

-- One-press copy. While Ctrl is held over an item, a hidden edit box holds the
-- item's Wowhead link, selected and with keyboard focus, so the C of Ctrl+C
-- copies it straight away. The game's edit box does the copying; the add-on
-- never touches the clipboard (CopyToClipboard is Blizzard-only).
--
-- Key bindings don't fire while the box has focus, so a Ctrl+key binding
-- pressed over an item would be used up. That's why the box is never readied
-- in combat or over action buttons, and lets go of focus on any other key.

-- Keys whose press readies the link and whose release lets it go. Ctrl copies
-- on Windows, Cmd (the meta key) on a Mac.
local READY_KEYS = { LCTRL = true, RCTRL = true, LMETA = true, RMETA = true }

local watcher = ns.CreateCopyWatcher()
local box
-- The link in the box while it's readied, or nil.
local readyURL

local function IsReadyKeyDown()
    return IsControlKeyDown() or IsMetaKeyDown()
end

-- Action buttons keep their slot in .action (Blizzard_ActionBar/Shared/ActionButton.lua).
local function IsActionButton(frame)
    return type(frame) == "table" and frame.action ~= nil
end

local function CreateReadyBox()
    local editBox = CreateFrame("EditBox", nil, UIParent)
    editBox:SetSize(1, 1)
    editBox:SetPoint("TOPLEFT")
    -- Never seen: it only has to hold the text and the focus.
    editBox:SetAlpha(0)
    editBox:SetAutoFocus(false)
    -- An edit box can't hold text without a font.
    editBox:SetFontObject(ChatFontNormal)
    editBox:SetScript("OnKeyDown", function(_, key)
        watcher.KeyDown(key, IsReadyKeyDown())
        if key ~= "C" and not ns.MODIFIER_KEYS[key] then
            -- Not a copy: let go, so the next press reaches its key binding.
            ns:UnreadyCopy()
        end
    end)
    editBox:SetScript("OnKeyUp", function(_, key)
        if watcher.KeyUp(key) then
            ns.Flash("Wowhead link copied.", 1, 0.82, 0)
        elseif READY_KEYS[key] and not IsReadyKeyDown() then
            -- MODIFIER_STATE_CHANGED normally lets go; this key-up is a backstop.
            ns:UnreadyCopy()
        end
    end)
    editBox:SetScript("OnEscapePressed", function()
        ns:UnreadyCopy()
    end)
    -- Keep the whole link there and selected, so a copy always takes all of it.
    editBox:SetScript("OnTextChanged", function(self, userInput)
        if userInput and readyURL then
            self:SetText(readyURL)
            self:HighlightText()
        end
    end)
    editBox:SetScript("OnEditFocusLost", function()
        readyURL = nil
        watcher.Reset()
    end)
    return editBox
end

-- Whether the link may be readied now: the option is on, the player isn't
-- fighting or typing, and the cursor isn't on an action button.
function ns:CanReadyCopy()
    local db = self.db
    if not (db and db.enabled and db.readyCopy) then
        return false
    end
    if InCombatLockdown() then
        return false
    end
    -- Typing in chat, a search box or the link popup: leave that focus alone.
    local focus = GetCurrentKeyBoardFocus()
    if focus and focus ~= box then
        return false
    end
    return not IsActionButton(GameTooltip:GetOwner())
end

-- Readies the hovered item's link, or lets go when there's nothing to ready.
function ns:ReadyCopy()
    local itemID = self:CanReadyCopy() and ns.GetHoveredItem()
    if not itemID then
        self:UnreadyCopy()
        return
    end
    box = box or CreateReadyBox()
    readyURL = ns.BuildItemURL(itemID, WOW_PROJECT_ID, self:GetWowheadLocale())
    box:SetText(readyURL)
    box:SetFocus()
    box:HighlightText()
end

function ns:UnreadyCopy()
    readyURL = nil
    if box and box:HasFocus() then
        box:ClearFocus()
    end
end

-- The readied link, or nil.
function ns:GetReadyURL()
    return readyURL
end

local function OnItemTooltip(tooltip)
    -- Moving to another item while still holding Ctrl readies that one.
    if tooltip == GameTooltip and IsReadyKeyDown() then
        ns:ReadyCopy()
    end
end

-- Hooks the item tooltip. Classic clients have TooltipDataProcessor, but their
-- own tooltips only run the old scripts, so it's used only where tooltips
-- carry data (the check Questie makes).
function ns:InitializeReadyCopy()
    if GameTooltip.GetPrimaryTooltipData and TooltipDataProcessor then
        TooltipDataProcessor.AddTooltipPostCall(Enum.TooltipDataType.Item, OnItemTooltip)
    elseif GameTooltip:HasScript("OnTooltipSetItem") then
        GameTooltip:HookScript("OnTooltipSetItem", OnItemTooltip)
    end
    GameTooltip:HookScript("OnHide", function()
        ns:UnreadyCopy()
    end)
end

function ns:MODIFIER_STATE_CHANGED(key, down)
    if not READY_KEYS[key] then
        return
    end
    if down == 1 then
        self:ReadyCopy()
    else
        self:UnreadyCopy()
    end
end

function ns:PLAYER_REGEN_DISABLED()
    self:UnreadyCopy()
end
```

- [ ] **Step 6: Wire it in**

`Popup.lua`: replace

```lua
-- Keys that only modify others. Pressing one never cancels a copy in progress.
local MODIFIER_KEYS = {
```

with

```lua
-- Keys that only modify others. Pressing one never cancels a copy in progress.
-- ReadyCopy.lua uses them too.
ns.MODIFIER_KEYS = {
```

and replace `        if not MODIFIER_KEYS[key] then` with `        if not ns.MODIFIER_KEYS[key] then`.

`Core.lua`: replace

```lua
    closeOnCopy = true,
```

with

```lua
    closeOnCopy = true,
    -- Holding Ctrl over an item readies its link, so one Ctrl+C copies it.
    readyCopy = true,
```

replace

```lua
    self:InitializeOptions()
end
```

with

```lua
    self:InitializeOptions()
    self:InitializeReadyCopy()
end
```

and replace

```lua
eventFrame:RegisterEvent("VARIABLES_LOADED")
```

with

```lua
eventFrame:RegisterEvent("VARIABLES_LOADED")
-- Ctrl and combat, for the readied copy (ReadyCopy.lua).
eventFrame:RegisterEvent("MODIFIER_STATE_CHANGED")
eventFrame:RegisterEvent("PLAYER_REGEN_DISABLED")
```

`Options.lua`: replace

```lua
    AddKeybindingRow(layout)
```

with

```lua
    AddKeybindingRow(layout)
    AddCheckbox(category, "readyCopy", "Copy with one Ctrl+C",
        "Hold Ctrl over an item and press C to copy its Wowhead link straight away, without the link popup. The Wowhead Gatherer app picks the link up from there.\n\nWhile you hold Ctrl over an item, your other Ctrl key bindings don't work. It's always off in combat and over action buttons, where the lookup key opens the link popup instead.")
```

`WowheadGatherer.toc`: replace the `## Notes:` line with

```
## Notes: Hover over an item and press Ctrl+C: the Wowhead Gatherer app shows where it comes from.
```

and put `ReadyCopy.lua` on its own line between `Popup.lua` and `Options.lua`.

- [ ] **Step 7: Run the tests**

Run: `.venv/Scripts/python -m pytest tests -q`
Expected: `106 passed`.

- [ ] **Step 8: In-game check — the gate for the readied copy (ask the user)**

New file and `.toc` change, so **fully restart the client**.

1. Hover an item in your bags, hold Ctrl, press C. Expected: "Wowhead link copied.", and pasting into the browser's address bar gives `https://www.wowhead.com/tbc/item=…`.
2. Hold Ctrl over an item and press 1. Expected: nothing happens; that press is used up. Release Ctrl and press Ctrl+1: your binding works.
3. Open chat, type text, select it, press Ctrl+C. Expected: chat copies as normal and nothing is readied.
4. In combat, hover a bag item and press Ctrl+C. Expected: the link popup opens (the fallback), and a second Ctrl+C copies.
5. Hover an action button that holds an item (a potion) and press Ctrl+C. Expected: the link popup opens.
6. In `/whg`, turn off "Copy with one Ctrl+C". Expected: Ctrl+C over an item opens the link popup again.

**If step 1 fails** (no message, or the paste isn't the link):
- In `Core.lua`, set `readyCopy = false` in `ns.defaults`.
- In `tests/test_core.py`, change the new assertion to `is False`.
- Run the tests, commit with `fix: readied copy off by default (it didn't copy in game)`, and tell the user. The double Ctrl+C still feeds the app, so later tasks don't change.

- [ ] **Step 9: Commit**

```bash
git add ReadyCopy.lua Popup.lua Core.lua Options.lua WowheadGatherer.toc tests/
git commit -m "feat: copy the hovered item's link with one Ctrl+C" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: App toolchain and the link parser

**Files:**
- Create: `app/package.json`, `app/tsconfig.json`, `app/vitest.config.ts`, `app/src/shared/wowheadLink.ts`, `app/test/wowheadLink.test.ts`
- Generated: `app/package-lock.json`

**Interfaces:**
- Consumes: the link contract (Global Constraints).
- Produces:
  - `interface WowheadLink { url: string; site: string; lang: string; itemId: number }`
  - `parseWowheadLink(text: string): WowheadLink | null`
  - npm scripts `test`, `typecheck`, `build`, `build:main`, `build:preload`, `build:renderer`, `start`

- [ ] **Step 1: Install Node LTS (ask the user first: it installs software)**

PowerShell tool:

```powershell
winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
```

Then, in Git Bash: `export PATH="/c/Program Files/nodejs:$PATH" && node --version && npm --version`
Expected: a version such as `v24.x` and an npm version.

- [ ] **Step 2: Create `app/package.json`**

```json
{
  "name": "wowhead-gatherer",
  "productName": "Wowhead Gatherer",
  "version": "0.1.0",
  "description": "Shows Wowhead's drops, sources and comments for the item you copy in World of Warcraft.",
  "author": "Krešimir Čoko",
  "license": "UNLICENSED",
  "private": true,
  "main": "dist/main.js",
  "scripts": {
    "build": "npm run build:main && npm run build:preload && npm run build:renderer",
    "build:main": "esbuild src/main/main.ts --bundle --platform=node --format=cjs --external:electron --external:koffi --outfile=dist/main.js",
    "build:preload": "esbuild src/preload/preload.ts --bundle --platform=node --format=cjs --external:electron --outfile=dist/preload.js",
    "build:renderer": "esbuild src/renderer/popup.ts --bundle --format=iife --outfile=dist/popup.js",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "start": "npm run build && electron ."
  }
}
```

- [ ] **Step 3: Create `app/tsconfig.json` and `app/vitest.config.ts`**

`app/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "noEmit": true
  },
  "include": ["src", "test", "vitest.config.ts"]
}
```

`app/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Install the packages**

```bash
cd "/d/Development/WoW Addons/WowheadGatherer/app"
npm install --save-dev electron typescript esbuild vitest happy-dom @types/node
npm install koffi
```

Expected: `added N packages`, with no errors. `package.json` now lists them.

- [ ] **Step 5: Write the failing test**

`app/test/wowheadLink.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseWowheadLink } from '../src/shared/wowheadLink';

describe('parseWowheadLink', () => {
  it('reads a TBC link', () => {
    expect(parseWowheadLink('https://www.wowhead.com/tbc/item=19019')).toEqual({
      url: 'https://www.wowhead.com/tbc/item=19019', site: 'tbc', lang: '', itemId: 19019,
    });
  });

  it('reads a TBC link in German', () => {
    expect(parseWowheadLink('https://www.wowhead.com/tbc/de/item=19019')).toEqual({
      url: 'https://www.wowhead.com/tbc/de/item=19019', site: 'tbc', lang: 'de', itemId: 19019,
    });
  });

  it('reads retail links, with and without a language', () => {
    expect(parseWowheadLink('https://www.wowhead.com/item=19019')).toEqual({
      url: 'https://www.wowhead.com/item=19019', site: '', lang: '', itemId: 19019,
    });
    expect(parseWowheadLink('https://www.wowhead.com/de/item=19019')).toEqual({
      url: 'https://www.wowhead.com/de/item=19019', site: '', lang: 'de', itemId: 19019,
    });
  });

  it('reads a WoW Forever link', () => {
    expect(parseWowheadLink('https://www.wowhead.com/forever/item=19019')?.site).toBe('forever');
  });

  it('drops the name Wowhead adds after the ID', () => {
    expect(parseWowheadLink('https://www.wowhead.com/tbc/item=19019/thunderfury-blessed-blade-of-the-windseeker')?.url)
      .toBe('https://www.wowhead.com/tbc/item=19019');
  });

  it('ignores spaces and a line break around the link', () => {
    expect(parseWowheadLink('  https://www.wowhead.com/tbc/item=19019\r\n')?.itemId).toBe(19019);
  });

  it.each([
    ['another site', 'https://www.example.com/tbc/item=19019'],
    ['a spell', 'https://www.wowhead.com/tbc/spell=133'],
    ['text around the link', 'see https://www.wowhead.com/tbc/item=19019'],
    ['the language before the game', 'https://www.wowhead.com/de/tbc/item=19019'],
    ['an unknown language', 'https://www.wowhead.com/tbc/xx/item=19019'],
    ['item 0', 'https://www.wowhead.com/tbc/item=0'],
    ['plain http', 'http://www.wowhead.com/tbc/item=19019'],
    ['nothing', ''],
  ])('rejects %s', (_, text) => {
    expect(parseWowheadLink(text)).toBeNull();
  });

  it('rejects a huge clipboard quickly', () => {
    const text = 'https://www.wowhead.com/tbc/item=19019 ' + 'x'.repeat(5_000_000);
    const started = performance.now();
    expect(parseWowheadLink(text)).toBeNull();
    expect(performance.now() - started).toBeLessThan(50);
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `npx vitest run test/wowheadLink.test.ts`
Expected: FAIL, `Failed to resolve import "../src/shared/wowheadLink"`.

- [ ] **Step 7: Write `app/src/shared/wowheadLink.ts`**

```ts
/** A Wowhead item address the add-on copied, e.g. https://www.wowhead.com/tbc/de/item=19019. */
export interface WowheadLink {
  /** The address, rebuilt with nothing after the item ID. */
  url: string;
  /** Wowhead's game path: "tbc", "forever", or "" for retail. */
  site: string;
  /** Wowhead's language path: "de", "fr", … or "" for English. */
  lang: string;
  itemId: number;
}

/** The language paths Wowhead accepts after the game path (the add-on's Url.lua uses the same). */
const LANGUAGES = new Set(['de', 'es', 'mx', 'fr', 'it', 'pt', 'ru', 'ko', 'cn', 'tw']);

/** The longest clipboard text worth reading, in characters; a link is far shorter. */
const MAX_LINK_LENGTH = 300;

const LINK = /^https:\/\/www\.wowhead\.com\/(?:([a-z-]+)\/)?(?:([a-z]{2})\/)?item=(\d+)(?:[/?#]\S*)?$/;

/** Reads a Wowhead item link, or returns null for anything else. */
export function parseWowheadLink(text: string): WowheadLink | null {
  if (text.length > MAX_LINK_LENGTH) return null;
  const match = LINK.exec(text.trim());
  if (!match) return null;
  let site = match[1] ?? '';
  let lang = match[2] ?? '';
  // Retail links have only a language: /de/item=19019.
  if (!lang && LANGUAGES.has(site)) {
    lang = site;
    site = '';
  }
  if (lang && !LANGUAGES.has(lang)) return null;
  const itemId = Number(match[3]);
  if (!Number.isSafeInteger(itemId) || itemId <= 0) return null;
  const path = [site, lang].filter(Boolean).map((part) => `${part}/`).join('');
  return { url: `https://www.wowhead.com/${path}item=${itemId}`, site, lang, itemId };
}
```

- [ ] **Step 8: Run the tests and the type check**

Run: `npx vitest run test/wowheadLink.test.ts && npm run typecheck`
Expected: all tests in the file pass, and `tsc` prints nothing.

- [ ] **Step 9: Commit**

```bash
cd "/d/Development/WoW Addons/WowheadGatherer"
git add app/package.json app/package-lock.json app/tsconfig.json app/vitest.config.ts app/src app/test/wowheadLink.test.ts
git commit -m "feat(app): Electron toolchain and the Wowhead link parser" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Reading a Wowhead item page

**Files:**
- Create: `app/src/main/wowheadPage.ts`, `app/src/main/zones.ts`, `app/test/fixtures.ts`, `app/test/wowheadPage.test.ts`
- Uses (already committed): `app/test/fixtures/item-*.html.gz`, `global-tbc.js.gz`, `tooltip-28773.json`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `interface GathererEntry { name: string; quality?: number; icon?: string }`
  - `type GathererData = Map<number, Map<number, GathererEntry>>` (type numbers: 1 NPC, 2 object, 3 item, 5 quest, 6 spell, 7 zone)
  - `type ListviewRow = Record<string, unknown>`
  - `interface RawComment { body: string; rating: number; date: string; user: string; indent: number; sticky: boolean; deleted: boolean }`
  - `interface ItemPage { gatherer: GathererData; listviews: Map<string, ListviewRow[]>; comments: RawComment[] }`
  - `sliceBracketed(text: string, start: number): string | null`
  - `parseItemPage(html: string): ItemPage`
  - `type ZoneNames = Map<number, string>`, `parseZoneNames(script: string): ZoneNames`
  - test helper `fixture(name: string): string`

- [ ] **Step 1: Write the fixture helper and the failing tests**

`app/test/fixtures.ts`:

```ts
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

/** A saved Wowhead file from test/fixtures, unzipped when its name ends in .gz. */
export function fixture(name: string): string {
  const data = readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
  return (name.endsWith('.gz') ? gunzipSync(data) : data).toString('utf8');
}
```

`app/test/wowheadPage.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseItemPage, sliceBracketed } from '../src/main/wowheadPage';
import { parseZoneNames } from '../src/main/zones';
import { fixture } from './fixtures';

describe('sliceBracketed', () => {
  it('finds the matching bracket', () => {
    expect(sliceBracketed('x [1, {"a": [2]}] y', 2)).toBe('[1, {"a": [2]}]');
  });

  it('ignores brackets in strings of either quote, with escapes', () => {
    const text = `{"a": "]}", b: '}{', c: "say \\"]\\""}`;
    expect(sliceBracketed(text, 0)).toBe(text);
  });

  it('returns null when the bracket never closes', () => {
    expect(sliceBracketed('[1, [2]', 0)).toBeNull();
  });
});

describe('parseItemPage', () => {
  it('reads the item, its tables and its comments (Gorehowl)', () => {
    const page = parseItemPage(fixture('item-28773.html.gz'));
    expect(page.gatherer.get(3)?.get(28773)).toEqual({ name: 'Gorehowl', quality: 4, icon: 'inv_axe_60' });
    const droppedBy = page.listviews.get('dropped-by');
    expect(droppedBy).toHaveLength(1);
    expect(droppedBy?.[0]).toMatchObject({ name: 'Prince Malchezaar', location: [3457], count: 327, outof: 1822 });
    expect(page.comments).toHaveLength(90);
    expect(page.comments[0]).toMatchObject({ rating: 300, user: '7600', indent: 0, sticky: false, deleted: false });
  });

  it('reads every source table (Netherweave Cloth)', () => {
    const page = parseItemPage(fixture('item-21877.html.gz'));
    expect(page.listviews.get('dropped-by')).toHaveLength(200);
    expect(page.listviews.get('contained-in-item')).toHaveLength(2);
    expect(page.listviews.get('contained-in-object')).toHaveLength(15);
    expect(page.listviews.get('fished-in')).toHaveLength(2);
    expect(page.listviews.get('reagent-for')).toHaveLength(14);
  });

  it('reads vendor prices in badges (Faceguard of Determination)', () => {
    const page = parseItemPage(fixture('item-32083.html.gz'));
    expect(page.listviews.get('sold-by')?.[0]).toMatchObject({ name: "G'eras", cost: [[0, [], [[29434, 50]]]] });
    expect(page.gatherer.get(3)?.get(29434)?.name).toBe('Badge of Justice');
  });

  it('finds no item on the not-found page', () => {
    expect(parseItemPage(fixture('item-999999.html.gz')).gatherer.get(3)?.get(999999)).toBeUndefined();
  });

  it('copes with a page that is not a Wowhead page', () => {
    expect(parseItemPage('<html><body>Request blocked.</body></html>')).toEqual({
      gatherer: new Map(), listviews: new Map(), comments: [],
    });
  });

  it('skips data that is cut off', () => {
    expect(parseItemPage('WH.Gatherer.addData(3, 5, {"1":{"name_enus":"Cut').gatherer.size).toBe(0);
  });
});

describe('parseZoneNames', () => {
  it('reads the TBC zone names', () => {
    const zones = parseZoneNames(fixture('global-tbc.js.gz'));
    expect(zones.size).toBe(168);
    expect(zones.get(3457)).toBe('Karazhan');
    expect(zones.get(12)).toBe('Elwynn Forest');
  });

  it('has no names for anything else', () => {
    expect(parseZoneNames('nothing here').size).toBe(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run test/wowheadPage.test.ts`
Expected: FAIL, `Failed to resolve import "../src/main/wowheadPage"`.

- [ ] **Step 3: Write `app/src/main/wowheadPage.ts`**

```ts
/** One thing a Wowhead page mentions: its name, and for items their quality and icon. */
export interface GathererEntry {
  name: string;
  quality?: number;
  icon?: string;
}

/** Wowhead's type number (1 NPC, 2 object, 3 item, 5 quest, 6 spell, 7 zone) → ID → entry. */
export type GathererData = Map<number, Map<number, GathererEntry>>;

/** One row of a Listview table, as Wowhead wrote it. */
export type ListviewRow = Record<string, unknown>;

export interface RawComment {
  body: string;
  rating: number;
  date: string;
  user: string;
  /** 0 for a top-level comment, more for replies. */
  indent: number;
  sticky: boolean;
  deleted: boolean;
}

/** What an item page's inline scripts hold. */
export interface ItemPage {
  gatherer: GathererData;
  /** Listview tables by their ID, e.g. "dropped-by". */
  listviews: Map<string, ListviewRow[]>;
  comments: RawComment[];
}

const GATHERER_CALL = /WH\.Gatherer\.addData\((\d+),\s*\d+,\s*\{/g;
const LISTVIEW_CALL = /new Listview\(\s*\{/g;
// The key must start the property, so "parentid" or "metadata" don't count.
const LISTVIEW_ID = /(?:^|[\s,{])["']?id["']?\s*:\s*["']([^"']+)["']/;
const LISTVIEW_DATA = /(?:^|[\s,{])["']?data["']?\s*:\s*\[/;
const COMMENTS = /var lv_comments0 = \[/;

/**
 * Returns the JSON or JavaScript array or object starting at text[start] (a "[" or "{"),
 * or null when it never closes. Brackets inside quoted strings don't count.
 */
export function sliceBracketed(text: string, start: number): string | null {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '[' || c === '{') {
      depth++;
    } else if (c === ']' || c === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function parseJson(text: string | null): unknown {
  if (text === null) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readGatherer(html: string): GathererData {
  const data: GathererData = new Map();
  for (const match of html.matchAll(GATHERER_CALL)) {
    const entries = parseJson(sliceBracketed(html, (match.index ?? 0) + match[0].length - 1));
    if (!isObject(entries)) continue;
    const type = Number(match[1]);
    const byId = data.get(type) ?? new Map<number, GathererEntry>();
    data.set(type, byId);
    for (const [id, raw] of Object.entries(entries)) {
      if (!isObject(raw) || byId.has(Number(id))) continue;
      // Names are keyed by language, e.g. name_enus or name_dede.
      const nameKey = Object.keys(raw).find((key) => key.startsWith('name_')) ?? 'name';
      const name = raw[nameKey];
      if (typeof name !== 'string') continue;
      byId.set(Number(id), {
        name,
        quality: typeof raw.quality === 'number' ? raw.quality : undefined,
        icon: typeof raw.icon === 'string' ? raw.icon : undefined,
      });
    }
  }
  return data;
}

function readListviews(html: string): Map<string, ListviewRow[]> {
  const listviews = new Map<string, ListviewRow[]>();
  const calls = [...html.matchAll(LISTVIEW_CALL)];
  calls.forEach((match, i) => {
    // Look only up to the next Listview, so one table can't take another's data.
    const braceAt = (match.index ?? 0) + match[0].length - 1;
    const end = calls[i + 1]?.index ?? html.length;
    const options = sliceBracketed(html.slice(braceAt, end), 0);
    if (options === null) return;
    const dataAt = LISTVIEW_DATA.exec(options);
    // Comments, screenshots and videos fill themselves in later; they have no data here.
    if (!dataAt) return;
    const id = LISTVIEW_ID.exec(options.slice(0, dataAt.index))?.[1];
    const rows = parseJson(sliceBracketed(options, dataAt.index + dataAt[0].length - 1));
    if (id && Array.isArray(rows) && !listviews.has(id)) {
      listviews.set(id, rows.filter(isObject));
    }
  });
  return listviews;
}

function readComments(html: string): RawComment[] {
  const match = COMMENTS.exec(html);
  if (!match) return [];
  const rows = parseJson(sliceBracketed(html, match.index + match[0].length - 1));
  if (!Array.isArray(rows)) return [];
  return rows.filter(isObject).map((row) => ({
    body: typeof row.body === 'string' ? row.body : '',
    rating: typeof row.rating === 'number' ? row.rating : 0,
    date: typeof row.date === 'string' ? row.date : '',
    user: typeof row.user === 'string' ? row.user : '',
    indent: typeof row.indent === 'number' ? row.indent : 0,
    sticky: Boolean(row.sticky),
    deleted: Boolean(row.deleted),
  }));
}

/** Reads the data a Wowhead item page carries in its inline scripts. */
export function parseItemPage(html: string): ItemPage {
  return { gatherer: readGatherer(html), listviews: readListviews(html), comments: readComments(html) };
}
```

- [ ] **Step 4: Write `app/src/main/zones.ts`**

```ts
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
```

- [ ] **Step 5: Run the tests and the type check**

Run: `npx vitest run test/wowheadPage.test.ts && npm run typecheck`
Expected: PASS, and `tsc` prints nothing.

- [ ] **Step 6: Commit**

```bash
cd "/d/Development/WoW Addons/WowheadGatherer"
git add app/src/main/wowheadPage.ts app/src/main/zones.ts app/test/fixtures.ts app/test/wowheadPage.test.ts
git commit -m "feat(app): read Wowhead item pages and zone names" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Shared types, money, comment markup and the best comments

**Files:**
- Create: `app/src/shared/types.ts`, `app/src/shared/money.ts`, `app/src/main/markup.ts`, `app/src/main/comments.ts`, `app/test/markup.test.ts`, `app/test/comments.test.ts`

**Interfaces:**
- Consumes:
  - from Task 3: `WowheadLink`
  - from Task 4: `ItemPage`, `RawComment`, `parseItemPage`, `fixture`
- Produces:
  - `types.ts`: `SourceRow { name: string; details: string[] }`, `SourceSection { title: string; rows: SourceRow[]; total: number }`, `MarkupContainerKind`, `MarkupNode`, `ItemComment { user; rating; date; body: MarkupNode[] }`, `ItemHeader { name; quality; icon }`, `ItemInfo extends ItemHeader { sections; comments; commentTotal }`, `PopupState` (`loading` / `ready` / `error`)
  - `formatMoney(copper: number): string`
  - `type NameLookup = (type: string, id: number) => string | undefined`, `MAX_COMMENT_CHARS = 600`, `parseMarkup(body: string, nameOf: NameLookup): MarkupNode[]`
  - `COMMENTS_SHOWN = 3`, `formatCommentDate(iso: string): string`, `pickComments(page: ItemPage, nameOf: NameLookup): { comments: ItemComment[]; total: number }`

- [ ] **Step 1: Write `app/src/shared/types.ts`** (types only; the tests below use them)

```ts
import type { WowheadLink } from './wowheadLink';

/** One line of a section: who or what, and the details after it. */
export interface SourceRow {
  name: string;
  /** e.g. ["Karazhan", "18%"], shown joined with " · ". */
  details: string[];
}

export interface SourceSection {
  title: string;
  rows: SourceRow[];
  /** How many rows Wowhead lists; more than rows.length means "+N more on Wowhead". */
  total: number;
}

export type MarkupContainerKind = 'bold' | 'italic' | 'underline' | 'small' | 'quote' | 'listItem';

/** A comment's text after Wowhead's markup is read: never HTML. */
export type MarkupNode =
  | { kind: 'text'; text: string }
  | { kind: 'break' }
  | { kind: MarkupContainerKind; children: MarkupNode[] };

export interface ItemComment {
  /** The author's name, or "" when Wowhead only has a number for them. */
  user: string;
  rating: number;
  /** e.g. "Feb 2007". */
  date: string;
  body: MarkupNode[];
}

export interface ItemHeader {
  name: string;
  /** 0 poor … 5 legendary, 6 artifact, 7 heirloom, as in the game. */
  quality: number;
  /** The icon's file name on Wowhead's image server, e.g. "inv_axe_60", or "". */
  icon: string;
}

export interface ItemInfo extends ItemHeader {
  sections: SourceSection[];
  comments: ItemComment[];
  /** Top-level comments on the page, of which `comments` are the best few. */
  commentTotal: number;
}

/** What the popup shows. */
export type PopupState =
  | { kind: 'loading'; link: WowheadLink }
  | { kind: 'ready'; link: WowheadLink; info: ItemInfo }
  | { kind: 'error'; link: WowheadLink; message: string; header: ItemHeader | null };
```

- [ ] **Step 2: Write the failing tests**

`app/test/markup.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MAX_COMMENT_CHARS, parseMarkup, type NameLookup } from '../src/main/markup';
import { formatMoney } from '../src/shared/money';
import type { MarkupNode } from '../src/shared/types';

const names: NameLookup = (type, id) => (type === 'item' && id === 21877 ? 'Netherweave Cloth' : undefined);
const parse = (body: string) => parseMarkup(body, names);
const text = (value: string): MarkupNode => ({ kind: 'text', text: value });

describe('formatMoney', () => {
  it.each([
    [0, '0c'], [25, '25c'], [100, '1s'], [10000, '1g'], [12345, '1g 23s 45c'], [10050, '1g 50c'], [-5, '0c'], [12.9, '12c'],
  ])('%d copper is %s', (copper, expected) => {
    expect(formatMoney(copper)).toBe(expected);
  });
});

describe('parseMarkup', () => {
  it('keeps plain text', () => {
    expect(parse('Buy it from innkeepers')).toEqual([text('Buy it from innkeepers')]);
  });

  it('turns line breaks into breaks', () => {
    expect(parse('a\r\n\r\nb')).toEqual([text('a'), { kind: 'break' }, { kind: 'break' }, text('b')]);
  });

  it('reads bold and italic', () => {
    expect(parse('[b]bold[/b] and [i]it[/i]')).toEqual([
      { kind: 'bold', children: [text('bold')] }, text(' and '), { kind: 'italic', children: [text('it')] },
    ]);
  });

  it('closes tags left open', () => {
    expect(parse('[b]x [i]y')).toEqual([{ kind: 'bold', children: [text('x '), { kind: 'italic', children: [text('y')] }] }]);
  });

  it('closes inner tags along with their outer one', () => {
    expect(parse('[b][i]x[/b]y')).toEqual([{ kind: 'bold', children: [{ kind: 'italic', children: [text('x')] }] }, text('y')]);
  });

  it('ignores a closing tag with nothing open', () => {
    expect(parse('[/b]x')).toEqual([text('x')]);
  });

  it('names the items it knows and numbers the rest', () => {
    expect(parse('[item=21877] and [npc=999]')).toEqual([text('Netherweave Cloth and NPC 999')]);
  });

  it('keeps link text, not the address', () => {
    expect(parse('[url=https://example.com]a site[/url]')).toEqual([text('a site')]);
  });

  it('shows money', () => {
    expect(parse('[money=12345]')).toEqual([text('1g 23s 45c')]);
  });

  it('reads lists', () => {
    expect(parse('[ul][li]one[/li][li]two[/li][/ul]')).toEqual([
      { kind: 'listItem', children: [text('one')] }, { kind: 'listItem', children: [text('two')] },
    ]);
  });

  it('drops styling tags but keeps their text', () => {
    expect(parse('[color=q3]blue[/color]')).toEqual([text('blue')]);
  });

  it('keeps square brackets that are not Wowhead tags', () => {
    expect(parse('Buy [Hearthstone] now')).toEqual([text('Buy [Hearthstone] now')]);
    expect(parse('[constructor=1]x')).toEqual([text('[constructor=1]x')]);
  });

  it('decodes entities', () => {
    expect(parse('a&nbsp;b &amp; c&#39;s')).toEqual([text("a b & c's")]);
  });

  it('ignores impossible character numbers', () => {
    expect(parse('&#99999999;')).toEqual([text('&#99999999;')]);
  });

  it('keeps HTML as plain text', () => {
    expect(parse('<img src=x onerror=alert(1)>')).toEqual([text('<img src=x onerror=alert(1)>')]);
  });

  it('cuts long comments short', () => {
    expect(parse('x'.repeat(1000))).toEqual([text('x'.repeat(MAX_COMMENT_CHARS) + '…')]);
  });
});
```

`app/test/comments.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatCommentDate, pickComments } from '../src/main/comments';
import type { NameLookup } from '../src/main/markup';
import { parseItemPage, type ItemPage, type RawComment } from '../src/main/wowheadPage';
import { fixture } from './fixtures';

const none: NameLookup = () => undefined;

function comment(over: Partial<RawComment>): RawComment {
  return { body: 'x', rating: 0, date: '', user: 'someone', indent: 0, sticky: false, deleted: false, ...over };
}

describe('pickComments', () => {
  it('picks the three best top-level comments (Thunderfury)', () => {
    const { comments, total } = pickComments(parseItemPage(fixture('item-19019.html.gz')), none);
    expect(total).toBe(350);
    expect(comments.map((c) => c.rating)).toEqual([522, 283, 262]);
    expect(comments[0]).toMatchObject({ user: 'Koen', date: 'Dec 2006' });
  });

  it('leaves out authors Wowhead only knows by number (Gorehowl)', () => {
    const { comments } = pickComments(parseItemPage(fixture('item-28773.html.gz')), none);
    expect(comments[0]).toMatchObject({ user: '', rating: 300, date: 'Feb 2007' });
  });

  it('puts pinned comments first and skips replies and deleted ones', () => {
    const page: ItemPage = {
      gatherer: new Map(),
      listviews: new Map(),
      comments: [
        comment({ user: 'reply', rating: 999, indent: 1 }),
        comment({ user: 'deleted', rating: 500, deleted: true }),
        comment({ user: 'good', rating: 50 }),
        comment({ user: 'pinned', rating: 1, sticky: true }),
      ],
    };
    const { comments, total } = pickComments(page, none);
    expect(total).toBe(2);
    expect(comments.map((c) => c.user)).toEqual(['pinned', 'good']);
  });
});

describe('formatCommentDate', () => {
  it('gives the month and year', () => {
    expect(formatCommentDate('2007-02-01T18:19:05-06:00')).toBe('Feb 2007');
  });

  it('gives nothing for a bad date', () => {
    expect(formatCommentDate('nonsense')).toBe('');
  });
});
```

- [ ] **Step 3: Run them and watch them fail**

Run: `npx vitest run test/markup.test.ts test/comments.test.ts`
Expected: FAIL, unresolved imports for `markup`, `money` and `comments`.

- [ ] **Step 4: Write `app/src/shared/money.ts`**

```ts
/** 12345 copper → "1g 23s 45c", leaving out the parts that are zero. */
export function formatMoney(copper: number): string {
  const total = Math.max(0, Math.floor(copper));
  const gold = Math.floor(total / 10000);
  const silver = Math.floor((total % 10000) / 100);
  const rest = total % 100;
  const parts: string[] = [];
  if (gold) parts.push(`${gold}g`);
  if (silver) parts.push(`${silver}s`);
  if (rest || parts.length === 0) parts.push(`${rest}c`);
  return parts.join(' ');
}
```

- [ ] **Step 5: Write `app/src/main/markup.ts`**

```ts
import { formatMoney } from '../shared/money';
import type { MarkupContainerKind, MarkupNode } from '../shared/types';

/** Looks up a name for [item=…], [npc=…] and the like, or undefined. */
export type NameLookup = (type: string, id: number) => string | undefined;

/** The most text one comment shows, in characters; Wowhead has the rest. */
export const MAX_COMMENT_CHARS = 600;

/** Tags that wrap text in a style. */
const CONTAINERS = new Map<string, MarkupContainerKind>([
  ['b', 'bold'], ['i', 'italic'], ['u', 'underline'], ['small', 'small'], ['quote', 'quote'], ['li', 'listItem'],
]);
/** Tags that stand for a game object, with the word used when the page doesn't name it. */
const OBJECT_TAGS = new Map<string, string>([
  ['item', 'item'], ['npc', 'NPC'], ['quest', 'quest'], ['spell', 'spell'], ['zone', 'zone'], ['object', 'object'],
]);
/** Wowhead tags that only style or link their text: the tag goes, its text stays. */
const DROPPED_TAGS = new Set([
  'url', 'color', 'ul', 'ol', 'span', 'div', 'table', 'tr', 'td', 'th', 'pad', 'acronym', 'tooltip',
  'icondb', 'icon', 's', 'code', 'center', 'h2', 'h3', 'hr', 'img', 'toggler',
]);
const TAG = /\[(\/?)([a-z0-9]+)(?:=([^\]\s]*))?[^\]]*\]/gi;
const ENTITY = /&(#\d+|#x[0-9a-f]+|[a-z]+);/gi;
const NAMED_ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(text: string): string {
  return text.replace(ENTITY, (whole, name: string) => {
    const lower = name.toLowerCase();
    if (lower.startsWith('#')) {
      const code = lower.startsWith('#x') ? parseInt(lower.slice(2), 16) : Number(lower.slice(1));
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return Object.hasOwn(NAMED_ENTITIES, lower) ? NAMED_ENTITIES[lower] : whole;
  });
}

/** Reads Wowhead's comment markup into nodes the popup shows as text. */
export function parseMarkup(body: string, nameOf: NameLookup): MarkupNode[] {
  const root: MarkupNode[] = [];
  const stack: { tag: string; children: MarkupNode[] }[] = [{ tag: '', children: root }];
  let budget = MAX_COMMENT_CHARS;
  let full = false;

  const top = () => stack[stack.length - 1];
  const pushText = (value: string) => {
    if (full || value === '') return;
    let piece = value;
    if (piece.length > budget) {
      piece = piece.slice(0, budget).trimEnd() + '…';
      full = true;
    }
    budget -= piece.length;
    const children = top().children;
    const last = children[children.length - 1];
    if (last?.kind === 'text') last.text += piece;
    else children.push({ kind: 'text', text: piece });
  };
  const addText = (raw: string) => {
    decodeEntities(raw).split(/\r?\n/).forEach((line, i) => {
      if (i > 0 && !full) top().children.push({ kind: 'break' });
      pushText(line);
    });
  };

  let at = 0;
  for (const match of body.matchAll(TAG)) {
    const index = match.index ?? 0;
    addText(body.slice(at, index));
    at = index + match[0].length;
    const closing = match[1] === '/';
    const tag = match[2].toLowerCase();
    const value = match[3];
    const container = CONTAINERS.get(tag);

    if (closing) {
      if (container) {
        // Close it, and anything opened inside it; a stray closing tag is ignored.
        const depth = stack.findLastIndex((frame) => frame.tag === tag);
        if (depth > 0) stack.length = depth;
      } else if (!DROPPED_TAGS.has(tag)) {
        addText(match[0]);
      }
      continue;
    }
    if (container) {
      if (full) continue;
      const node = { kind: container, children: [] as MarkupNode[] };
      top().children.push(node);
      stack.push({ tag, children: node.children });
    } else if (OBJECT_TAGS.has(tag) && value && /^\d+$/.test(value)) {
      pushText(nameOf(tag, Number(value)) ?? `${OBJECT_TAGS.get(tag)} ${value}`);
    } else if (tag === 'money' && value && /^\d+$/.test(value)) {
      pushText(formatMoney(Number(value)));
    } else if (!DROPPED_TAGS.has(tag)) {
      // Not a Wowhead tag, e.g. "[Hearthstone]" typed by hand: keep it as written.
      addText(match[0]);
    }
  }
  addText(body.slice(at));
  return root;
}
```

`Array.prototype.findLastIndex` needs the ES2023 lib. In `app/tsconfig.json`, change `"lib": ["ES2022", "DOM", "DOM.Iterable"]` to `"lib": ["ES2023", "DOM", "DOM.Iterable"]`.

- [ ] **Step 6: Write `app/src/main/comments.ts`**

```ts
import type { ItemComment } from '../shared/types';
import { parseMarkup, type NameLookup } from './markup';
import type { ItemPage } from './wowheadPage';

/** How many comments the popup shows. */
export const COMMENTS_SHOWN = 3;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2007-02-01T18:19:05-06:00" → "Feb 2007", or "" when it isn't a date. */
export function formatCommentDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** The best few top-level comments (pinned first, then by rating), and how many top-level comments there are. */
export function pickComments(page: ItemPage, nameOf: NameLookup): { comments: ItemComment[]; total: number } {
  const topLevel = page.comments.filter((c) => !c.deleted && c.indent === 0);
  const best = [...topLevel]
    .sort((a, b) => Number(b.sticky) - Number(a.sticky) || b.rating - a.rating)
    .slice(0, COMMENTS_SHOWN);
  return {
    total: topLevel.length,
    comments: best.map((c) => ({
      // Comments from Wowhead's early days only have a number for their author.
      user: /^\d*$/.test(c.user) ? '' : c.user,
      rating: c.rating,
      date: formatCommentDate(c.date),
      body: parseMarkup(c.body, nameOf),
    })),
  };
}
```

- [ ] **Step 7: Run the tests and the type check**

Run: `npx vitest run test/markup.test.ts test/comments.test.ts && npm run typecheck`
Expected: PASS, and `tsc` prints nothing.

- [ ] **Step 8: Commit**

```bash
cd "/d/Development/WoW Addons/WowheadGatherer"
git add app/tsconfig.json app/src/shared/types.ts app/src/shared/money.ts app/src/main/markup.ts app/src/main/comments.ts app/test/markup.test.ts app/test/comments.test.ts
git commit -m "feat(app): read Wowhead comment markup and pick the best comments" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Sources: what the popup lists

**Files:**
- Create: `app/src/main/itemInfo.ts`, `app/test/itemInfo.test.ts`

**Interfaces:**
- Consumes:
  - from Task 4: `ItemPage`, `ListviewRow`, `GathererData`, `ZoneNames`, `parseItemPage`, `parseZoneNames`, `fixture`
  - from Task 5: `ItemInfo`, `SourceRow`, `SourceSection`, `formatMoney`, `NameLookup`, `pickComments`
- Produces:
  - `ROWS_PER_SECTION = 5`, `MIN_SAMPLE = 20`
  - `formatChance(count: unknown, outof: unknown): string | null`
  - `pageNames(page: ItemPage, zones: ZoneNames): NameLookup`
  - `buildItemInfo(itemId: number, page: ItemPage, zones: ZoneNames): ItemInfo | null`

- [ ] **Step 1: Write the failing tests**

`app/test/itemInfo.test.ts` (the expected values were read from the saved pages):

```ts
import { describe, expect, it } from 'vitest';
import { buildItemInfo, formatChance } from '../src/main/itemInfo';
import { parseItemPage, type ItemPage, type ListviewRow } from '../src/main/wowheadPage';
import { parseZoneNames } from '../src/main/zones';
import { fixture } from './fixtures';

const zones = parseZoneNames(fixture('global-tbc.js.gz'));
const info = (id: number) => {
  const built = buildItemInfo(id, parseItemPage(fixture(`item-${id}.html.gz`)), zones);
  if (!built) throw new Error(`no info for ${id}`);
  return built;
};
const section = (id: number, title: string) => {
  const found = info(id).sections.find((s) => s.title === title);
  if (!found) throw new Error(`no "${title}" for ${id}`);
  return found;
};

describe('formatChance', () => {
  it.each([
    [327, 1822, '18%'], [20, 25, '80%'], [74, 956, '7.7%'], [1, 116, '0.86%'], [1, 21720, '<0.01%'], [5, 4, '100%'],
  ])('%d of %d is %s', (count, outof, expected) => {
    expect(formatChance(count, outof)).toBe(expected);
  });

  it.each([[-1, 10], [0, 10], [3, 0], [undefined, 5], ['3', 5]])('has no chance for %s of %s', (count, outof) => {
    expect(formatChance(count, outof)).toBeNull();
  });
});

describe('buildItemInfo', () => {
  it('Gorehowl: dropped by Prince Malchezaar in Karazhan', () => {
    const gorehowl = info(28773);
    expect(gorehowl).toMatchObject({ name: 'Gorehowl', quality: 4, icon: 'inv_axe_60', commentTotal: 90 });
    expect(gorehowl.sections).toEqual([
      { title: 'Dropped by', total: 1, rows: [{ name: 'Prince Malchezaar', details: ['Karazhan', '18%'] }] },
    ]);
  });

  it('Netherweave Cloth: best drop chances first, small samples last', () => {
    expect(info(21877).sections.map((s) => s.title)).toEqual(['Dropped by', 'Contained in', 'Fished in']);
    const dropped = section(21877, 'Dropped by');
    expect(dropped.total).toBe(200);
    expect(dropped.rows).toEqual([
      { name: 'Heckling Fel Sprite', details: ['Hellfire Peninsula', '83%'] },
      { name: 'Flamewaker Imp', details: ['Hellfire Peninsula', '82%'] },
      { name: 'Trogma', details: ["Blade's Edge Mountains", '80%'] },
      { name: 'Dr. Boom', details: ['Netherstorm', '79%'] },
      { name: 'Dreadwarden', details: ['Shadowmoon Valley', '78%'] },
    ]);
  });

  it('Netherweave Cloth: containers from items and objects together', () => {
    const contained = section(21877, 'Contained in');
    expect(contained.total).toBe(17);
    expect(contained.rows.map((r) => r.name)).toEqual([
      'Curious Crate', 'Enlistment Bonus', 'Heavy Fel Iron Chest', 'Felsteel Chest', 'Adamantite Bound Chest',
    ]);
    expect(contained.rows[0].details).toEqual(['32%']);
    expect(contained.rows[2].details).toEqual(["Terokkar Forest, Blade's Edge Mountains +1", '7.7%']);
    expect(section(21877, 'Fished in').rows[0]).toEqual({ name: 'Zangarmarsh', details: ['<0.01%'] });
  });

  it('Refreshing Spring Water: vendors with price and side, quests with level and side', () => {
    expect(info(159).sections.map((s) => s.title)).toEqual([
      'Dropped by', 'Sold by', 'Quest reward', 'Contained in', 'Mined from', 'Pickpocketed from',
    ]);
    const soldBy = section(159, 'Sold by');
    expect(soldBy.total).toBe(200);
    expect(soldBy.rows[0]).toEqual({ name: 'Brog Hamfist', details: ['Elwynn Forest', '25c', 'Alliance'] });
    expect(section(159, 'Quest reward').rows[0]).toEqual({ name: "A Rogue's Deal", details: ['Level 5', 'Horde'] });
    expect(section(159, 'Pickpocketed from').rows.map((r) => r.details.at(-1))).toEqual(['1.5%', '0.86%', '9.1%']);
    expect(section(159, 'Mined from').rows[0]).toEqual({ name: 'Copper Vein', details: ['The Barrens, Dun Morogh +1', '<0.01%'] });
  });

  it('Bolt of Netherweave: what it is crafted from', () => {
    expect(section(21840, 'Crafted with').rows).toEqual([{ name: 'Bolt of Netherweave', details: ['6 × Netherweave Cloth'] }]);
    expect(section(21840, 'Contained in').rows[1].details).toEqual(["Terokkar Forest, Blade's Edge Mountains +1", '2.0%']);
  });

  it('Faceguard of Determination: prices in badges, sold to both sides', () => {
    expect(section(32083, 'Sold by').rows).toEqual([{ name: "G'eras", details: ['Shattrath City', '50 × Badge of Justice'] }]);
  });

  it('Fel Iron Ore: mining', () => {
    expect(section(23424, 'Mined from').rows).toEqual([
      { name: 'Fel Iron Deposit', details: ['Hellfire Peninsula, Zangarmarsh +1', '99%'] },
    ]);
  });

  it('Thunderfury: a quest reward for both sides', () => {
    expect(section(19019, 'Quest reward').rows).toEqual([{ name: 'Rise, Thunderfury!', details: ['Level 60'] }]);
  });

  it('returns null when the page lacks the item', () => {
    expect(buildItemInfo(999999, parseItemPage(fixture('item-999999.html.gz')), zones)).toBeNull();
  });

  it('lists rows with missing details, just with fewer of them', () => {
    const page: ItemPage = {
      gatherer: new Map([[3, new Map([[1, { name: 'Thing', quality: 2 }]])]]),
      comments: [],
      listviews: new Map<string, ListviewRow[]>([
        ['dropped-by', [{ name: 'No Count' }, { name: 'Odd Count', count: -1, outof: 0, location: ['x', -1, 99999] }, { id: 5 }]],
        ['sold-by', [{ name: 'Free Vendor', cost: [[0]] }, { name: 'Strange Price', cost: [[0, [], [[42, 3], 'junk']]] }]],
        ['created-by-spell', [{ name: 'Mystery Recipe', reagents: [[77, 2], [null, 1]] }]],
      ]),
    };
    const thing = buildItemInfo(1, page, new Map());
    expect(thing).toMatchObject({ name: 'Thing', quality: 2, icon: '', comments: [], commentTotal: 0 });
    expect(thing?.sections).toEqual([
      { title: 'Dropped by', total: 3, rows: [{ name: 'No Count', details: [] }, { name: 'Odd Count', details: [] }] },
      { title: 'Sold by', total: 2, rows: [{ name: 'Free Vendor', details: [] }, { name: 'Strange Price', details: ['3 × item 42'] }] },
      { title: 'Crafted with', total: 1, rows: [{ name: 'Mystery Recipe', details: ['2 × item 77'] }] },
    ]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run test/itemInfo.test.ts`
Expected: FAIL, `Failed to resolve import "../src/main/itemInfo"`.

- [ ] **Step 3: Write `app/src/main/itemInfo.ts`**

```ts
import { formatMoney } from '../shared/money';
import type { ItemInfo, SourceRow, SourceSection } from '../shared/types';
import { pickComments } from './comments';
import type { NameLookup } from './markup';
import type { GathererData, ItemPage, ListviewRow } from './wowheadPage';
import type { ZoneNames } from './zones';

/** Rows shown per section; the rest are left to Wowhead ("+N more on Wowhead"). */
export const ROWS_PER_SECTION = 5;
/** Rows Wowhead saw fewer times than this sort last, so "2 of 2 kills" doesn't top the list. */
export const MIN_SAMPLE = 20;
/** Zones named per row; more show as "+N". */
const ZONES_PER_ROW = 2;

type RowStyle = 'chance' | 'vendor' | 'quest' | 'crafted';

/** The source tables shown, in order, by Wowhead's Listview IDs. Other tables are skipped. */
const SECTIONS: { title: string; ids: string[]; style: RowStyle }[] = [
  { title: 'Dropped by', ids: ['dropped-by'], style: 'chance' },
  { title: 'Sold by', ids: ['sold-by'], style: 'vendor' },
  { title: 'Quest reward', ids: ['reward-from-q'], style: 'quest' },
  { title: 'Crafted with', ids: ['created-by-spell'], style: 'crafted' },
  { title: 'Contained in', ids: ['contained-in-item', 'contained-in-object'], style: 'chance' },
  { title: 'Mined from', ids: ['mined-from-object'], style: 'chance' },
  // These two IDs aren't confirmed yet (Task 10 checks them in game).
  { title: 'Gathered from', ids: ['gathered-from-object'], style: 'chance' },
  { title: 'Skinned from', ids: ['skinned-from'], style: 'chance' },
  { title: 'Fished in', ids: ['fished-in'], style: 'chance' },
  { title: 'Pickpocketed from', ids: ['pick-pocketed-from'], style: 'chance' },
];

/** Wowhead's type numbers for the tags comments use. */
const TYPE_NUMBERS: Record<string, number> = { npc: 1, object: 2, item: 3, quest: 5, spell: 6, zone: 7 };

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** "18%" for 327 of 1822; null when Wowhead has no count. */
export function formatChance(count: unknown, outof: unknown): string | null {
  const seen = num(count);
  const of = num(outof);
  if (seen === undefined || of === undefined || seen <= 0 || of <= 0) return null;
  const percent = Math.min((seen * 100) / of, 100);
  if (percent >= 10) return `${Math.round(percent)}%`;
  if (percent >= 1) return `${percent.toFixed(1)}%`;
  if (percent >= 0.01) return `${percent.toFixed(2)}%`;
  return '<0.01%';
}

function chanceKey(row: ListviewRow): [number, number, number] {
  const count = num(row.count) ?? 0;
  const outof = num(row.outof) ?? 0;
  const percent = count > 0 && outof > 0 ? (count * 100) / outof : -1;
  return [outof >= MIN_SAMPLE ? 0 : 1, -percent, -count];
}

function byChance(a: ListviewRow, b: ListviewRow): number {
  const [aSample, aPercent, aCount] = chanceKey(a);
  const [bSample, bPercent, bCount] = chanceKey(b);
  return aSample - bSample || aPercent - bPercent || aCount - bCount || String(a.name).localeCompare(String(b.name));
}

function itemName(id: number, gatherer: GathererData): string {
  return gatherer.get(3)?.get(id)?.name ?? `item ${id}`;
}

/** "3 × Netherweave Cloth" for each [itemId, count] pair Wowhead lists. */
function itemCounts(pairs: unknown, gatherer: GathererData): string[] {
  if (!Array.isArray(pairs)) return [];
  return pairs.flatMap((pair) => {
    if (!Array.isArray(pair)) return [];
    const id = num(pair[0]);
    const count = num(pair[1]);
    return id === undefined || count === undefined ? [] : [`${count} × ${itemName(id, gatherer)}`];
  });
}

function zoneText(row: ListviewRow, zones: ZoneNames): string | null {
  if (!Array.isArray(row.location)) return null;
  const names = [...new Set(row.location.flatMap((id) => {
    const name = typeof id === 'number' && id > 0 ? zones.get(id) : undefined;
    return name === undefined ? [] : [name];
  }))];
  if (names.length === 0) return null;
  const shown = names.slice(0, ZONES_PER_ROW).join(', ');
  return names.length > ZONES_PER_ROW ? `${shown} +${names.length - ZONES_PER_ROW}` : shown;
}

/** A vendor's price. Wowhead writes it as [[copper, currencies, [[itemId, count], ...]]]. */
function costText(cost: unknown, gatherer: GathererData): string | null {
  if (!Array.isArray(cost) || !Array.isArray(cost[0])) return null;
  const [copper, , items] = cost[0] as unknown[];
  const parts: string[] = [];
  const money = num(copper);
  if (money !== undefined && money > 0) parts.push(formatMoney(money));
  parts.push(...itemCounts(items, gatherer));
  return parts.length > 0 ? parts.join(' + ') : null;
}

/** "Alliance" or "Horde" when only one side can deal with them. Wowhead's react is [alliance, horde], 1 = friendly. */
function factionText(react: unknown): string | null {
  if (!Array.isArray(react)) return null;
  const alliance = react[0] === 1;
  const horde = react[1] === 1;
  if (alliance && !horde) return 'Alliance';
  if (horde && !alliance) return 'Horde';
  return null;
}

/** A quest's side: 1 Alliance, 2 Horde, 3 both. */
function sideText(side: unknown): string | null {
  if (side === 1) return 'Alliance';
  if (side === 2) return 'Horde';
  return null;
}

function toRow(row: ListviewRow, style: RowStyle, page: ItemPage, zones: ZoneNames): SourceRow | null {
  if (typeof row.name !== 'string' || row.name === '') return null;
  let details: (string | null)[] = [];
  switch (style) {
    case 'chance':
      details = [zoneText(row, zones), formatChance(row.count, row.outof)];
      break;
    case 'vendor':
      details = [zoneText(row, zones), costText(row.cost, page.gatherer), factionText(row.react)];
      break;
    case 'quest':
      details = [num(row.level) ? `Level ${row.level}` : null, sideText(row.side)];
      break;
    case 'crafted': {
      const reagents = itemCounts(row.reagents, page.gatherer);
      details = [reagents.length > 0 ? reagents.join(', ') : null];
      break;
    }
  }
  return { name: row.name, details: details.filter((detail): detail is string => detail !== null) };
}

function buildSections(page: ItemPage, zones: ZoneNames): SourceSection[] {
  const sections: SourceSection[] = [];
  for (const { title, ids, style } of SECTIONS) {
    const rows = ids.flatMap((id) => page.listviews.get(id) ?? []);
    if (rows.length === 0) continue;
    // Vendors, quests and recipes keep Wowhead's order.
    const ordered = style === 'chance' ? [...rows].sort(byChance) : rows;
    const shown = ordered
      .map((row) => toRow(row, style, page, zones))
      .filter((row): row is SourceRow => row !== null)
      .slice(0, ROWS_PER_SECTION);
    sections.push({ title, rows: shown, total: rows.length });
  }
  return sections;
}

/** Names for the [item=…]-style tags in comments: from the page's own data, and the zone list. */
export function pageNames(page: ItemPage, zones: ZoneNames): NameLookup {
  return (type, id) =>
    (type === 'zone' ? zones.get(id) : undefined) ?? page.gatherer.get(TYPE_NUMBERS[type] ?? -1)?.get(id)?.name;
}

/** Everything the popup shows for an item, or null when the page doesn't have the item's data. */
export function buildItemInfo(itemId: number, page: ItemPage, zones: ZoneNames): ItemInfo | null {
  const item = page.gatherer.get(3)?.get(itemId);
  if (!item) return null;
  const { comments, total } = pickComments(page, pageNames(page, zones));
  return {
    name: item.name,
    quality: item.quality ?? 1,
    icon: item.icon ?? '',
    sections: buildSections(page, zones),
    comments,
    commentTotal: total,
  };
}
```

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run test/itemInfo.test.ts && npm run typecheck`
Expected: PASS, and `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
cd "/d/Development/WoW Addons/WowheadGatherer"
git add app/src/main/itemInfo.ts app/test/itemInfo.test.ts
git commit -m "feat(app): turn Wowhead's tables into the popup's source sections" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The Wowhead client: fetch, fall back, cache

**Files:**
- Create: `app/src/main/cache.ts`, `app/src/main/wowheadClient.ts`, `app/test/cache.test.ts`, `app/test/wowheadClient.test.ts`

**Interfaces:**
- Consumes:
  - from Task 3: `WowheadLink`, `parseWowheadLink`
  - from Task 4: `parseItemPage`, `parseZoneNames`, `ZoneNames`, `fixture`
  - from Task 5: `PopupState`, `ItemHeader`, `ItemInfo`
  - from Task 6: `buildItemInfo`
- Produces:
  - `class DiskCache { constructor(dir: string); get<T>(key: string, maxAgeMs: number, now?: number): T | undefined; set<T>(key: string, value: T, now?: number): void }`
  - `interface FetchResult { status: number; url: string; text: string }`
  - `interface ClientDeps { fetchText(url, headers): Promise<FetchResult>; loadInBrowser(url): Promise<string | null>; cache: DiskCache; now?: () => number }`
  - `class WowheadClient { constructor(deps: ClientDeps); lookup(link: WowheadLink): Promise<PopupState> }` (never rejects)
  - `ITEM_MAX_AGE_MS`, `ZONES_MAX_AGE_MS`, `MESSAGES`
  - `withTimeout<T>(promise: Promise<T>, ms: number): Promise<T>`

- [ ] **Step 1: Write the failing tests**

`app/test/cache.test.ts`:

```ts
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DiskCache } from '../src/main/cache';

const tempDir = () => mkdtempSync(path.join(tmpdir(), 'whg-cache-'));

describe('DiskCache', () => {
  it('gives back what it saved', () => {
    const cache = new DiskCache(tempDir());
    cache.set('a', { x: 1 }, 1000);
    expect(cache.get('a', 60_000, 2000)).toEqual({ x: 1 });
  });

  it('forgets entries older than asked', () => {
    const cache = new DiskCache(tempDir());
    cache.set('a', 1, 0);
    expect(cache.get('a', 1000, 1001)).toBeUndefined();
  });

  it('forgets entries saved in the future (the clock was changed)', () => {
    const cache = new DiskCache(tempDir());
    cache.set('a', 1, 5000);
    expect(cache.get('a', 1000, 0)).toBeUndefined();
  });

  it('has nothing for keys it never saw', () => {
    expect(new DiskCache(tempDir()).get('nope', 1000, 0)).toBeUndefined();
  });

  it('ignores a damaged file', () => {
    const dir = tempDir();
    writeFileSync(path.join(dir, 'a.json'), '{not json');
    expect(new DiskCache(dir).get('a', 1000, 0)).toBeUndefined();
  });

  it('keeps every key inside its folder', () => {
    const dir = tempDir();
    new DiskCache(dir).set('../../evil', 1, 0);
    expect(readdirSync(dir)).toEqual(['______evil.json']);
  });

  it('does not fail when it cannot save', () => {
    const file = path.join(tempDir(), 'a-file');
    writeFileSync(file, '');
    expect(() => new DiskCache(file).set('a', 1, 0)).not.toThrow();
  });
});
```

`app/test/wowheadClient.test.ts`:

```ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { DiskCache } from '../src/main/cache';
import { ITEM_MAX_AGE_MS, MESSAGES, WowheadClient, withTimeout, type FetchResult } from '../src/main/wowheadClient';
import { parseWowheadLink, type WowheadLink } from '../src/shared/wowheadLink';
import { fixture } from './fixtures';

function link(url: string): WowheadLink {
  const parsed = parseWowheadLink(url);
  if (!parsed) throw new Error(url);
  return parsed;
}

const GOREHOWL = link('https://www.wowhead.com/tbc/item=28773');
const ORE = link('https://www.wowhead.com/tbc/item=23424');
const GERMAN = link('https://www.wowhead.com/tbc/de/item=28773');
const ZONES_URL = 'https://nether.wowhead.com/tbc/data/global';
const TOOLTIP_URL = 'https://nether.wowhead.com/tbc/tooltip/item/28773';
const GERMAN_TOOLTIP_URL = 'https://nether.wowhead.com/tbc/de/tooltip/item/28773';

const ok = (url: string, text: string): FetchResult => ({ status: 200, url, text });
const blocked = (url: string): FetchResult => ({ status: 403, url, text: '<h1>403 ERROR</h1> Request blocked.' });
const gorehowlPage = () => ok(`${GOREHOWL.url}/gorehowl`, fixture('item-28773.html.gz'));
const zones = () => ok(ZONES_URL, fixture('global-tbc.js.gz'));
const tooltip = () => ok(TOOLTIP_URL, fixture('tooltip-28773.json'));

/** A client on a fake network: address → answer. Addresses it doesn't know fail like an offline network. */
function setup(answers: Record<string, FetchResult>, browserHtml: string | null = null, now?: () => number) {
  const asked: string[] = [];
  const fetchText = vi.fn(async (url: string) => {
    asked.push(url);
    const answer = answers[url];
    if (!answer) throw new Error(`offline: ${url}`);
    return answer;
  });
  const loadInBrowser = vi.fn(async (_url: string) => browserHtml);
  const cache = new DiskCache(mkdtempSync(path.join(tmpdir(), 'whg-client-')));
  return { client: new WowheadClient({ fetchText, loadInBrowser, cache, now }), asked, loadInBrowser };
}

describe('WowheadClient', () => {
  it('reads the item page', async () => {
    const { client } = setup({ [GOREHOWL.url]: gorehowlPage(), [ZONES_URL]: zones() });
    const state = await client.lookup(GOREHOWL);
    if (state.kind !== 'ready') throw new Error(state.kind);
    expect(state.info.name).toBe('Gorehowl');
    expect(state.info.sections[0].rows[0]).toEqual({ name: 'Prince Malchezaar', details: ['Karazhan', '18%'] });
  });

  it('remembers an item for a day', async () => {
    const { client, asked } = setup({ [GOREHOWL.url]: gorehowlPage(), [ZONES_URL]: zones() });
    await client.lookup(GOREHOWL);
    asked.length = 0;
    expect((await client.lookup(GOREHOWL)).kind).toBe('ready');
    expect(asked).toEqual([]);
  });

  it('asks again after a day', async () => {
    let time = 0;
    const { client, asked } = setup({ [GOREHOWL.url]: gorehowlPage(), [ZONES_URL]: zones() }, null, () => time);
    await client.lookup(GOREHOWL);
    time = ITEM_MAX_AGE_MS + 1;
    asked.length = 0;
    await client.lookup(GOREHOWL);
    expect(asked).toContain(GOREHOWL.url);
  });

  it('says when Wowhead does not know the item', async () => {
    const notFound = { status: 404, url: 'https://www.wowhead.com/tbc/items?notFound=28773', text: fixture('item-999999.html.gz') };
    const { client } = setup({ [GOREHOWL.url]: notFound });
    expect(await client.lookup(GOREHOWL)).toEqual({ kind: 'error', link: GOREHOWL, message: MESSAGES.notFound(28773), header: null });
  });

  it('falls back to a browser window when Wowhead blocks the request', async () => {
    const { client, loadInBrowser } = setup({ [GOREHOWL.url]: blocked(GOREHOWL.url), [ZONES_URL]: zones() }, fixture('item-28773.html.gz'));
    expect((await client.lookup(GOREHOWL)).kind).toBe('ready');
    expect(loadInBrowser).toHaveBeenCalledWith(GOREHOWL.url);
  });

  it('falls back to a browser window when Wowhead answers with its bot check (202)', async () => {
    const challenge = { status: 202, url: GOREHOWL.url, text: '<script src="https://x.awswaf.com/challenge.js"></script>' };
    const { client } = setup({ [GOREHOWL.url]: challenge, [ZONES_URL]: zones() }, fixture('item-28773.html.gz'));
    expect((await client.lookup(GOREHOWL)).kind).toBe('ready');
  });

  it("shows the tooltip service's name and icon when the page stays blocked", async () => {
    const { client } = setup({ [GOREHOWL.url]: blocked(GOREHOWL.url), [TOOLTIP_URL]: tooltip() });
    expect(await client.lookup(GOREHOWL)).toEqual({
      kind: 'error', link: GOREHOWL, message: MESSAGES.blocked, header: { name: 'Gorehowl', quality: 4, icon: 'inv_axe_60' },
    });
  });

  it('says when Wowhead cannot be reached', async () => {
    const { client } = setup({});
    expect(await client.lookup(GOREHOWL)).toEqual({ kind: 'error', link: GOREHOWL, message: MESSAGES.offline, header: null });
  });

  it('says when the page no longer holds the item', async () => {
    const changed = ok(GOREHOWL.url, 'WH.Gatherer.addData(3, 5, {"1":{"name_enus":"Something else"}});');
    const { client } = setup({ [GOREHOWL.url]: changed, [ZONES_URL]: zones(), [TOOLTIP_URL]: tooltip() });
    expect(await client.lookup(GOREHOWL)).toMatchObject({ kind: 'error', message: MESSAGES.changed, header: { name: 'Gorehowl' } });
  });

  it('still lists sources when the zone names are missing', async () => {
    const { client } = setup({ [GOREHOWL.url]: gorehowlPage() });
    const state = await client.lookup(GOREHOWL);
    if (state.kind !== 'ready') throw new Error(state.kind);
    expect(state.info.sections[0].rows[0].details).toEqual(['18%']);
  });

  it('fetches the zone names once for many items', async () => {
    const { client, asked } = setup({
      [GOREHOWL.url]: gorehowlPage(), [ORE.url]: ok(ORE.url, fixture('item-23424.html.gz')), [ZONES_URL]: zones(),
    });
    await client.lookup(GOREHOWL);
    await client.lookup(ORE);
    expect(asked.filter((url) => url === ZONES_URL)).toHaveLength(1);
  });

  it('keeps languages apart: a German link fetches the German page', async () => {
    const { client, asked } = setup({
      [GOREHOWL.url]: gorehowlPage(), [GERMAN.url]: ok(GERMAN.url, fixture('item-28773.html.gz')), [ZONES_URL]: zones(),
    });
    await client.lookup(GOREHOWL);
    await client.lookup(GERMAN);
    expect(asked).toContain(GERMAN.url);
  });

  it('asks the tooltip service in the link language', async () => {
    const { client } = setup({
      [GERMAN.url]: blocked(GERMAN.url),
      [GERMAN_TOOLTIP_URL]: ok(GERMAN_TOOLTIP_URL, '{"name":"Blutschrei","quality":4,"icon":"inv_axe_60"}'),
    });
    expect(await client.lookup(GERMAN)).toMatchObject({ header: { name: 'Blutschrei' } });
  });
});

describe('withTimeout', () => {
  it('passes the answer through', async () => {
    expect(await withTimeout(Promise.resolve(5), 100)).toBe(5);
  });

  it('gives up after the time', async () => {
    vi.useFakeTimers();
    try {
      const pending = withTimeout(new Promise(() => {}), 100);
      const check = expect(pending).rejects.toThrow('Timed out after 100 ms');
      vi.advanceTimersByTime(100);
      await check;
    } finally {
      vi.useRealTimers();
    }
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run test/cache.test.ts test/wowheadClient.test.ts`
Expected: FAIL, unresolved imports for `cache` and `wowheadClient`.

- [ ] **Step 3: Write `app/src/main/cache.ts`**

```ts
import fs from 'node:fs';
import path from 'node:path';

interface Entry<T> {
  savedAt: number;
  value: T;
}

/** JSON files in one folder, each with the time it was saved. */
export class DiskCache {
  constructor(private readonly dir: string) {}

  /** The value saved under key, if it's younger than maxAgeMs. */
  get<T>(key: string, maxAgeMs: number, now = Date.now()): T | undefined {
    try {
      const entry = JSON.parse(fs.readFileSync(this.file(key), 'utf8')) as Entry<T>;
      if (typeof entry.savedAt !== 'number' || now < entry.savedAt || now - entry.savedAt > maxAgeMs) return undefined;
      return entry.value;
    } catch {
      return undefined;
    }
  }

  set<T>(key: string, value: T, now = Date.now()): void {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.writeFileSync(this.file(key), JSON.stringify({ savedAt: now, value } satisfies Entry<T>));
    } catch {
      // A cache that can't save just fetches again next time.
    }
  }

  private file(key: string): string {
    return path.join(this.dir, `${key.replace(/[^a-z0-9-]/gi, '_')}.json`);
  }
}
```

- [ ] **Step 4: Write `app/src/main/wowheadClient.ts`**

```ts
import type { ItemHeader, ItemInfo, PopupState } from '../shared/types';
import type { WowheadLink } from '../shared/wowheadLink';
import type { DiskCache } from './cache';
import { buildItemInfo } from './itemInfo';
import { parseItemPage } from './wowheadPage';
import { parseZoneNames, type ZoneNames } from './zones';

export interface FetchResult {
  status: number;
  /** The address after any redirects. */
  url: string;
  text: string;
}

export interface ClientDeps {
  /** A GET through the browser's network stack. Rejects when Wowhead can't be reached. */
  fetchText(url: string, headers: Record<string, string>): Promise<FetchResult>;
  /** The page's HTML from a hidden browser window, which passes Wowhead's bot check like any browser; null when that fails too. */
  loadInBrowser(url: string): Promise<string | null>;
  cache: DiskCache;
  now?: () => number;
}

/** How long a looked-up item stays fresh, in milliseconds. */
export const ITEM_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** How long the zone names stay fresh, in milliseconds. */
export const ZONES_MAX_AGE_MS = 7 * ITEM_MAX_AGE_MS;
/** Bump when ItemInfo changes shape, so old cache files are left alone. */
const CACHE_VERSION = 1;

/** Text every item page carries; a page without it isn't one the app can read. */
const ITEM_DATA = 'WH.Gatherer.addData(';

const PAGE_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

export const MESSAGES = {
  notFound: (itemId: number) => `Wowhead doesn't know item ${itemId}.`,
  offline: "Couldn't reach Wowhead. Check your internet connection.",
  blocked: "Wowhead didn't let the app read this item's page. Open it on Wowhead instead.",
  changed: "Wowhead's page looks different from what the app knows, so it can't read it. Open it on Wowhead instead.",
};

type PageResult = { kind: 'html'; html: string } | { kind: 'not-found' } | { kind: 'offline' } | { kind: 'blocked' };

/** An address on Wowhead's data server, with the link's game and, if asked, its language. */
function netherUrl(link: WowheadLink, path: string, withLanguage: boolean): string {
  const prefix = [link.site, withLanguage ? link.lang : ''].filter(Boolean).map((part) => `${part}/`).join('');
  return `https://nether.wowhead.com/${prefix}${path}`;
}

export class WowheadClient {
  constructor(private readonly deps: ClientDeps) {}

  /** What the popup should show for a link. Never rejects. */
  async lookup(link: WowheadLink): Promise<PopupState> {
    const key = `item-v${CACHE_VERSION}-${link.site || 'retail'}-${link.lang || 'en'}-${link.itemId}`;
    const cached = this.deps.cache.get<ItemInfo>(key, ITEM_MAX_AGE_MS, this.now());
    if (cached) return { kind: 'ready', link, info: cached };

    const page = await this.fetchPage(link);
    if (page.kind === 'not-found') {
      return { kind: 'error', link, message: MESSAGES.notFound(link.itemId), header: null };
    }
    if (page.kind === 'html') {
      const info = buildItemInfo(link.itemId, parseItemPage(page.html), await this.zoneNames(link));
      if (info) {
        this.deps.cache.set(key, info, this.now());
        return { kind: 'ready', link, info };
      }
    }
    const message = page.kind === 'offline' ? MESSAGES.offline : page.kind === 'blocked' ? MESSAGES.blocked : MESSAGES.changed;
    return { kind: 'error', link, message, header: await this.header(link) };
  }

  private async fetchPage(link: WowheadLink): Promise<PageResult> {
    let response: FetchResult;
    try {
      response = await this.deps.fetchText(link.url, PAGE_HEADERS);
    } catch {
      return { kind: 'offline' };
    }
    // Wowhead answers an unknown ID with a 404 and a redirect to its item search.
    if (response.status === 404 || response.url.includes('notFound=')) return { kind: 'not-found' };
    if (response.status === 200 && response.text.includes(ITEM_DATA)) return { kind: 'html', html: response.text };
    // Anything else is most likely Wowhead's bot check, which a real browser window passes.
    const html = await this.deps.loadInBrowser(link.url);
    if (html !== null && html.includes(ITEM_DATA)) return { kind: 'html', html };
    return { kind: 'blocked' };
  }

  private async zoneNames(link: WowheadLink): Promise<ZoneNames> {
    const key = `zones-v${CACHE_VERSION}-${link.site || 'retail'}`;
    const cached = this.deps.cache.get<[number, string][]>(key, ZONES_MAX_AGE_MS, this.now());
    if (cached) return new Map(cached);
    try {
      const response = await this.deps.fetchText(netherUrl(link, 'data/global', false), {});
      const zones = response.status === 200 ? parseZoneNames(response.text) : new Map<number, string>();
      if (zones.size > 0) this.deps.cache.set(key, [...zones], this.now());
      return zones;
    } catch {
      // Without zone names, rows just leave out where they are.
      return new Map();
    }
  }

  /** The item's name, quality and icon from Wowhead's tooltip service, for when its page can't be read. */
  private async header(link: WowheadLink): Promise<ItemHeader | null> {
    try {
      const response = await this.deps.fetchText(netherUrl(link, `tooltip/item/${link.itemId}`, true), {});
      if (response.status !== 200) return null;
      const data = JSON.parse(response.text) as Record<string, unknown>;
      if (typeof data.name !== 'string') return null;
      return {
        name: data.name,
        quality: typeof data.quality === 'number' ? data.quality : 1,
        icon: typeof data.icon === 'string' ? data.icon : '',
      };
    } catch {
      return null;
    }
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }
}

/** Rejects with an Error when the promise takes longer than ms milliseconds. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${ms} ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
```

- [ ] **Step 5: Run the tests and the type check**

Run: `npx vitest run test/cache.test.ts test/wowheadClient.test.ts && npm run typecheck`
Expected: PASS, and `tsc` prints nothing.

- [ ] **Step 6: Commit**

```bash
cd "/d/Development/WoW Addons/WowheadGatherer"
git add app/src/main/cache.ts app/src/main/wowheadClient.ts app/test/cache.test.ts app/test/wowheadClient.test.ts
git commit -m "feat(app): Wowhead client with browser fallback and a day's cache" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Watching the clipboard while the game is in front

**Files:**
- Create: `app/src/main/win32.ts`, `app/src/main/clipboardWatcher.ts`, `app/test/win32.test.ts`, `app/test/clipboardWatcher.test.ts`

**Interfaces:**
- Consumes: from Task 3: `parseWowheadLink`, `WowheadLink`.
- Produces:
  - `clipboardSequence(): number`, `foregroundExeName(): string` (Windows only)
  - `GAME_EXE_NAMES: Set<string>`, `isGame(exeName: string): boolean`
  - `interface WatcherDeps { clipboardSequence(): number; foregroundExeName(): string; readClipboardText(): string; onLink(link: WowheadLink): void; onForeground?(gameInFront: boolean, exeName: string): void }`
  - `class ClipboardWatcher { constructor(deps: WatcherDeps); tick(): void; start(intervalMs?: number): void; stop(): void }`

- [ ] **Step 1: Write the failing tests**

`app/test/clipboardWatcher.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { ClipboardWatcher } from '../src/main/clipboardWatcher';
import type { WowheadLink } from '../src/shared/wowheadLink';

const LINK = 'https://www.wowhead.com/tbc/item=19019';

function setup(start: { exe?: string; text?: string } = {}) {
  const state = { sequence: 1, exe: start.exe ?? 'WowClassic.exe', text: start.text ?? '' };
  const links: WowheadLink[] = [];
  const fronts: boolean[] = [];
  const watcher = new ClipboardWatcher({
    clipboardSequence: () => state.sequence,
    foregroundExeName: () => state.exe,
    readClipboardText: () => state.text,
    onLink: (link) => links.push(link),
    onForeground: (gameInFront) => fronts.push(gameInFront),
  });
  const copy = (text: string) => {
    state.text = text;
    state.sequence++;
  };
  return { state, links, fronts, watcher, copy };
}

describe('ClipboardWatcher', () => {
  it('looks up a link copied in the game', () => {
    const t = setup();
    t.copy(LINK);
    t.watcher.tick();
    expect(t.links.map((link) => link.itemId)).toEqual([19019]);
  });

  it('does nothing while the clipboard stays the same', () => {
    const t = setup();
    t.watcher.tick();
    t.watcher.tick();
    expect(t.links).toEqual([]);
  });

  it('ignores links copied in other programs, even after switching back', () => {
    const t = setup({ exe: 'chrome.exe' });
    t.copy(LINK);
    t.watcher.tick();
    t.state.exe = 'WowClassic.exe';
    t.watcher.tick();
    expect(t.links).toEqual([]);
  });

  it('ignores other text copied in the game', () => {
    const t = setup();
    t.copy('hello');
    t.watcher.tick();
    expect(t.links).toEqual([]);
  });

  it('ignores a link already on the clipboard when it starts', () => {
    const t = setup({ text: LINK });
    t.watcher.tick();
    expect(t.links).toEqual([]);
  });

  it('looks up the same link each time it is copied', () => {
    const t = setup();
    t.copy(LINK);
    t.watcher.tick();
    t.copy(LINK);
    t.watcher.tick();
    expect(t.links).toHaveLength(2);
  });

  it('knows the game whatever the letter case', () => {
    const t = setup({ exe: 'WOWCLASSIC.EXE' });
    t.copy(LINK);
    t.watcher.tick();
    expect(t.links).toHaveLength(1);
  });

  it('reports whether the game is in front', () => {
    const t = setup();
    t.watcher.tick();
    t.state.exe = 'chrome.exe';
    t.watcher.tick();
    expect(t.fronts).toEqual([true, false]);
  });

  it('ignores a huge or empty clipboard (an image, a big log)', () => {
    const t = setup();
    t.copy('');
    t.watcher.tick();
    t.copy('x'.repeat(5_000_000));
    t.watcher.tick();
    expect(t.links).toEqual([]);
  });

  it('checks on a timer once started', () => {
    vi.useFakeTimers();
    try {
      const t = setup();
      t.watcher.start(100);
      t.copy(LINK);
      vi.advanceTimersByTime(100);
      t.watcher.stop();
      expect(t.links).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
```

`app/test/win32.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

// Real Windows calls through koffi, so only on Windows.
describe.runIf(process.platform === 'win32')('win32', () => {
  it('reads the clipboard sequence number', async () => {
    const { clipboardSequence } = await import('../src/main/win32');
    expect(Number.isInteger(clipboardSequence())).toBe(true);
  });

  it('names the program in front', async () => {
    const { foregroundExeName } = await import('../src/main/win32');
    expect(foregroundExeName()).toMatch(/^$|\.exe$/i);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run test/clipboardWatcher.test.ts test/win32.test.ts`
Expected: FAIL, unresolved imports for `clipboardWatcher` and `win32`.

- [ ] **Step 3: Write `app/src/main/win32.ts`**

```ts
import koffi from 'koffi';

// Windows calls the app needs and Electron doesn't offer. Win32 BOOL is a
// 4-byte int, so it's declared as int, not bool.
const user32 = koffi.load('user32.dll');
const kernel32 = koffi.load('kernel32.dll');

const GetClipboardSequenceNumber = user32.func('uint32_t __stdcall GetClipboardSequenceNumber()');
const GetForegroundWindow = user32.func('void * __stdcall GetForegroundWindow()');
const GetWindowThreadProcessId = user32.func('uint32_t __stdcall GetWindowThreadProcessId(void *hWnd, _Out_ uint32_t *lpdwProcessId)');
const OpenProcess = kernel32.func('void * __stdcall OpenProcess(uint32_t dwDesiredAccess, int bInheritHandle, uint32_t dwProcessId)');
const QueryFullProcessImageNameW = kernel32.func('int __stdcall QueryFullProcessImageNameW(void *hProcess, uint32_t dwFlags, void *lpExeName, _Inout_ uint32_t *lpdwSize)');
const CloseHandle = kernel32.func('int __stdcall CloseHandle(void *hObject)');

/** Enough rights to read another program's file name, even one running as administrator. */
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
/** Room for the program's full path, in UTF-16 characters. */
const MAX_PATH_CHARS = 1024;

/** A number Windows raises every time the clipboard changes. Reading it never opens the clipboard. */
export function clipboardSequence(): number {
  return GetClipboardSequenceNumber() as number;
}

/** The file name of the program in front, e.g. "WowClassic.exe", or "" when Windows won't say. */
export function foregroundExeName(): string {
  const window = GetForegroundWindow();
  if (!window) return '';
  const processId = [0];
  GetWindowThreadProcessId(window, processId);
  if (!processId[0]) return '';
  const process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, processId[0]);
  if (!process) return '';
  try {
    const buffer = Buffer.alloc(MAX_PATH_CHARS * 2);
    const size = [MAX_PATH_CHARS];
    if (!QueryFullProcessImageNameW(process, 0, buffer, size)) return '';
    const fullPath = buffer.toString('utf16le', 0, size[0] * 2);
    return fullPath.slice(fullPath.lastIndexOf('\\') + 1);
  } finally {
    CloseHandle(process);
  }
}
```

- [ ] **Step 4: Write `app/src/main/clipboardWatcher.ts`**

```ts
import { parseWowheadLink, type WowheadLink } from '../shared/wowheadLink';

export interface WatcherDeps {
  clipboardSequence(): number;
  foregroundExeName(): string;
  readClipboardText(): string;
  onLink(link: WowheadLink): void;
  /** Called on every check with whether the game is in front, so the popup can hide when it isn't. */
  onForeground?(gameInFront: boolean, exeName: string): void;
}

/** WoW's program names, in lower case: Classic clients (TBC Anniversary is WowClassic.exe), retail, and their test builds. */
export const GAME_EXE_NAMES = new Set(['wowclassic.exe', 'wowclassict.exe', 'wowclassicb.exe', 'wow.exe', 'wowt.exe', 'wowb.exe']);

/** How often the clipboard is checked, in milliseconds. */
const CHECK_INTERVAL_MS = 100;

export function isGame(exeName: string): boolean {
  return GAME_EXE_NAMES.has(exeName.toLowerCase());
}

/** Turns a Wowhead item link copied while the game is in front into a lookup. */
export class ClipboardWatcher {
  private lastSequence: number;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly deps: WatcherDeps) {
    // Whatever is on the clipboard at start was copied before; it isn't a lookup.
    this.lastSequence = deps.clipboardSequence();
  }

  tick(): void {
    const exeName = this.deps.foregroundExeName();
    const gameInFront = isGame(exeName);
    this.deps.onForeground?.(gameInFront, exeName);
    const sequence = this.deps.clipboardSequence();
    if (sequence === this.lastSequence) return;
    this.lastSequence = sequence;
    if (!gameInFront) return;
    const link = parseWowheadLink(this.deps.readClipboardText());
    if (link) this.deps.onLink(link);
  }

  start(intervalMs = CHECK_INTERVAL_MS): void {
    this.stop();
    this.timer = setInterval(() => this.tick(), intervalMs);
  }

  stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }
}
```

- [ ] **Step 5: Run the tests and the type check**

Run: `npx vitest run test/clipboardWatcher.test.ts test/win32.test.ts && npm run typecheck`
Expected: PASS. Both win32 tests run on this Windows PC. `tsc` prints nothing.

- [ ] **Step 6: Commit**

```bash
cd "/d/Development/WoW Addons/WowheadGatherer"
git add app/src/main/win32.ts app/src/main/clipboardWatcher.ts app/test/win32.test.ts app/test/clipboardWatcher.test.ts
git commit -m "feat(app): watch the clipboard for links copied in WoW" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The popup's page: placement and rendering

**Files:**
- Create: `app/src/main/placement.ts`, `app/src/renderer/popup.ts`, `app/src/preload/preload.ts`, `app/static/popup.html`, `app/static/popup.css`, `app/test/placement.test.ts`, `app/test/popup.test.ts`

**Interfaces:**
- Consumes:
  - from Task 3: `parseWowheadLink`
  - from Task 5: `PopupState`, `ItemInfo`, `ItemHeader`, `ItemComment`, `MarkupNode`, `SourceSection`
- Produces:
  - `interface Point { x; y }`, `Size { width; height }`, `Rect`; `CURSOR_GAP = 24`; `placePopup(cursor: Point, size: Size, area: Rect): Point`
  - `interface PopupActions { close(): void; openWowhead(): void }`; `renderState(root: HTMLElement, state: PopupState, actions: PopupActions): void`; `renderMarkup(nodes: MarkupNode[]): Node[]`
  - The preload bridge `window.gatherer: GathererBridge = { onState(cb), close(), openWowhead(), reportHeight(px) }`, over the IPC channels `popup:state` (main → page), `popup:close`, `popup:open-wowhead` and `popup:height` (page → main)

- [ ] **Step 1: Write the failing tests**

`app/test/placement.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { placePopup } from '../src/main/placement';

const SCREEN = { x: 0, y: 0, width: 1920, height: 1080 };
const SIZE = { width: 420, height: 300 };

describe('placePopup', () => {
  it('goes right of the cursor, level with it', () => {
    expect(placePopup({ x: 100, y: 100 }, SIZE, SCREEN)).toEqual({ x: 124, y: 100 });
  });

  it('goes left of the cursor near the right edge', () => {
    expect(placePopup({ x: 1800, y: 100 }, SIZE, SCREEN)).toEqual({ x: 1356, y: 100 });
  });

  it('moves up to stay on the screen', () => {
    expect(placePopup({ x: 100, y: 1000 }, SIZE, SCREEN)).toEqual({ x: 124, y: 780 });
  });

  it('works on a screen left of the main one', () => {
    expect(placePopup({ x: -100, y: 50 }, SIZE, { x: -1920, y: 0, width: 1920, height: 1080 })).toEqual({ x: -544, y: 50 });
  });

  it('keeps its top on the screen when it is taller than the screen', () => {
    expect(placePopup({ x: 100, y: 100 }, { width: 420, height: 2000 }, SCREEN).y).toBe(0);
  });

  it('rounds to whole pixels', () => {
    expect(placePopup({ x: 100.6, y: 200.4 }, SIZE, SCREEN)).toEqual({ x: 125, y: 200 });
  });
});
```

`app/test/popup.test.ts`:

```ts
// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderState, type PopupActions } from '../src/renderer/popup';
import type { ItemInfo, PopupState } from '../src/shared/types';
import { parseWowheadLink } from '../src/shared/wowheadLink';

const link = parseWowheadLink('https://www.wowhead.com/tbc/item=28773')!;
const info: ItemInfo = {
  name: 'Gorehowl',
  quality: 4,
  icon: 'inv_axe_60',
  commentTotal: 90,
  sections: [{ title: 'Dropped by', total: 200, rows: [{ name: 'Prince Malchezaar', details: ['Karazhan', '18%'] }] }],
  comments: [{
    user: '', rating: 300, date: 'Feb 2007',
    body: [{ kind: 'bold', children: [{ kind: 'text', text: 'Grom' }] }, { kind: 'text', text: "'s axe" }],
  }],
};

let root: HTMLElement;
let actions: PopupActions;
beforeEach(() => {
  root = document.createElement('main');
  actions = { close: vi.fn(), openWowhead: vi.fn() };
});
const show = (state: PopupState) => renderState(root, state, actions);
const text = (selector: string) => root.querySelector(selector)?.textContent;

describe('renderState', () => {
  it('shows the item number while it loads', () => {
    show({ kind: 'loading', link });
    expect(text('h1')).toBe('Item 28773');
    expect(text('.status')).toBe('Looking it up on Wowhead…');
  });

  it('shows the name in its quality colour, with its icon', () => {
    show({ kind: 'ready', link, info });
    expect(text('h1')).toBe('Gorehowl');
    expect(root.querySelector('h1')?.className).toBe('q4');
    expect(root.querySelector('img')?.getAttribute('src')).toBe('https://wow.zamimg.com/images/wow/icons/large/inv_axe_60.jpg');
  });

  it('lists the sources, and how many more Wowhead has', () => {
    show({ kind: 'ready', link, info });
    expect(text('section h2')).toBe('Dropped by');
    expect(text('li .name')).toBe('Prince Malchezaar');
    expect(text('li .details')).toBe('Karazhan · 18%');
    expect(text('li.more')).toBe('+199 more on Wowhead');
  });

  it('shows the comments with their markup', () => {
    show({ kind: 'ready', link, info });
    expect(text('.comments h2')).toBe('Comments (90)');
    expect(text('.comment .meta')).toBe('★ 300 · Feb 2007');
    expect(text('.comment .body strong')).toBe('Grom');
    expect(text('.comment .body')).toBe("Grom's axe");
  });

  it('never turns Wowhead text into HTML', () => {
    const evil = '<img src=x onerror=alert(1)><script>alert(1)</script>';
    show({
      kind: 'ready', link,
      info: { ...info, sections: [{ title: 'Dropped by', total: 1, rows: [{ name: evil, details: [] }] }],
        comments: [{ user: evil, rating: 1, date: '', body: [{ kind: 'text', text: evil }] }] },
    });
    expect(root.querySelectorAll('img')).toHaveLength(1); // just the item's icon
    expect(root.querySelector('script')).toBeNull();
    expect(text('li .name')).toBe(evil);
  });

  it("shows the error, with the tooltip service's name when there is one", () => {
    show({ kind: 'error', link, message: 'Blocked.', header: { name: 'Gorehowl', quality: 4, icon: 'inv_axe_60' } });
    expect(text('h1')).toBe('Gorehowl');
    expect(text('.status.error')).toBe('Blocked.');
  });

  it('shows the item number when the error has no name', () => {
    show({ kind: 'error', link, message: 'Offline.', header: null });
    expect(text('h1')).toBe('Item 28773');
    expect(root.querySelector('img')).toBeNull();
  });

  it('does not load icons with odd names', () => {
    show({ kind: 'ready', link, info: { ...info, icon: '../../evil' } });
    expect(root.querySelector('img')).toBeNull();
  });

  it('keeps the quality colour in range', () => {
    show({ kind: 'ready', link, info: { ...info, quality: 99 } });
    expect(root.querySelector('h1')?.className).toBe('q7');
  });

  it('says so when Wowhead has nothing to list', () => {
    show({ kind: 'ready', link, info: { ...info, sections: [], comments: [], commentTotal: 0 } });
    expect(text('.status')).toBe('Wowhead lists no sources or comments for this item.');
  });

  it('wires up the buttons', () => {
    show({ kind: 'ready', link, info });
    root.querySelector<HTMLButtonElement>('.open')?.click();
    root.querySelector<HTMLButtonElement>('.close')?.click();
    expect(actions.openWowhead).toHaveBeenCalledOnce();
    expect(actions.close).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run test/placement.test.ts test/popup.test.ts`
Expected: FAIL, unresolved imports for `placement` and `popup`.

- [ ] **Step 3: Write `app/src/main/placement.ts`**

```ts
export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Point, Size {}

/** Space between the cursor and the popup, in pixels. */
export const CURSOR_GAP = 24;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

/** Where the popup goes: right of the cursor, or left of it when that runs off the screen, level with it, and kept on the screen. */
export function placePopup(cursor: Point, size: Size, area: Rect): Point {
  let x = cursor.x + CURSOR_GAP;
  if (x + size.width > area.x + area.width) x = cursor.x - CURSOR_GAP - size.width;
  x = clamp(x, area.x, area.x + area.width - size.width);
  const y = clamp(cursor.y, area.y, area.y + area.height - size.height);
  return { x: Math.round(x), y: Math.round(y) };
}
```

- [ ] **Step 4: Write `app/src/preload/preload.ts`**

```ts
import { contextBridge, ipcRenderer } from 'electron';
import type { PopupState } from '../shared/types';

/** All the popup page can do. */
const bridge = {
  onState(callback: (state: PopupState) => void): void {
    ipcRenderer.on('popup:state', (_event, state: PopupState) => callback(state));
  },
  close(): void {
    ipcRenderer.send('popup:close');
  },
  openWowhead(): void {
    ipcRenderer.send('popup:open-wowhead');
  },
  reportHeight(height: number): void {
    ipcRenderer.send('popup:height', height);
  },
};

export type GathererBridge = typeof bridge;

contextBridge.exposeInMainWorld('gatherer', bridge);
```

- [ ] **Step 5: Write `app/src/renderer/popup.ts`**

```ts
import type { GathererBridge } from '../preload/preload';
import type { ItemComment, ItemHeader, MarkupNode, PopupState, SourceSection } from '../shared/types';

/** What the popup's buttons do. The preload bridge supplies them in the app. */
export interface PopupActions {
  close(): void;
  openWowhead(): void;
}

declare global {
  interface Window {
    gatherer?: GathererBridge;
  }
}

const ICON_URL = 'https://wow.zamimg.com/images/wow/icons/large/';
/** Icon names are file names like "inv_axe_60"; anything else isn't loaded. */
const ICON_NAME = /^[a-z0-9_-]+$/i;
/** The highest quality with a colour (heirloom). */
const MAX_QUALITY = 7;

const CONTAINER_TAGS = {
  bold: 'strong', italic: 'em', underline: 'u', small: 'small', quote: 'blockquote', listItem: 'div',
} as const;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function headerOf(state: PopupState): ItemHeader | null {
  if (state.kind === 'ready') return state.info;
  if (state.kind === 'error') return state.header;
  return null;
}

function renderHeader(state: PopupState, actions: PopupActions): HTMLElement {
  const header = el('header');
  const item = headerOf(state);
  if (item?.icon && ICON_NAME.test(item.icon)) {
    const icon = el('img', 'icon');
    icon.src = `${ICON_URL}${item.icon.toLowerCase()}.jpg`;
    icon.alt = '';
    header.append(icon);
  }
  const quality = Math.min(Math.max(Math.trunc(item?.quality ?? 1), 0), MAX_QUALITY);
  header.append(el('h1', `q${quality}`, item?.name ?? `Item ${state.link.itemId}`));
  const open = el('button', 'open', 'Open on Wowhead');
  open.addEventListener('click', () => actions.openWowhead());
  const close = el('button', 'close', '×');
  close.title = 'Close (Esc)';
  close.addEventListener('click', () => actions.close());
  header.append(open, close);
  return header;
}

function renderSection(section: SourceSection): HTMLElement {
  const block = el('section');
  block.append(el('h2', undefined, section.title));
  const list = el('ul');
  for (const row of section.rows) {
    const item = el('li');
    item.append(el('span', 'name', row.name));
    if (row.details.length > 0) item.append(el('span', 'details', row.details.join(' · ')));
    list.append(item);
  }
  const hidden = section.total - section.rows.length;
  if (hidden > 0) list.append(el('li', 'more', `+${hidden} more on Wowhead`));
  block.append(list);
  return block;
}

/** Comment nodes as DOM. Text only ever goes in as text. */
export function renderMarkup(nodes: MarkupNode[]): Node[] {
  return nodes.map((node) => {
    if (node.kind === 'text') return document.createTextNode(node.text);
    if (node.kind === 'break') return el('br');
    const container = el(CONTAINER_TAGS[node.kind], node.kind === 'listItem' ? 'list-item' : undefined);
    container.append(...renderMarkup(node.children));
    return container;
  });
}

function renderComment(comment: ItemComment): HTMLElement {
  const block = el('article', 'comment');
  block.append(el('p', 'meta', [`★ ${comment.rating}`, comment.user, comment.date].filter(Boolean).join(' · ')));
  const body = el('div', 'body');
  body.append(...renderMarkup(comment.body));
  block.append(body);
  return block;
}

/** Fills the popup with a state. All of Wowhead's text goes in as text, never as HTML. */
export function renderState(root: HTMLElement, state: PopupState, actions: PopupActions): void {
  root.replaceChildren(renderHeader(state, actions));
  if (state.kind === 'loading') {
    root.append(el('p', 'status', 'Looking it up on Wowhead…'));
    return;
  }
  if (state.kind === 'error') {
    root.append(el('p', 'status error', state.message));
    return;
  }
  const { sections, comments, commentTotal } = state.info;
  root.append(...sections.map(renderSection));
  if (comments.length > 0) {
    const block = el('section', 'comments');
    block.append(el('h2', undefined, `Comments (${commentTotal})`), ...comments.map(renderComment));
    root.append(block);
  }
  if (sections.length === 0 && comments.length === 0) {
    root.append(el('p', 'status', 'Wowhead lists no sources or comments for this item.'));
  }
}

// In the app, the preload script supplies the bridge; tests call renderState directly.
const bridge = window.gatherer;
const root = document.getElementById('popup');
if (bridge && root) {
  bridge.onState((state) => {
    renderState(root, state, bridge);
    // Once laid out, ask the window to fit the content (main keeps it within limits).
    requestAnimationFrame(() => bridge.reportHeight(root.scrollHeight));
  });
}
```

- [ ] **Step 6: Write `app/static/popup.html` and `app/static/popup.css`**

`app/static/popup.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; script-src 'self'; style-src 'self'; img-src https://wow.zamimg.com">
  <title>Wowhead Gatherer</title>
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <main id="popup"></main>
  <script src="../dist/popup.js"></script>
</body>
</html>
```

`app/static/popup.css`:

```css
:root {
  color-scheme: dark;
  --bg: #0b0e17;
  --panel: #121725;
  --line: #1c2232;
  --border: #3b4258;
  --text: #e6e6e6;
  --muted: #9aa3b5;
  --accent: #ffd100;
  --error: #ff6b6b;
  font: 13px/1.4 "Segoe UI", system-ui, sans-serif;
}

html, body { margin: 0; height: 100%; overflow: hidden; background: var(--bg); color: var(--text); }

#popup {
  box-sizing: border-box;
  max-height: 100vh;
  overflow-y: auto;
  padding: 10px 12px 12px;
  border: 1px solid var(--border);
}

header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.icon { width: 36px; height: 36px; border: 1px solid var(--border); border-radius: 3px; }
h1 { flex: 1; margin: 0; font-size: 15px; font-weight: 600; }

button {
  font: inherit; color: var(--text); background: #1c2233;
  border: 1px solid var(--border); border-radius: 3px; padding: 3px 8px; cursor: pointer;
}
button:hover { border-color: var(--accent); }
.close { padding: 3px 7px; }

h2 { margin: 10px 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--accent); }
ul { list-style: none; margin: 0; padding: 0; }
li { display: flex; justify-content: space-between; gap: 12px; padding: 2px 0; border-bottom: 1px solid var(--line); }
.details { color: var(--muted); text-align: right; }
.more { color: var(--muted); font-style: italic; }

.status { color: var(--muted); }
.status.error { color: var(--error); }

.comment { margin-top: 6px; padding: 6px 8px; background: var(--panel); border-radius: 3px; }
.meta { margin: 0 0 3px; color: var(--muted); font-size: 11px; }
.body blockquote { margin: 4px 0; padding-left: 8px; border-left: 2px solid var(--border); color: var(--muted); }
.list-item::before { content: "• "; }

/* Item quality colours, as in the game. */
.q0 { color: #9d9d9d; } .q1 { color: #ffffff; } .q2 { color: #1eff00; } .q3 { color: #0070dd; }
.q4 { color: #a335ee; } .q5 { color: #ff8000; } .q6 { color: #e6cc80; } .q7 { color: #00ccff; }
```

- [ ] **Step 7: Run the tests and the type check**

Run: `npx vitest run test/placement.test.ts test/popup.test.ts && npm run typecheck`
Expected: PASS, and `tsc` prints nothing.

- [ ] **Step 8: Commit**

```bash
cd "/d/Development/WoW Addons/WowheadGatherer"
git add app/src/main/placement.ts app/src/preload app/src/renderer app/static app/test/placement.test.ts app/test/popup.test.ts
git commit -m "feat(app): the popup page and where it goes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The running app

**Files:**
- Create: `app/src/main/userAgent.ts`, `app/src/main/latestOnly.ts`, `app/src/main/trayIcon.ts`, `app/src/main/browserFetch.ts`, `app/src/main/popupWindow.ts`, `app/src/main/main.ts`, `app/test/shell.test.ts`

**Interfaces:**
- Consumes:
  - from Task 7: `WowheadClient`, `DiskCache`, `FetchResult`, `withTimeout`
  - from Task 8: `ClipboardWatcher`, `clipboardSequence`, `foregroundExeName`
  - from Task 9: `placePopup`, the IPC channels, `static/popup.html`, `dist/preload.js`, `dist/popup.js`
  - from Task 5: `PopupState`
- Produces:
  - `browserUserAgent(electronAgent: string): string`
  - `latestOnly<A, R>(run: (arg: A) => Promise<R>, deliver: (result: R) => void): (arg: A) => void`
  - `TRAY_ICON_SIZE`, `trayIconPixels(size?: number): Buffer`
  - `prepareWowheadSession()`, `fetchText(url, headers)`, `loadInBrowser(url)`
  - `class Popup { open(state); update(state); hide() }`
  - the app (`npm start`)

- [ ] **Step 1: Write the failing tests for the pure helpers**

`app/test/shell.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { latestOnly } from '../src/main/latestOnly';
import { TRAY_ICON_SIZE, trayIconPixels } from '../src/main/trayIcon';
import { browserUserAgent } from '../src/main/userAgent';

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.7204.97 Safari/537.36';

describe('browserUserAgent', () => {
  it.each([
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) wowhead-gatherer/0.1.0 Chrome/138.0.7204.97 Electron/37.2.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Wowhead Gatherer/0.1.0 Chrome/138.0.7204.97 Electron/37.2.0 Safari/537.36',
  ])('makes Electron look like plain Chrome: %s', (agent) => {
    expect(browserUserAgent(agent)).toBe(CHROME);
  });

  it('leaves plain Chrome alone', () => {
    expect(browserUserAgent(CHROME)).toBe(CHROME);
  });
});

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('latestOnly', () => {
  it("drops an older lookup's late answer", async () => {
    const pending = new Map<string, Deferred<string>>();
    const delivered: string[] = [];
    const lookUp = latestOnly((name: string) => {
      const d = deferred<string>();
      pending.set(name, d);
      return d.promise;
    }, (result) => delivered.push(result));
    lookUp('A');
    lookUp('B');
    pending.get('B')?.resolve('B done');
    pending.get('A')?.resolve('A done');
    await settle();
    expect(delivered).toEqual(['B done']);
  });

  it('delivers every answer when lookups do not overlap', async () => {
    const delivered: string[] = [];
    const lookUp = latestOnly(async (name: string) => `${name} done`, (result) => delivered.push(result));
    lookUp('A');
    await settle();
    lookUp('B');
    await settle();
    expect(delivered).toEqual(['A done', 'B done']);
  });
});

describe('trayIconPixels', () => {
  const pixels = trayIconPixels();
  const at = (x: number, y: number) => [...pixels.subarray((y * TRAY_ICON_SIZE + x) * 4, (y * TRAY_ICON_SIZE + x) * 4 + 4)];

  it('is a square of blue, green, red, alpha bytes', () => {
    expect(pixels.length).toBe(TRAY_ICON_SIZE * TRAY_ICON_SIZE * 4);
  });

  it('is a disc: clear corners, solid middle', () => {
    expect(at(0, 0)[3]).toBe(0);
    expect(at(16, 16)).toEqual([0x1f, 0x1f, 0xb3, 0xff]);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run test/shell.test.ts`
Expected: FAIL, unresolved imports.

- [ ] **Step 3: Write the pure helpers**

`app/src/main/userAgent.ts`:

```ts
/** Electron's user agent without its own and the app's names, so Wowhead sees the Chrome it really is. */
export function browserUserAgent(electronAgent: string): string {
  return electronAgent
    .replace(/\(KHTML, like Gecko\).*?Chrome\//, '(KHTML, like Gecko) Chrome/')
    .replace(/\sElectron\/\S+/, '');
}
```

`app/src/main/latestOnly.ts`:

```ts
/** Wraps an async lookup so only the newest call's answer is delivered; late answers to older calls are dropped. */
export function latestOnly<A, R>(run: (arg: A) => Promise<R>, deliver: (result: R) => void): (arg: A) => void {
  let latest = 0;
  return (arg) => {
    const call = ++latest;
    run(arg).then(
      (result) => {
        if (call === latest) deliver(result);
      },
      () => {
        // The lookups this wraps never reject; if one does, there's nothing to show.
      },
    );
  };
}
```

`app/src/main/trayIcon.ts`:

```ts
/** The tray icon's width and height, in pixels. */
export const TRAY_ICON_SIZE = 32;
/** Wowhead red and a gold rim, as blue, green, red, alpha bytes (the order Electron bitmaps use on Windows). */
const FILL = [0x1f, 0x1f, 0xb3, 0xff];
const RIM = [0x00, 0xd1, 0xff, 0xff];
/** The rim's width, in pixels. */
const RIM_WIDTH = 2.5;

/** A red disc with a gold rim, for nativeImage.createFromBitmap. */
export function trayIconPixels(size = TRAY_ICON_SIZE): Buffer {
  const pixels = Buffer.alloc(size * size * 4);
  const centre = (size - 1) / 2;
  const radius = size / 2 - 0.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(x - centre, y - centre);
      if (distance > radius) continue;
      pixels.set(distance > radius - RIM_WIDTH ? RIM : FILL, (y * size + x) * 4);
    }
  }
  return pixels;
}
```

- [ ] **Step 4: Run the helper tests**

Run: `npx vitest run test/shell.test.ts`
Expected: PASS.

- [ ] **Step 5: Write `app/src/main/browserFetch.ts`**

```ts
import { BrowserWindow, session, type Session } from 'electron';
import { browserUserAgent } from './userAgent';
import { withTimeout, type FetchResult } from './wowheadClient';

/** Requests and the hidden window share this session, so a bot-check cookie the window earns helps later requests. */
const PARTITION = 'persist:wowhead';
/** How long one request may take, in milliseconds. */
const FETCH_TIMEOUT_MS = 10_000;
/** How long the hidden window may take, bot check included, in milliseconds. */
const BROWSER_TIMEOUT_MS = 20_000;
/** How often the hidden window is checked for the item data, in milliseconds. */
const BROWSER_POLL_MS = 500;
/** What the hidden window doesn't need to load: it only wants the page's scripts. */
const SKIPPED_RESOURCES = new Set(['image', 'media', 'font', 'stylesheet']);
/** Text every item page carries (see wowheadClient.ts). */
const ITEM_DATA = 'WH.Gatherer.addData(';

function wowheadSession(): Session {
  return session.fromPartition(PARTITION);
}

/** Sets up Wowhead's session once, after the app is ready. */
export function prepareWowheadSession(): void {
  const ses = wowheadSession();
  // Wowhead turns away agents that say Electron.
  ses.setUserAgent(browserUserAgent(ses.getUserAgent()));
  ses.webRequest.onBeforeRequest((details, callback) => {
    // Requests from fetchText have no web contents; only the hidden window's pictures and fonts are skipped.
    callback({ cancel: details.webContentsId !== undefined && SKIPPED_RESOURCES.has(details.resourceType) });
  });
}

/** A GET through Chromium's own network stack. */
export async function fetchText(url: string, headers: Record<string, string>): Promise<FetchResult> {
  const response = await withTimeout(wowheadSession().fetch(url, { headers }), FETCH_TIMEOUT_MS);
  return { status: response.status, url: response.url, text: await withTimeout(response.text(), FETCH_TIMEOUT_MS) };
}

/** Loads the page in a hidden window, which runs Wowhead's bot check like any browser, and returns its HTML once the item data is in it. */
export function loadInBrowser(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const window = new BrowserWindow({
      show: false,
      webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    window.webContents.setAudioMuted(true);
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    let done = false;
    let poll: ReturnType<typeof setInterval> | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const finish = (html: string | null) => {
      if (done) return;
      done = true;
      clearInterval(poll);
      clearTimeout(timeout);
      if (!window.isDestroyed()) window.destroy();
      resolve(html);
    };
    // The bot check can reload the page, so keep looking until the item data is there.
    poll = setInterval(() => {
      if (window.isDestroyed()) {
        finish(null);
        return;
      }
      window.webContents.executeJavaScript('document.documentElement.outerHTML').then(
        (html: unknown) => {
          if (typeof html === 'string' && html.includes(ITEM_DATA)) finish(html);
        },
        () => {
          // Between two page loads; the next check tries again.
        },
      );
    }, BROWSER_POLL_MS);
    timeout = setTimeout(() => finish(null), BROWSER_TIMEOUT_MS);
    window.loadURL(url).catch(() => {
      // A failed load ends with the timeout.
    });
  });
}
```

- [ ] **Step 6: Write `app/src/main/popupWindow.ts`**

```ts
import { BrowserWindow, globalShortcut, ipcMain, screen, shell } from 'electron';
import path from 'node:path';
import type { PopupState } from '../shared/types';
import { placePopup, type Point } from './placement';

/** The popup's width, and the range its height fits its content within, in pixels. */
const POPUP_WIDTH = 420;
const POPUP_MIN_HEIGHT = 96;
const POPUP_MAX_HEIGHT = 560;

/** The always-on-top window that shows a lookup by the cursor without taking the keyboard from the game. */
export class Popup {
  private readonly window: BrowserWindow;
  private state: PopupState | null = null;
  private anchor: Point = { x: 0, y: 0 };
  private height = POPUP_MIN_HEIGHT;

  constructor() {
    this.window = new BrowserWindow({
      width: POPUP_WIDTH,
      height: POPUP_MIN_HEIGHT,
      show: false,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      // Clicking it doesn't take the keyboard from the game.
      focusable: false,
      backgroundColor: '#0b0e17',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });
    // The highest level, so it stays above the game's full-screen window.
    this.window.setAlwaysOnTop(true, 'screen-saver');
    this.window.webContents.on('will-navigate', (event) => event.preventDefault());
    this.window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    // A lookup that arrived while the page was still loading is sent again.
    this.window.webContents.on('did-finish-load', () => {
      if (this.state) this.window.webContents.send('popup:state', this.state);
    });
    void this.window.loadFile(path.join(__dirname, '..', 'static', 'popup.html'));

    ipcMain.on('popup:close', () => this.hide());
    ipcMain.on('popup:open-wowhead', () => this.openOnWowhead());
    ipcMain.on('popup:height', (_event, height: unknown) => this.fitHeight(height));
  }

  /** Shows a new lookup by the cursor. */
  open(state: PopupState): void {
    this.anchor = screen.getCursorScreenPoint();
    this.show(state);
  }

  /** Shows a lookup's result, if the popup still shows that lookup. */
  update(state: PopupState): void {
    if (this.window.isVisible() && this.state?.link.url === state.link.url) this.show(state);
  }

  hide(): void {
    if (!this.window.isVisible()) return;
    this.window.hide();
    this.state = null;
    globalShortcut.unregister('Escape');
  }

  private show(state: PopupState): void {
    this.state = state;
    this.window.webContents.send('popup:state', state);
    this.place();
    if (!this.window.isVisible()) {
      this.window.showInactive();
      // While the popup is up, Escape closes it, as it closes the game's own windows.
      globalShortcut.register('Escape', () => this.hide());
    }
  }

  private fitHeight(height: unknown): void {
    if (typeof height !== 'number' || !Number.isFinite(height)) return;
    this.height = Math.round(Math.min(Math.max(height, POPUP_MIN_HEIGHT), POPUP_MAX_HEIGHT));
    this.place();
  }

  private place(): void {
    const area = screen.getDisplayNearestPoint(this.anchor).workArea;
    const { x, y } = placePopup(this.anchor, { width: POPUP_WIDTH, height: this.height }, area);
    this.window.setBounds({ x, y, width: POPUP_WIDTH, height: this.height });
  }

  private openOnWowhead(): void {
    // Only ever the link the add-on copied, as parseWowheadLink rebuilt it.
    const url = this.state?.link.url;
    this.hide();
    if (url) void shell.openExternal(url);
  }
}
```

- [ ] **Step 7: Write `app/src/main/main.ts`**

```ts
import { app, clipboard, Menu, nativeImage, Tray } from 'electron';
import path from 'node:path';
import type { WowheadLink } from '../shared/wowheadLink';
import { fetchText, loadInBrowser, prepareWowheadSession } from './browserFetch';
import { DiskCache } from './cache';
import { ClipboardWatcher } from './clipboardWatcher';
import { latestOnly } from './latestOnly';
import { Popup } from './popupWindow';
import { TRAY_ICON_SIZE, trayIconPixels } from './trayIcon';
import { clipboardSequence, foregroundExeName } from './win32';
import { WowheadClient } from './wowheadClient';

// Held here so they aren't garbage-collected while the app runs.
let tray: Tray | undefined;
let watcher: ClipboardWatcher | undefined;

function start(): void {
  prepareWowheadSession();
  const popup = new Popup();
  const client = new WowheadClient({
    fetchText,
    loadInBrowser,
    cache: new DiskCache(path.join(app.getPath('userData'), 'cache')),
  });
  const lookUp = latestOnly((link: WowheadLink) => client.lookup(link), (state) => popup.update(state));
  const ownExe = path.basename(process.execPath).toLowerCase();

  watcher = new ClipboardWatcher({
    clipboardSequence,
    foregroundExeName,
    readClipboardText: () => clipboard.readText(),
    onLink: (link) => {
      popup.open({ kind: 'loading', link });
      lookUp(link);
    },
    onForeground: (gameInFront, exeName) => {
      // Switching to another program hides the popup. Clicking the popup doesn't, since it never takes focus.
      if (!gameInFront && exeName !== '' && exeName.toLowerCase() !== ownExe) popup.hide();
    },
  });
  watcher.start();

  tray = new Tray(nativeImage.createFromBitmap(trayIconPixels(), { width: TRAY_ICON_SIZE, height: TRAY_ICON_SIZE }));
  tray.setToolTip('Wowhead Gatherer: hold Ctrl over an item in WoW and press C');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Wowhead Gatherer', enabled: false },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
}

// One copy at a time: a second start just ends.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // The app lives in the tray, so closing its last window mustn't quit it.
  app.on('window-all-closed', () => {});
  void app.whenReady().then(start);
}
```

- [ ] **Step 8: Run everything, then build**

Run: `npm test && npm run typecheck && npm run build`
Expected: every test file passes, `tsc` prints nothing, and esbuild writes `dist/main.js`, `dist/preload.js` and `dist/popup.js`.

- [ ] **Step 9: End-to-end check in game (ask the user to do it; the app needs their screen)**

1. `npm start`. Expected: a red disc with a gold rim in the tray. If it's blue, swap the first and third bytes of `FILL` and `RIM` in `trayIcon.ts` (Electron gave RGBA, not BGRA), and update the test's expected bytes the same way.
2. In WoW, set Options → System → Display Mode to **Windowed (Fullscreen)** if it isn't already.
3. Hold Ctrl over **Netherweave Cloth** in your bags and press C. Expected:
   - a popup right of the cursor within about 2 seconds;
   - "Dropped by" starts with Heckling Fel Sprite (Hellfire Peninsula · 83%), and "Contained in" and "Fished in" follow;
   - you can still move with WASD, because the game kept the keyboard.
4. Press Escape. Expected: the popup closes and the game menu does **not** open. Press Escape again: the game menu opens.
5. Look up something again and click **Open on Wowhead**. Expected: the browser opens the item and the popup hides.
6. Look something up, then alt-tab to another program. Expected: the popup hides.
7. Copy a Wowhead link in the browser. Expected: no popup.
8. Look up **Felweed** and **Knothide Leather**. Expected: "Gathered from" and "Skinned from" sections.
   - If either is missing, open the item on Wowhead in a browser, view the source (Ctrl+U) and search for `new Listview`.
   - Find the table whose `name:` reads like "gathered from" or "skinned from", and put its `id:` into `SECTIONS` in `src/main/itemInfo.ts`.
   - Add a row to the spec's source-table list, run `npm test && npm run build`, and look again.
9. Turn the network off and look up an item you haven't looked up today. Expected: "Couldn't reach Wowhead. Check your internet connection." Turn the network back on.
10. Open `%APPDATA%\Wowhead Gatherer\cache`. Expected: files such as `item-v1-tbc-en-21877.json` and `zones-v1-tbc.json`.

If the popup doesn't appear over the game in step 3, check that WoW isn't in exclusive Fullscreen. If page lookups keep failing with "didn't let the app read", report it: the bot-check fallback needs a closer look.

- [ ] **Step 10: Commit**

```bash
cd "/d/Development/WoW Addons/WowheadGatherer"
git add app/src/main app/test/shell.test.ts
git commit -m "feat(app): run as a tray app with the overlay popup" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: A portable .exe, and the notes

**Files:**
- Modify: `app/package.json` (electron-builder, `dist` script, `build` config), `CLAUDE.md`
- Generated (ignored by git): `app/release/`

**Interfaces:**
- Consumes: the app from Task 10.
- Produces: `app/release/Wowhead Gatherer 0.1.0.exe` (portable, no installer).

- [ ] **Step 1: Add electron-builder**

```bash
cd "/d/Development/WoW Addons/WowheadGatherer/app"
npm install --save-dev electron-builder
```

In `app/package.json`, add to `"scripts"`:

```json
    "dist": "npm run build && electron-builder --win portable"
```

and add this top-level key (next to `"scripts"`):

```json
  "build": {
    "appId": "com.kresimircoko.wowheadgatherer",
    "productName": "Wowhead Gatherer",
    "directories": { "output": "release" },
    "files": ["dist/**", "static/**", "package.json"],
    "win": { "target": "portable" }
  }
```

- [ ] **Step 2: Build it**

Run: `npm run dist`
Expected: it finishes with `release/Wowhead Gatherer 0.1.0.exe`. koffi's `.node` file is unpacked automatically.

- [ ] **Step 3: Check the .exe (ask the user)**

Quit the `npm start` copy from the tray. Run `release\Wowhead Gatherer 0.1.0.exe`. Expected: the tray icon appears, and one lookup in game (Task 10, step 3) works the same.

- [ ] **Step 4: Add the run instructions to `CLAUDE.md`**

In `CLAUDE.md`, replace the line `- **Run the app:** see Task 11 of the plan once it's packaged.` with:

```markdown
- **Run the app:** from source, `cd app && npm start`. As a program, `cd app && npm run dist`, then run `app\release\Wowhead Gatherer 0.1.0.exe` (portable; copy it anywhere). It lives in the tray, where Quit ends it.
```

- [ ] **Step 5: Run every test once more**

Run: `.venv/Scripts/python -m pytest tests -q` (repo root) and `npm test && npm run typecheck` (in `app/`).
Expected: `106 passed`, every Vitest file passes, and `tsc` prints nothing.

- [ ] **Step 6: Commit**

```bash
cd "/d/Development/WoW Addons/WowheadGatherer"
git add app/package.json app/package-lock.json CLAUDE.md
git commit -m "build(app): portable Windows .exe" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
