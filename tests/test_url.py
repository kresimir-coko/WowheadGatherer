import pytest

RETAIL, TBC, FOREVER, UNKNOWN = 1, 5, 18, 999
THUNDERFURY = "|cffff8000|Hitem:19019::::::::70:::::|h[Thunderfury, Blessed Blade of the Windseeker]|h|r"


@pytest.fixture
def ns(addon):
    addon.load("Url.lua")
    return addon.ns


def test_tbc_english(ns):
    assert ns.BuildItemURL(19019, TBC, "enUS") == "https://www.wowhead.com/tbc/item=19019"


def test_tbc_british_english_has_no_language(ns):
    assert ns.BuildItemURL(19019, TBC, "enGB") == "https://www.wowhead.com/tbc/item=19019"


def test_tbc_german(ns):
    assert ns.BuildItemURL(19019, TBC, "deDE") == "https://www.wowhead.com/tbc/de/item=19019"


def test_forever(ns):
    assert ns.BuildItemURL(19019, FOREVER, "enUS") == "https://www.wowhead.com/forever/item=19019"


def test_forever_german(ns):
    assert ns.BuildItemURL(19019, FOREVER, "deDE") == "https://www.wowhead.com/forever/de/item=19019"


def test_retail_has_no_site_path(ns):
    assert ns.BuildItemURL(19019, RETAIL, "deDE") == "https://www.wowhead.com/de/item=19019"


def test_unknown_client_falls_back_to_retail(ns):
    assert ns.BuildItemURL(19019, UNKNOWN, "enUS") == "https://www.wowhead.com/item=19019"


def test_unknown_locale_falls_back_to_english(ns):
    assert ns.BuildItemURL(19019, TBC, "xxXX") == "https://www.wowhead.com/tbc/item=19019"


@pytest.mark.parametrize("locale, path", [
    ("deDE", "de"), ("esES", "es"), ("esMX", "mx"), ("frFR", "fr"), ("itIT", "it"),
    ("ptBR", "pt"), ("ruRU", "ru"), ("koKR", "ko"), ("zhCN", "cn"), ("zhTW", "tw"),
])
def test_every_language(ns, locale, path):
    assert ns.BuildItemURL(19019, TBC, locale) == f"https://www.wowhead.com/tbc/{path}/item=19019"


def test_parse_item_link(ns):
    assert ns.ParseItemLink(THUNDERFURY) == (19019, "Thunderfury, Blessed Blade of the Windseeker")


def test_parse_bare_item_string(ns):
    assert ns.ParseItemLink("item:19019") == (19019, None)


def test_parse_ignores_spell_links(ns):
    assert ns.ParseItemLink("|cff71d5ff|Hspell:133|h[Fireball]|h|r") is None


def test_parse_ignores_nil(ns):
    assert ns.ParseItemLink(None) is None


FEL_ORC = "|cffffff00|Hquest:10482:58|h[Fel Orc Scavengers]|h|r"


def test_quest_address(ns):
    assert ns.BuildURL("quest", 10482, TBC, "enUS") == "https://www.wowhead.com/tbc/quest=10482"


def test_quest_address_in_german_on_forever(ns):
    assert ns.BuildURL("quest", 10482, FOREVER, "deDE") == "https://www.wowhead.com/forever/de/quest=10482"


def test_item_address_through_build_url(ns):
    assert ns.BuildURL("item", 19019, TBC, "enUS") == ns.BuildItemURL(19019, TBC, "enUS")


def test_parse_quest_link(ns):
    assert ns.ParseQuestLink(FEL_ORC) == (10482, "Fel Orc Scavengers")


def test_parse_bare_quest_string(ns):
    # ItemRefTooltip:SetHyperlink gets the link without its |H…|h wrapping.
    assert ns.ParseQuestLink("quest:10482:58") == (10482, None)


def test_parse_questie_quest_link(ns):
    # Questie turns chat quest links into its own, its name wrapped in colour codes.
    link = "|Hquestie:10482:Player-4904-0ABC1234|h|cff40c040[|r|cffffff00[58] Fel Orc Scavengers|r|cff40c040]|r|h"
    assert ns.ParseQuestLink(link) == (10482, None)
    assert ns.ParseQuestLink("questie:10482:Player-4904-0ABC1234") == (10482, None)


def test_parse_quest_ignores_item_links(ns):
    assert ns.ParseQuestLink(THUNDERFURY) is None


def test_parse_quest_ignores_nil(ns):
    assert ns.ParseQuestLink(None) is None
