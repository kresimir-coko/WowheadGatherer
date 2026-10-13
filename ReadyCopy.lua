local _, ns = ...

-- One-press copy. While Ctrl is held over an item or quest, a hidden edit box
-- holds its Wowhead link, selected and with keyboard focus, so the C of Ctrl+C
-- copies it straight away. The game's edit box does the copying; the add-on
-- never touches the clipboard (CopyToClipboard is Blizzard-only).
--
-- Key bindings don't fire while the box has focus, so a Ctrl+key binding
-- pressed over an item or quest would be used up. That's why the box is never readied
-- in combat or over action buttons, and lets go of focus on any other key.

-- Keys whose press readies the link and whose release lets it go. Ctrl copies
-- on Windows, Cmd (the meta key) on a Mac.
local READY_KEYS = { LCTRL = true, RCTRL = true, LMETA = true, RMETA = true }

local watcher = ns.CreateCopyWatcher()
local box
-- The link in the box while it's readied, or nil.
local readyURL
-- What the box holds: "item" or "quest", and its ID.
local readyKind, readyID
-- Set when a key other than C, or Escape, gave the focus back. Bag tooltips
-- refresh every 0.2 s while hovered, and that mustn't take the focus again
-- until Ctrl is pressed anew.
local letGo = false

local function IsReadyKeyDown()
    return IsControlKeyDown() or IsMetaKeyDown()
end

-- Action buttons keep their slot in .action (Blizzard_ActionBar/Shared/ActionButton.lua).
-- The pet, stance and possess bars set none, so they're known by their names;
-- their keys are Ctrl+number and Ctrl+F-keys by default.
local BAR_BUTTON_NAMES = { "^PetActionButton%d", "^StanceButton%d", "^ShapeshiftButton%d", "^PossessButton%d" }

local function IsActionButton(frame)
    if type(frame) ~= "table" then
        return false
    end
    if frame.action ~= nil then
        return true
    end
    local name = frame.GetName and frame:GetName()
    if type(name) ~= "string" then
        return false
    end
    for _, pattern in ipairs(BAR_BUTTON_NAMES) do
        if name:match(pattern) then
            return true
        end
    end
    return false
end

local function LetGo()
    letGo = true
    ns:UnreadyCopy()
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
            LetGo()
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
    editBox:SetScript("OnEscapePressed", LetGo)
    -- Keep the whole link there and selected, so a copy always takes all of it.
    editBox:SetScript("OnTextChanged", function(self, userInput)
        if userInput and readyURL then
            self:SetText(readyURL)
            self:HighlightText()
        end
    end)
    editBox:SetScript("OnEditFocusLost", function()
        readyURL, readyKind, readyID = nil, nil, nil
        watcher.Reset()
    end)
    -- A quest has no tooltip that closes when the cursor leaves it, so check
    -- each frame that it's still under the cursor.
    editBox:SetScript("OnUpdate", function()
        if readyKind == "quest" and ns.GetHoveredQuest() ~= readyID then
            ns:UnreadyCopy()
        end
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
    -- Ctrl+number over an action button is a key binding, not a copy. Only a
    -- shown tooltip says what's under the cursor; a closed one keeps its last owner.
    return not (GameTooltip:IsShown() and IsActionButton(GameTooltip:GetOwner()))
end

-- Readies the link of the item or quest under the cursor, or lets go when
-- there's nothing to ready.
function ns:ReadyCopy()
    local kind, id
    if self:CanReadyCopy() then
        kind, id = ns.GetHovered()
    end
    if not id then
        self:UnreadyCopy()
        return
    end
    box = box or CreateReadyBox()
    readyKind, readyID = kind, id
    readyURL = ns.BuildURL(kind, id, WOW_PROJECT_ID, self:GetWowheadLocale())
    box:SetText(readyURL)
    box:SetFocus()
    box:HighlightText()
end

function ns:UnreadyCopy()
    readyURL, readyKind, readyID = nil, nil, nil
    if box and box:HasFocus() then
        box:ClearFocus()
    end
end

-- The readied link, or nil.
function ns:GetReadyURL()
    return readyURL
end

-- Moving onto another item or quest while still holding Ctrl readies that one.
local function ReadyIfHeld()
    if IsReadyKeyDown() and not letGo then
        ns:ReadyCopy()
    end
end

local function OnTooltipFilled(tooltip)
    if tooltip == GameTooltip then
        ReadyIfHeld()
    end
end

-- Mainline-family clients (Forever) run tooltip post-calls before they show the
-- tooltip, and the spell book doesn't refresh it afterwards, so the hovered
-- thing is only readable a frame later.
local function OnTooltipDataFilled(tooltip)
    if tooltip == GameTooltip then
        C_Timer.After(0, ReadyIfHeld)
    end
end

-- Run by Quests.lua when a quest log title or tracker quest is entered.
function ns:OnQuestEntered()
    ReadyIfHeld()
end

-- Hooks the item and spell tooltips. Classic clients have TooltipDataProcessor,
-- but their own tooltips only run the old scripts, so it's used only where
-- tooltips carry data (the check Questie makes).
function ns:InitializeReadyCopy()
    if GameTooltip.GetPrimaryTooltipData and TooltipDataProcessor then
        TooltipDataProcessor.AddTooltipPostCall(Enum.TooltipDataType.Item, OnTooltipDataFilled)
        TooltipDataProcessor.AddTooltipPostCall(Enum.TooltipDataType.Spell, OnTooltipDataFilled)
    else
        for _, script in ipairs({ "OnTooltipSetItem", "OnTooltipSetSpell" }) do
            if GameTooltip:HasScript(script) then
                GameTooltip:HookScript(script, OnTooltipFilled)
            end
        end
    end
    GameTooltip:HookScript("OnHide", function()
        ns:UnreadyCopy()
    end)
end

function ns:MODIFIER_STATE_CHANGED(key, down)
    if not READY_KEYS[key] then
        return
    end
    letGo = false
    if down == 1 then
        self:ReadyCopy()
    else
        self:UnreadyCopy()
    end
end

function ns:PLAYER_REGEN_DISABLED()
    self:UnreadyCopy()
end
