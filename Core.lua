local addonName, ns = ...

ns.title = C_AddOns.GetAddOnMetadata(addonName, "Title")
ns.version = C_AddOns.GetAddOnMetadata(addonName, "Version")

-- Saved variable defaults. Missing keys are filled in on load, so new options
-- can be added here without wiping existing user settings.
ns.defaults = {
    enabled = true,
    -- Wowhead's language: "client" follows the game's, "english" is always English.
    language = "client",
    closeOnCopy = true,
    -- Holding Ctrl over an item, quest or spell readies its link, so one Ctrl+C copies it.
    readyCopy = true,
    -- Whether the default key was offered with the account-wide bindings.
    defaultKeyOffered = false,
}

-- Settings saved separately for each character.
ns.charDefaults = {
    -- Whether the default key was offered with this character's own bindings.
    defaultKeyOffered = false,
}

local function ApplyDefaults(target, defaults)
    for key, value in pairs(defaults) do
        if target[key] == nil then
            target[key] = value
        end
    end
end

function ns:Print(...)
    print("|cff33ff99" .. self.title .. "|r:", ...)
end

-- Shows a short message in the middle of the screen, where game errors appear.
function ns.Flash(text, r, g, b)
    UIErrorsFrame:AddMessage(text, r, g, b)
end

-- The locale Wowhead pages open in.
function ns:GetWowheadLocale()
    if self.db.language == "english" then
        return "enUS"
    end
    return GetLocale()
end

-- Run by the lookup key: shows the Wowhead link of the item, quest or spell under the cursor.
function ns:LookupHovered()
    if not self.db.enabled then
        ns.Flash("Wowhead Gatherer is turned off. Turn it on in /whg.", 1, 0.1, 0.1)
        return
    end
    local kind, id, label = ns.GetHovered()
    if not id then
        ns.Flash("Hover over an item, quest or spell to look it up on Wowhead.", 1, 0.1, 0.1)
        return
    end
    self:ShowCopyPopup(self:LookupURL(kind, id), kind, id, label)
end

--------------------------------------------------------------------------------
-- Events
--------------------------------------------------------------------------------

-- Events are dispatched to ns methods of the same name, e.g. ns:PLAYER_LOGIN().
local eventFrame = CreateFrame("Frame")
eventFrame:SetScript("OnEvent", function(_, event, ...)
    ns[event](ns, ...)
end)

-- Offers the default key, telling the player what happened. Bindings are left
-- alone in combat, so a /reload mid-fight waits for it to end.
function ns:TryOfferDefaultKey()
    if InCombatLockdown() then
        eventFrame:RegisterEvent("PLAYER_REGEN_ENABLED")
        return
    end
    local result, action = self:OfferDefaultKey()
    if result == "bound" then
        self:Print("Hover over any item, quest or spell and press " .. ns.GetLookupKeyText()
            .. " to get its Wowhead link. Options: /whg")
    elseif result == "taken" then
        self:Print(GetBindingText(ns.DEFAULT_KEY) .. " is already used for "
            .. (GetBindingName(action) or action) .. ". Pick a key for lookups in /whg.")
    end
end

function ns:ADDON_LOADED(loadedAddon)
    if loadedAddon ~= addonName then return end
    eventFrame:UnregisterEvent("ADDON_LOADED")

    WowheadGathererDB = WowheadGathererDB or {}
    ApplyDefaults(WowheadGathererDB, self.defaults)
    self.db = WowheadGathererDB

    WowheadGathererCharDB = WowheadGathererCharDB or {}
    ApplyDefaults(WowheadGathererCharDB, self.charDefaults)
    self.charDB = WowheadGathererCharDB
end

function ns:PLAYER_LOGIN()
    -- Every add-on's Bindings.xml is loaded by now, so the options page can
    -- show the lookup key.
    self:InitializeOptions()
    self:InitializeQuests()
    self:InitializeReadyCopy()
end

-- The player's key bindings come with the account data, so they can still be
-- missing at PLAYER_LOGIN. Blizzard waits for both of these before it changes
-- bindings at login, and so does the default-key offer.
local bindingsWaitingFor = { PLAYER_ENTERING_WORLD = true, VARIABLES_LOADED = true }

local function OnBindingsEvent(event)
    eventFrame:UnregisterEvent(event)
    bindingsWaitingFor[event] = nil
    if not next(bindingsWaitingFor) then
        ns:TryOfferDefaultKey()
    end
end

function ns:PLAYER_ENTERING_WORLD()
    OnBindingsEvent("PLAYER_ENTERING_WORLD")
end

function ns:VARIABLES_LOADED()
    OnBindingsEvent("VARIABLES_LOADED")
end

function ns:PLAYER_REGEN_ENABLED()
    eventFrame:UnregisterEvent("PLAYER_REGEN_ENABLED")
    self:TryOfferDefaultKey()
end

eventFrame:RegisterEvent("ADDON_LOADED")
eventFrame:RegisterEvent("PLAYER_LOGIN")
eventFrame:RegisterEvent("PLAYER_ENTERING_WORLD")
eventFrame:RegisterEvent("VARIABLES_LOADED")
-- Ctrl and combat, for the readied copy (ReadyCopy.lua).
eventFrame:RegisterEvent("MODIFIER_STATE_CHANGED")
eventFrame:RegisterEvent("PLAYER_REGEN_DISABLED")

--------------------------------------------------------------------------------
-- Slash commands
--------------------------------------------------------------------------------

SLASH_WOWHEADGATHERER1 = "/whg"
SLASH_WOWHEADGATHERER2 = "/wowheadgatherer"
SlashCmdList.WOWHEADGATHERER = function()
    ns:OpenOptions()
end
