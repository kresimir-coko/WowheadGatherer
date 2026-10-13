local _, ns = ...

ns.WOWHEAD_ROOT = "https://www.wowhead.com/"

-- Wowhead's path for each game client, by WOW_PROJECT_ID. Retail pages have
-- no path, and retail is also the fallback for clients not listed here.
local SITE_PATHS = {
    [1] = "",           -- WOW_PROJECT_MAINLINE (retail)
    [5] = "tbc",        -- WOW_PROJECT_BURNING_CRUSADE_CLASSIC (TBC Anniversary)
    [18] = "forever",   -- WOW_PROJECT_CAMELOT (WoW Forever)
}

-- Wowhead's language path for each client locale (GetLocale()). English,
-- and any locale not listed, has none.
local LANGUAGE_PATHS = {
    deDE = "de",
    esES = "es",
    esMX = "mx",
    frFR = "fr",
    itIT = "it",
    ptBR = "pt",
    ruRU = "ru",
    koKR = "ko",
    zhCN = "cn",
    zhTW = "tw",
}

-- Builds the Wowhead address of an item, quest or spell (kind "item", "quest" or "spell"),
-- e.g. https://www.wowhead.com/tbc/de/quest=10482. Wowhead redirects it to the
-- page with the name in the address.
function ns.BuildURL(kind, id, projectID, locale)
    local url = ns.WOWHEAD_ROOT
    local site = SITE_PATHS[projectID]
    if site and site ~= "" then
        url = url .. site .. "/"
    end
    local language = LANGUAGE_PATHS[locale]
    if language then
        url = url .. language .. "/"
    end
    return url .. kind .. "=" .. id
end

-- An item's Wowhead address, e.g. https://www.wowhead.com/tbc/de/item=19019.
function ns.BuildItemURL(itemID, projectID, locale)
    return ns.BuildURL("item", itemID, projectID, locale)
end

-- Returns the item ID and name in an item link ("|Hitem:19019:...|h[Name]|h"),
-- or just the ID from a bare "item:19019" string. Nil when there's no item ID.
function ns.ParseItemLink(link)
    if type(link) ~= "string" then
        return nil
    end
    local itemID = tonumber(link:match("item:(%d+)"))
    if not itemID then
        return nil
    end
    return itemID, link:match("|h%[(.-)%]|h")
end

-- Returns the quest ID and name in a quest link ("|Hquest:10482:58|h[Name]|h"),
-- or just the ID from a bare "quest:10482:58" string, which is what
-- ItemRefTooltip:SetHyperlink gets. Nil when there's no quest ID.
function ns.ParseQuestLink(link)
    if type(link) ~= "string" then
        return nil
    end
    local questID = tonumber(link:match("^quest:(%d+)") or link:match("|Hquest:(%d+)"))
    if not questID then
        return nil
    end
    return questID, link:match("|h%[(.-)%]|h")
end
