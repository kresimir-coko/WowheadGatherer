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
