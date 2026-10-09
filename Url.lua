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

-- Builds an item's Wowhead address, e.g. https://www.wowhead.com/tbc/de/item=19019.
-- Wowhead redirects it to the page with the item's name in the address.
function ns.BuildItemURL(itemID, projectID, locale)
    local url = ns.WOWHEAD_ROOT
    local site = SITE_PATHS[projectID]
    if site and site ~= "" then
        url = url .. site .. "/"
    end
    local language = LANGUAGE_PATHS[locale]
    if language then
        url = url .. language .. "/"
    end
    return url .. "item=" .. itemID
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
