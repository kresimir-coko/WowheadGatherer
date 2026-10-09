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
