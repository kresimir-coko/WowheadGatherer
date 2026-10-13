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

-- Returns the spell ID and name a tooltip is showing, or nil. Mainline-family
-- clients (WoW Forever) read the tooltip's data through TooltipUtil. TBC asks the
-- tooltip: GetSpell() returns name, spellID (older clients: name, rank, spellID),
-- so the ID is the last number.
local function ReadSpell(tooltip)
    if TooltipUtil and TooltipUtil.GetDisplayedSpell and tooltip.IsTooltipType then
        local name, spellID = TooltipUtil.GetDisplayedSpell(tooltip)
        if spellID then
            return spellID, name
        end
    end
    if tooltip.GetSpell then
        local name, second, third = tooltip:GetSpell()
        local spellID = tonumber(third) or tonumber(second)
        if spellID then
            return spellID, name
        end
    end
end

-- Reads the tooltips a lookup looks at, in order, with read. ItemRefTooltip
-- (opened by clicking a chat link) stays up after the cursor leaves it, so it
-- only counts while hovered.
local function ReadHoveredTooltip(read)
    local candidates = {
        { tooltip = ItemRefTooltip, needsMouse = true },
        { tooltip = GameTooltip },
    }
    for _, candidate in ipairs(candidates) do
        local tooltip = candidate.tooltip
        if tooltip and tooltip:IsShown() and (not candidate.needsMouse or tooltip:IsMouseOver()) then
            local id, label = read(tooltip)
            if id then
                return id, label
            end
        end
    end
end

-- Returns the item ID and link of the item under the cursor, or nil.
function ns.GetHoveredItem()
    return ReadHoveredTooltip(ReadTooltip)
end

-- Returns the spell ID and name of the spell under the cursor, or nil.
function ns.GetHoveredSpell()
    return ReadHoveredTooltip(ReadSpell)
end

-- A spell's icon and name: C_Spell on mainline-family clients (Forever), the
-- old globals on TBC.
function ns.SpellIcon(spellID)
    if C_Spell and C_Spell.GetSpellTexture then
        return C_Spell.GetSpellTexture(spellID)
    end
    return GetSpellTexture and GetSpellTexture(spellID)
end

function ns.SpellName(spellID)
    if C_Spell and C_Spell.GetSpellName then
        return C_Spell.GetSpellName(spellID)
    end
    return GetSpellInfo and (GetSpellInfo(spellID))
end

-- Returns what's under the cursor: "item", "spell" or "quest", its ID, and the
-- item's link, or the spell's or quest's name (any can be nil). Nil when it's
-- none of them. Items come first, then spells (both read from the tooltip on
-- show), then quests, so a quest log open behind a bag doesn't take over.
function ns.GetHovered()
    local itemID, link = ns.GetHoveredItem()
    if itemID then
        return "item", itemID, link
    end
    local spellID, spellName = ns.GetHoveredSpell()
    if spellID then
        return "spell", spellID, spellName
    end
    local questID, title = ns.GetHoveredQuest()
    if questID then
        return "quest", questID, title
    end
end
