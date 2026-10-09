local _, ns = ...

-- Popup size in pixels.
local POPUP_WIDTH = 400
local POPUP_HEIGHT = 104
-- Item icon size in pixels.
local ICON_SIZE = 28
-- Space around the contents, and between the icon row and the address box, in pixels.
local PADDING = 12
local BOX_GAP = 10
-- Keys that only modify others. Pressing one never cancels a copy in progress.
-- ReadyCopy.lua uses them too.
ns.MODIFIER_KEYS = {
    LCTRL = true, RCTRL = true, LSHIFT = true, RSHIFT = true,
    LALT = true, RALT = true, LMETA = true, RMETA = true,
}

-- Tells when the player copies from the address box. The key that opened the
-- popup is often Ctrl+C itself, and its key-up lands in the box once the box
-- has focus. So only a C key-up after a Ctrl+C (or Cmd+C) key-down that the
-- box saw counts as a copy.
function ns.CreateCopyWatcher()
    local armed = false
    local watcher = {}

    function watcher.KeyDown(key, copyModifierDown)
        if not ns.MODIFIER_KEYS[key] then
            armed = key == "C" and copyModifierDown == true
        end
    end

    -- Returns true when this key-up finishes a copy.
    function watcher.KeyUp(key)
        if key == "C" and armed then
            armed = false
            return true
        end
        return false
    end

    function watcher.Reset()
        armed = false
    end

    return watcher
end

local watcher = ns.CreateCopyWatcher()
local popup
-- The address on show, and its item. Typing into the box puts the address back.
local currentURL, currentItemID

-- Ctrl copies on Windows, Cmd (the meta key) on a Mac.
local function IsCopyModifierDown()
    return IsControlKeyDown() or IsMetaKeyDown()
end

local function GetCopyHint()
    -- IsMacClient is only documented for newer clients, so check it exists.
    local keys = (IsMacClient and IsMacClient()) and "Cmd+C" or "Ctrl+C"
    return "Press " .. keys .. " to copy, then paste it into your browser."
end

local function CreatePopup()
    -- Named so UISpecialFrames can close it with Escape after the box loses focus.
    local frame = CreateFrame("Frame", "WowheadGathererPopup", UIParent, "TooltipBackdropTemplate")
    frame:SetSize(POPUP_WIDTH, POPUP_HEIGHT)
    frame:SetPoint("CENTER", 0, 150)
    frame:SetFrameStrata("DIALOG")
    frame:SetClampedToScreen(true)
    frame:EnableMouse(true)
    frame:Hide()
    tinsert(UISpecialFrames, "WowheadGathererPopup")

    local icon = frame:CreateTexture(nil, "ARTWORK")
    icon:SetSize(ICON_SIZE, ICON_SIZE)
    icon:SetPoint("TOPLEFT", PADDING, -PADDING)
    icon:SetTexCoord(0.08, 0.92, 0.08, 0.92)
    frame.icon = icon

    -- Both of the name's corners sit on the icon's row, clear of the close button.
    local name = frame:CreateFontString(nil, "ARTWORK", "GameFontNormal")
    name:SetPoint("TOPLEFT", icon, "TOPRIGHT", 8, 0)
    name:SetPoint("BOTTOMRIGHT", frame, "TOPRIGHT", -32, -(PADDING + ICON_SIZE))
    name:SetJustifyH("LEFT")
    name:SetWordWrap(false)
    frame.name = name

    local close = CreateFrame("Button", nil, frame, "UIPanelCloseButton")
    close:SetPoint("TOPRIGHT", -2, -2)

    local box = CreateFrame("EditBox", nil, frame, "InputBoxTemplate")
    box:SetPoint("TOPLEFT", icon, "BOTTOMLEFT", 6, -BOX_GAP)
    box:SetPoint("TOPRIGHT", frame, "TOPRIGHT", -16, -(PADDING + ICON_SIZE + BOX_GAP))
    box:SetHeight(20)
    box:SetAutoFocus(false)
    frame.box = box

    local hint = frame:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
    hint:SetPoint("TOPLEFT", box, "BOTTOMLEFT", -6, -8)
    frame.hint = hint

    box:SetScript("OnEscapePressed", function()
        frame:Hide()
    end)
    box:SetScript("OnEnterPressed", function()
        frame:Hide()
    end)
    -- Keep the whole address there and selected, so a copy always takes all of it.
    box:SetScript("OnTextChanged", function(self, userInput)
        if userInput then
            self:SetText(currentURL)
            self:HighlightText()
        end
    end)
    box:SetScript("OnEditFocusGained", function(self)
        self:HighlightText()
    end)
    box:SetScript("OnMouseUp", function(self)
        self:HighlightText()
    end)
    box:SetScript("OnKeyDown", function(_, key)
        -- Key bindings don't fire while the box has focus, so the lookup key
        -- over another item would only copy the old address. Look it up instead.
        if GetBindingFromClick(key) == ns.BINDING then
            local itemID = ns.GetHoveredItem()
            if itemID and itemID ~= currentItemID then
                ns:LookupHoveredItem()
                return
            end
        end
        watcher.KeyDown(key, IsCopyModifierDown())
    end)
    box:SetScript("OnKeyUp", function(_, key)
        if watcher.KeyUp(key) then
            ns.Flash("Wowhead link copied.", 1, 0.82, 0)
            if ns.db.closeOnCopy then
                frame:Hide()
            end
        end
    end)
    frame:SetScript("OnHide", function()
        box:ClearFocus()
    end)
    return frame
end

-- Shows an item's Wowhead address, selected and ready to copy. Showing it
-- again for another item swaps the contents.
function ns:ShowCopyPopup(url, itemID, link)
    popup = popup or CreatePopup()
    currentURL, currentItemID = url, itemID
    popup.icon:SetTexture(C_Item.GetItemIconByID(itemID))
    popup.name:SetText(link or C_Item.GetItemNameByID(itemID) or ("Item " .. itemID))
    popup.hint:SetText(GetCopyHint())
    popup.box:SetText(url)
    popup:Show()
    watcher.Reset()
    popup.box:SetFocus()
    popup.box:HighlightText()
end
