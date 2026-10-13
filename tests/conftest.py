"""Runs the add-on's Lua files in Lua 5.1 (the game's version) against stubbed WoW APIs.

Each test gets a fresh Lua state. Stubs keep their state in plain globals
(bindings, flashes, printed, ...) so tests can set them up and check them.
"""
import pathlib
import re

import pytest
from lupa.lua51 import LuaRuntime

ADDON_DIR = pathlib.Path(__file__).resolve().parent.parent
ADDON_NAME = "WowheadGatherer"

WOW_STUBS = r"""
-- A stand-in for any frame or API table: every field is another mock, and
-- calling one returns a mock, so UI-building code runs without the game.
function Mock()
    return setmetatable({}, {
        __index = function(t, k)
            local child = Mock()
            rawset(t, k, child)
            return child
        end,
        -- Two results, for calls like `local category, layout = ...`.
        __call = function() return Mock(), Mock() end,
    })
end

tinsert = table.insert
Enum = {
    TooltipDataType = { Item = 0, Spell = 1 },
    BindingSet = { Default = 0, Account = 1, Character = 2 },
}
WOW_PROJECT_ID = 5
locale = "enUS"
function GetLocale() return locale end
inCombat = false
function InCombatLockdown() return inCombat end
ctrlDown, metaDown, macClient = false, false, false
function IsControlKeyDown() return ctrlDown end
function IsMetaKeyDown() return metaDown end
function IsMacClient() return macClient end
-- Keyboard focus: the frame that last called SetFocus, as the game tracks it.
keyboardFocus = nil
function GetCurrentKeyBoardFocus() return keyboardFocus end
ChatFontNormal = Mock()
C_AddOns = {
    GetAddOnMetadata = function(_, field)
        return ({ Title = "Wowhead Gatherer", Version = "0.1.0" })[field]
    end,
}
C_Item = {
    GetItemIconByID = function(itemID) return 135349 end,
    GetItemNameByID = function(itemID) return nil end,
}

printed = {}
function print(...) table.insert(printed, table.concat({ ... }, " ")) end
flashes = {}
UIErrorsFrame = { AddMessage = function(_, text) table.insert(flashes, text) end }

-- Key bindings: key -> action.
bindings = {}
savedSet = nil
currentSet = 1
function GetCurrentBindingSet() return currentSet end
function GetBindingKey(action)
    for key, bound in pairs(bindings) do
        if bound == action then return key end
    end
end
function GetBindingAction(key) return bindings[key] or "" end
function SetBinding(key, action) bindings[key] = action; return true end
function SaveBindings(set) savedSet = set end
function GetBindingText(key) return (key:gsub("CTRL%-", "Ctrl-")) end
function GetBindingName(action) return ({ TOGGLEBACKPACK = "Open Backpack" })[action] end
-- The binding a key press would run, from the bindings table and Ctrl.
function GetBindingFromClick(key)
    return bindings[(ctrlDown and "CTRL-" or "") .. key] or ""
end

-- Spell names the client knows, by ID, and TBC's spell globals.
spellNames = {}
function GetSpellInfo(spellID) return spellNames[spellID] end
function GetSpellTexture(spellID) return 136207 end

-- Mirrors TooltipUtil.GetDisplayedItem in Blizzard_SharedXMLGame/Tooltip/TooltipUtil.lua.
TooltipUtil = {
    -- Mirrors TooltipUtil.GetDisplayedSpell (C_Spell.GetSpellName there; spellNames here).
    GetDisplayedSpell = function(tooltip)
        if tooltip:IsTooltipType(Enum.TooltipDataType.Spell) then
            local id = tooltip:GetPrimaryTooltipData().id
            return spellNames[id], id
        end
    end,
    GetDisplayedItem = function(tooltip)
        if tooltip:IsTooltipType(Enum.TooltipDataType.Item) then
            local data = tooltip:GetPrimaryTooltipData()
            if data.hyperlink then
                return "Name", data.hyperlink, data.id
            end
        end
    end,
}

-- Fake tooltips. Options: shown (default true), mouseOver, dataType (0 item,
-- 1 spell; leave out for a tooltip without tooltip data), dataID, dataLink, legacyLink,
-- legacySpell (a list GetSpell() returns, e.g. { "Arcane Shot", 27019 }).
function FakeTooltip(o)
    local tooltip = {}
    function tooltip:IsShown() return o.shown ~= false end
    function tooltip:IsMouseOver() return o.mouseOver == true end
    if o.dataType then
        function tooltip:IsTooltipType(kind) return kind == o.dataType end
        function tooltip:GetPrimaryTooltipData() return { id = o.dataID, hyperlink = o.dataLink } end
    end
    if o.legacyLink then
        function tooltip:GetItem() return "Name", o.legacyLink end
    end
    if o.legacySpell then
        function tooltip:GetSpell() return unpack(o.legacySpell) end
    end
    -- Scripts add-ons hook (run them with Addon.run_hook), and the owner frame.
    tooltip.hooks = {}
    function tooltip:HasScript(script)
        return script == "OnTooltipSetItem" or script == "OnTooltipSetSpell" or script == "OnHide"
    end
    function tooltip:HookScript(script, func) self.hooks[script] = func end
    function tooltip:GetOwner() return o.owner end
    function tooltip:SetHyperlink(link) self.hyperlink = link end
    return tooltip
end

-- Frames and font strings are mocks that also keep their text and anchor
-- points; frames also keep their scripts, events and shown state.
UIParent = Mock()
UISpecialFrames = {}
createdFrames = {}
function FakeRegion()
    local region = Mock()
    rawset(region, "SetText", function(self, text) rawset(self, "text", text) end)
    rawset(region, "GetText", function(self) return rawget(self, "text") end)
    rawset(region, "points", {})
    rawset(region, "SetPoint", function(self, ...) table.insert(self.points, { ... }) end)
    return region
end
function CreateFrame(frameType, name)
    local frame = FakeRegion()
    rawset(frame, "scripts", {})
    rawset(frame, "events", {})
    rawset(frame, "shown", true)
    rawset(frame, "SetScript", function(self, script, func) self.scripts[script] = func end)
    rawset(frame, "RegisterEvent", function(self, event) self.events[event] = true end)
    rawset(frame, "UnregisterEvent", function(self, event) self.events[event] = nil end)
    rawset(frame, "Show", function(self) self.shown = true end)
    rawset(frame, "Hide", function(self)
        local wasShown = self.shown
        self.shown = false
        if wasShown and self.scripts.OnHide then self.scripts.OnHide(self) end
    end)
    rawset(frame, "IsShown", function(self) return self.shown end)
    rawset(frame, "SetFocus", function(self) keyboardFocus = self end)
    rawset(frame, "ClearFocus", function(self)
        if keyboardFocus == self then
            keyboardFocus = nil
            if self.scripts.OnEditFocusLost then self.scripts.OnEditFocusLost(self) end
        end
    end)
    rawset(frame, "HasFocus", function(self) return keyboardFocus == self end)
    rawset(frame, "CreateFontString", function() return FakeRegion() end)
    rawset(frame, "CreateTexture", function()
        local texture = FakeRegion()
        rawset(texture, "SetTexture", function(self, path) rawset(self, "texture", path) end)
        return texture
    end)
    table.insert(createdFrames, frame)
    if name then _G[name] = frame end
    return frame
end
function FireEvent(event, ...)
    for _, frame in ipairs(createdFrames) do
        if frame.events[event] and frame.scripts.OnEvent then
            frame.scripts.OnEvent(frame, event, ...)
        end
    end
end

-- The settings UI only has to build without errors.
Settings = Mock()
C_KeyBindings = Mock()
CreateSettingsListSectionHeaderInitializer = Mock()
CreateKeybindingEntryInitializer = Mock()
SlashCmdList = {}

-- A hidden tooltip, so code that hooks GameTooltip at login always finds one.
GameTooltip = FakeTooltip({ shown = false })

-- hooksecurefunc([table,] name, hook): the hook runs after the original, with its arguments.
function hooksecurefunc(target, name, hook)
    if type(target) == "string" then
        target, name, hook = _G, target, name
    end
    local original = target[name]
    target[name] = function(...)
        local results = { original(...) }
        hook(...)
        return unpack(results)
    end
end

-- EventRegistry calls a callback registered with an owner as func(owner, ...)
-- (Blizzard_SharedXMLBase/CallbackRegistry.lua).
EventRegistry = { callbacks = {} }
function EventRegistry:RegisterCallback(event, func, owner)
    self.callbacks[event] = self.callbacks[event] or {}
    table.insert(self.callbacks[event], { func = func, owner = owner })
end
function EventRegistry:TriggerEvent(event, ...)
    for _, callback in ipairs(self.callbacks[event] or {}) do
        callback.func(callback.owner, ...)
    end
end

-- A button, block or text line the cursor can be over. Fields: shown (default
-- true), mouseOver, row (what GetID returns), and any others the code reads.
function FakeHoverable(o)
    function o:IsShown() return self.shown ~= false end
    function o:IsVisible() return self.shown ~= false end
    function o:IsMouseOver() return self.mouseOver == true end
    function o:GetID() return self.row end
    function o:GetParent() return self.parent end
    return o
end

-- What the cursor is on: the top of GetMouseFoci(), the frame that takes the
-- mouse there (WorldFrame when no frame does), or nil when unknown.
mouseFocus = nil
function GetMouseFoci() return { mouseFocus } end
WorldFrame = FakeHoverable({})
-- Whether the player is turning with the mouse (right button held).
mouselooking = false
function IsMouselooking() return mouselooking end

-- TBC's quest log: questLog[index] = { title, questID, isHeader, objectives },
-- scrolled down questLogOffset rows. GetQuestLogTitle returns what TBC's
-- QuestLogFrame.lua reads: title, level, tag, isHeader, collapsed, complete, frequency, questID.
questLog = {}
questLogOffset = 0
QuestLogListScrollFrame = {}
function FauxScrollFrame_GetOffset() return questLogOffset end
function GetQuestLogTitle(index)
    local quest = questLog[index]
    if not quest then return nil end
    return quest.title, 70, nil, quest.isHeader == true, false, nil, 0, quest.questID
end
-- TBC's tracker: the quest log indexes watched, in order, and its 30 lines.
questWatches = {}
function GetNumQuestWatches() return #questWatches end
function GetQuestIndexForWatch(i) return questWatches[i] end
function GetNumQuestLeaderBoards(index) return questLog[index] and questLog[index].objectives or 0 end
function QuestWatch_Update() end
QuestWatchFrame = FakeHoverable({})
for i = 1, 30 do
    _G["QuestWatchLine" .. i] = FakeHoverable({ shown = false })
end
-- Quest names the client knows, by ID. TBC names them with C_QuestLog.GetQuestInfo.
questTitles = {}
C_QuestLog = { GetQuestInfo = function(questID) return questTitles[questID] end }
-- A closed chat-link tooltip, so code that hooks it at login always finds one.
ItemRefTooltip = FakeTooltip({ shown = false })
"""


class Addon:
    """A fresh Lua state with the WoW stubs. load() runs an add-on file the way
    WoW does, passing it (addonName, ns)."""

    def __init__(self):
        self.lua = LuaRuntime(unpack_returned_tuples=True)
        self.g = self.lua.globals()
        self.lua.execute(WOW_STUBS)
        self.ns = self.lua.table()
        self.g.ns = self.ns
        self._run_file = self.lua.eval(
            "function(code, name, ...) return assert(loadstring(code, name))(...) end")

    def load(self, filename):
        code = (ADDON_DIR / filename).read_text(encoding="utf-8")
        self._run_file(code, "@" + filename, ADDON_NAME, self.ns)

    def load_all(self):
        """Loads every file the .toc lists, in its order."""
        for filename in toc_files():
            self.load(filename)

    def run(self, code):
        """Runs Lua code (with `ns` as a global) and returns its results."""
        return self.lua.execute(code)

    def fire(self, event, *args):
        self.g.FireEvent(event, *args)

    def tooltip(self, **options):
        return self.g.FakeTooltip(self.lua.table_from(options))

    def values(self, name):
        """A Lua array global as a Python list."""
        return list(self.g[name].values())

    def run_hook(self, tooltip, script):
        """Runs the function the add-on hooked onto a fake tooltip's script."""
        self.lua.eval("function(t, s) t.hooks[s](t) end")(tooltip, script)


def toc_files():
    toc = (ADDON_DIR / f"{ADDON_NAME}.toc").read_text(encoding="utf-8")
    return [line.strip() for line in toc.splitlines() if re.match(r"^\s*[^#\s].*\.lua\s*$", line)]


@pytest.fixture
def addon():
    return Addon()
