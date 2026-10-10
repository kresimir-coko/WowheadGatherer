local _, ns = ...

-- Returns the item ID and link (the link can be nil) a tooltip is showing, or
-- nil. Mainline-family clients (WoW Forever) attach tooltip data, read through
-- TooltipUtil. TBC Anniversary doesn't load TooltipUtil, so there, and for
-- tooltips filled some other way, the old GetItem() does the work.
local function ReadTooltip(tooltip)
    if TooltipUtil and tooltip.IsTooltipType and tooltip:IsTooltipType(Enum.TooltipDataType.Item) then
        local _, link = TooltipUtil.GetDisplayedItem(tooltip)
        local data = tooltip:GetPrimaryTooltipData()
        -- The link can be missing for an item the client hasn't cached yet.
        local itemID = ns.ParseItemLink(link) or (data and data.id)
        if itemID then
            return itemID, link
        end
    end
    if tooltip.GetItem then
        local _, link = tooltip:GetItem()
        local itemID = ns.ParseItemLink(link)
        if itemID then
            return itemID, link
        end
    end
end

-- Returns the item ID and link of the item under the cursor, or nil.
-- ItemRefTooltip (opened by clicking a chat link) stays up after the cursor
-- leaves it, so it only counts while hovered.
function ns.GetHoveredItem()
    local candidates = {
        { tooltip = ItemRefTooltip, needsMouse = true },
        { tooltip = GameTooltip },
    }
    for _, candidate in ipairs(candidates) do
        local tooltip = candidate.tooltip
        if tooltip and tooltip:IsShown() and (not candidate.needsMouse or tooltip:IsMouseOver()) then
            local itemID, link = ReadTooltip(tooltip)
            if itemID then
                return itemID, link
            end
        end
    end
end

-- Returns what's under the cursor: "item" or "quest", its ID, and the item's
-- link or the quest's name (either can be nil). Nil when it's neither. Items
-- come first, so a quest log open behind a bag doesn't take over.
function ns.GetHovered()
    local itemID, link = ns.GetHoveredItem()
    if itemID then
        return "item", itemID, link
    end
    local questID, title = ns.GetHoveredQuest()
    if questID then
        return "quest", questID, title
    end
end
