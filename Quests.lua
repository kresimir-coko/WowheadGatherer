local _, ns = ...

-- Quests under the cursor. Blizzard announces hovers over quest log titles (TBC
-- and Forever) and over Forever's tracker through EventRegistry, so those are
-- listened for. TBC's tracker lines don't take the mouse, so they're checked
-- where they are. A clicked chat quest link is remembered as ItemRefTooltip
-- shows it.

-- The hover announcements: TBC's quest log (Blizzard_UIPanels_Game/TBC/QuestLogFrame.lua),
-- and Forever's quest list and tracker (Mainline/QuestMapFrame.lua,
-- Blizzard_ObjectiveTracker/Blizzard_QuestObjectiveTracker.lua).
local QUEST_LOG_HOVER = "QuestLogFrame.MouseOver"         -- (button, logIndex)
local QUEST_MAP_HOVER = "QuestMapLogTitleButton.OnEnter"  -- (button, questID)
local TRACKER_HOVER = "OnQuestBlockHeader.OnEnter"        -- (block, questID, isGroup)
-- How many lines TBC's tracker has (MAX_QUESTWATCH_LINES in QuestLogFrame.lua).
local WATCH_LINES = 30

-- The last quest log title, Forever quest list title and Forever tracker block entered.
local logButton, mapButton, trackerBlock
-- The quest a clicked chat link showed in ItemRefTooltip, or nil.
local chatLinkQuest
-- That quest's name from the tooltip's first line, for when the client doesn't know it yet.
local chatLinkName
-- TBC tracker line number -> { questID, title }, rebuilt after each tracker update.
local watchLineQuests = {}

-- The top frame under the cursor that takes the mouse (WorldFrame when none
-- does), or nil when the client can't say.
local function MouseFocus()
    local foci = GetMouseFoci and GetMouseFoci()
    return foci and foci[1]
end

-- Whether frame is ancestor or sits inside it.
local function IsWithin(frame, ancestor)
    while frame do
        if frame == ancestor then
            return true
        end
        frame = frame:GetParent()
    end
    return false
end

-- Whether the cursor is on a button or block, not on a frame covering it (an
-- open bag, say): IsMouseOver only checks the rectangle.
local function IsHovered(region)
    if not (region ~= nil and region:IsVisible() and region:IsMouseOver()) then
        return false
    end
    local focus = MouseFocus()
    return focus == nil or IsWithin(focus, region)
end

-- TBC's tracker lines take no mouse, so one counts only when no frame that
-- does is over it: the cursor is on the 3D world, or on the tracker itself.
local function IsLineHovered(line)
    if not (line:IsVisible() and line:IsMouseOver()) then
        return false
    end
    local focus = MouseFocus()
    return focus == nil or focus == WorldFrame or IsWithin(focus, QuestWatchFrame)
end

-- A quest's name, where the client knows it: C_QuestLog.GetTitleForQuestID on
-- mainline-family clients (Forever), C_QuestLog.GetQuestInfo on TBC.
function ns.QuestTitle(questID)
    local questLog = C_QuestLog
    if not questLog then
        return nil
    end
    local getTitle = questLog.GetTitleForQuestID or questLog.GetQuestInfo
    return getTitle and getTitle(questID) or nil
end

-- How many earlier and how many later quests a chain lists.
local MAX_CHAIN_SIDE = 25

-- A field of a quest from Questie's database (QuestieDB's public LibQuestieDB),
-- or nil when Questie isn't there or fails.
local function QuestieField(questID, key)
    local lib = _G.LibQuestieDB
    local quests = lib and lib.Quest
    if not (quests and type(quests.Get) == "function") then
        return nil
    end
    local ok, value = pcall(quests.Get, questID, key)
    if ok then
        return value
    end
end

-- The quests that come before questID: Questie's preQuestGroup (all of these)
-- and preQuestSingle (one of these). Negative IDs mark exclusions, not quests.
local function Prerequisites(questID)
    local found = {}
    for _, key in ipairs({ "preQuestGroup", "preQuestSingle" }) do
        local list = QuestieField(questID, key)
        if type(list) == "table" then
            for _, id in ipairs(list) do
                if type(id) == "number" and id > 0 then
                    found[#found + 1] = id
                end
            end
        end
    end
    return found
end

-- The quest's whole chain from Questie, oldest first: the nearest earlier quests
-- by prerequisite (each after the ones it needs), the quest, then the later ones
-- by nextQuestInChain. Nil without Questie, or when the quest stands alone.
function ns.QuestChain(questID)
    local seen = { [questID] = true }
    -- The nearest earlier quests, found breadth-first...
    local found, queue, head, count = {}, { questID }, 1, 0
    while queue[head] and count < MAX_CHAIN_SIDE do
        for _, pre in ipairs(Prerequisites(queue[head])) do
            if not seen[pre] and count < MAX_CHAIN_SIDE then
                seen[pre], found[pre] = true, true
                count = count + 1
                queue[#queue + 1] = pre
            end
        end
        head = head + 1
    end
    -- ...then listed so each comes after the quests it needs.
    local chain, placed = {}, {}
    local function place(id)
        for _, pre in ipairs(Prerequisites(id)) do
            if found[pre] and not placed[pre] then
                placed[pre] = true
                place(pre)
                chain[#chain + 1] = pre
            end
        end
    end
    place(questID)
    chain[#chain + 1] = questID
    local later, nextID = 0, QuestieField(questID, "nextQuestInChain")
    while type(nextID) == "number" and nextID > 0 and not seen[nextID] and later < MAX_CHAIN_SIDE do
        seen[nextID] = true
        chain[#chain + 1] = nextID
        later = later + 1
        nextID = QuestieField(nextID, "nextQuestInChain")
    end
    if #chain == 1 then
        return nil
    end
    return chain
end

-- Percent-encodes text byte by byte, keeping ASCII letters, digits, "-" and "_".
-- Explicit ranges, not %w, which follows the C locale and can take UTF-8 bytes for letters.
local function Encode(text)
    return (tostring(text):gsub("[^A-Za-z0-9%-_]", function(c)
        return string.format("%%%02X", c:byte())
    end))
end

-- "#chain=9824~Arcane%20Disturbances.9825~..." for a quest with a Questie chain,
-- or "". A browser ignores everything after "#"; the app reads it.
function ns.QuestChainFragment(questID)
    local chain = ns.QuestChain(questID)
    if not chain then
        return ""
    end
    local entries = {}
    for i, id in ipairs(chain) do
        entries[i] = id .. "~" .. Encode(QuestieField(id, "name") or ("Quest " .. id))
    end
    return "#chain=" .. table.concat(entries, ".")
end

-- The Wowhead address a lookup copies: for a quest, with its Questie chain after "#".
function ns:LookupURL(kind, id)
    local url = ns.BuildURL(kind, id, WOW_PROJECT_ID, self:GetWowheadLocale())
    if kind == "quest" then
        url = url .. ns.QuestChainFragment(id)
    end
    return url
end

-- The quest on a TBC quest log title. It's read now, not when the title was
-- entered, so a wheel scroll since then is followed. Headers (zones) have none.
local function LogButtonQuest(button)
    -- "All" (QuestLogCollapseAllButton) shares the title buttons' template and
    -- announces itself too, but it's no row: its ID is 0.
    local row = button:GetID()
    if not row or row < 1 then
        return nil
    end
    local index = row + FauxScrollFrame_GetOffset(QuestLogListScrollFrame)
    local title, _, _, isHeader, _, _, _, questID = GetQuestLogTitle(index)
    if questID and questID > 0 and not isHeader then
        return questID, title
    end
end

-- Maps TBC's tracker lines to quests the way QuestWatch_Update fills them: for
-- each watched quest with objectives, its title, then one line per objective.
local function MapWatchLines()
    watchLineQuests = {}
    local line = 1
    for i = 1, GetNumQuestWatches() do
        local index = GetQuestIndexForWatch(i)
        local objectives = index and GetNumQuestLeaderBoards(index) or 0
        if objectives > 0 then
            local title, _, _, _, _, _, _, questID = GetQuestLogTitle(index)
            for l = line, math.min(line + objectives, WATCH_LINES) do
                watchLineQuests[l] = { questID = questID, title = title }
            end
            line = line + objectives + 1
        end
    end
end

local function TrackerLineQuest()
    if not (QuestWatchFrame and QuestWatchFrame:IsVisible()) then
        return nil
    end
    for l, quest in pairs(watchLineQuests) do
        if quest.questID and IsLineHovered(_G["QuestWatchLine" .. l]) then
            return quest.questID, quest.title
        end
    end
end

-- Returns the ID and, when known, the name of the quest under the cursor, or nil.
function ns.GetHoveredQuest()
    -- Turning with the mouse freezes the cursor wherever the turn began.
    if IsMouselooking and IsMouselooking() then
        return nil
    end
    if chatLinkQuest and ItemRefTooltip:IsShown() and ItemRefTooltip:IsMouseOver() then
        return chatLinkQuest, ns.QuestTitle(chatLinkQuest) or chatLinkName
    end
    if IsHovered(logButton) then
        local questID, title = LogButtonQuest(logButton)
        if questID then
            return questID, title
        end
    end
    if IsHovered(mapButton) and mapButton.questID then
        return mapButton.questID, ns.QuestTitle(mapButton.questID)
    end
    if IsHovered(trackerBlock) and trackerBlock.id then
        return trackerBlock.id, ns.QuestTitle(trackerBlock.id)
    end
    return TrackerLineQuest()
end

local function Entered()
    -- ReadyCopy.lua readies a quest entered while Ctrl is held.
    if ns.OnQuestEntered then
        ns:OnQuestEntered()
    end
end

-- Listens for the hovers and chat links. Run at PLAYER_LOGIN, once Blizzard's
-- frames exist. Each piece is set up only on the clients that have it.
function ns:InitializeQuests()
    if EventRegistry then
        EventRegistry:RegisterCallback(QUEST_LOG_HOVER, function(_, button)
            logButton = button
            Entered()
        end, ns)
        EventRegistry:RegisterCallback(QUEST_MAP_HOVER, function(_, button)
            mapButton = button
            Entered()
        end, ns)
        EventRegistry:RegisterCallback(TRACKER_HOVER, function(_, block)
            trackerBlock = block
            Entered()
        end, ns)
    end
    if QuestWatch_Update then
        hooksecurefunc("QuestWatch_Update", MapWatchLines)
        MapWatchLines()
    end
    if ItemRefTooltip and ItemRefTooltip.SetHyperlink then
        hooksecurefunc(ItemRefTooltip, "SetHyperlink", function(_, link)
            chatLinkQuest = ns.ParseQuestLink(link)
            -- The client may not have the quest's name yet; the tooltip's first line does.
            local line = _G.ItemRefTooltipTextLeft1
            chatLinkName = chatLinkQuest and line and line:GetText() or nil
        end)
        if ItemRefTooltip.HookScript then
            ItemRefTooltip:HookScript("OnHide", function()
                chatLinkQuest, chatLinkName = nil, nil
            end)
        end
    end
end
