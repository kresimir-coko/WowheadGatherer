import pytest

from conftest import ADDON_DIR, Addon, toc_files

ITEM = 0
THUNDERFURY = "|cffff8000|Hitem:19019::::::::70:::::|h[Thunderfury, Blessed Blade of the Windseeker]|h|r"


@pytest.fixture
def addon(addon):
    addon.load_all()
    addon.fire("ADDON_LOADED", "WowheadGatherer")
    return addon


@pytest.fixture
def popups(addon):
    """Records ShowCopyPopup calls instead of building the popup."""
    addon.run("popups = {}; function ns:ShowCopyPopup(url) table.insert(popups, url) end")
    return lambda: addon.values("popups")


def hover_thunderfury(addon):
    addon.g.GameTooltip = addon.tooltip(dataType=ITEM, dataID=19019, dataLink=THUNDERFURY)


def log_in(addon):
    """The login events, in the order the client usually sends them."""
    for event in ("PLAYER_LOGIN", "PLAYER_ENTERING_WORLD", "VARIABLES_LOADED"):
        addon.fire(event)


def test_toc_lists_every_lua_file():
    assert sorted(toc_files()) == sorted(p.name for p in ADDON_DIR.glob("*.lua"))


def test_saved_variables_get_defaults(addon):
    assert addon.g.WowheadGathererDB.enabled is True
    assert addon.g.WowheadGathererDB.language == "client"
    assert addon.g.WowheadGathererCharDB.defaultKeyOffered is False


def test_saved_settings_survive_load():
    addon = Addon()
    addon.run("WowheadGathererDB = { enabled = false }")
    addon.load_all()
    addon.fire("ADDON_LOADED", "WowheadGatherer")
    assert addon.g.WowheadGathererDB.enabled is False
    assert addon.g.WowheadGathererDB.closeOnCopy is True


def test_lookup_shows_the_tbc_link(addon, popups):
    hover_thunderfury(addon)
    addon.g.WowheadGatherer_OnBinding()
    assert popups() == ["https://www.wowhead.com/tbc/item=19019"]


def test_lookup_follows_the_game_language(addon, popups):
    addon.g.locale = "deDE"
    hover_thunderfury(addon)
    addon.g.WowheadGatherer_OnBinding()
    assert popups() == ["https://www.wowhead.com/tbc/de/item=19019"]


def test_lookup_can_force_english(addon, popups):
    addon.g.locale = "deDE"
    addon.g.WowheadGathererDB.language = "english"
    hover_thunderfury(addon)
    addon.g.WowheadGatherer_OnBinding()
    assert popups() == ["https://www.wowhead.com/tbc/item=19019"]


def test_lookup_uses_the_forever_site_there(addon, popups):
    addon.g.WOW_PROJECT_ID = 18
    hover_thunderfury(addon)
    addon.g.WowheadGatherer_OnBinding()
    assert popups() == ["https://www.wowhead.com/forever/item=19019"]


def test_nothing_hovered_says_so(addon, popups):
    addon.g.WowheadGatherer_OnBinding()
    assert popups() == []
    assert addon.values("flashes") == ["Hover over an item to look it up on Wowhead."]


def test_turned_off_says_so(addon, popups):
    addon.g.WowheadGathererDB.enabled = False
    hover_thunderfury(addon)
    addon.g.WowheadGatherer_OnBinding()
    assert popups() == []
    assert addon.values("flashes") == ["Wowhead Gatherer is turned off. Turn it on in /whg."]


def test_login_binds_the_default_key_and_says_how(addon):
    log_in(addon)
    assert addon.g.bindings["CTRL-C"] == "WOWHEADGATHERER_LOOKUP"
    assert any("press Ctrl-C" in line for line in addon.values("printed"))


def test_login_reports_a_taken_key(addon):
    addon.g.bindings["CTRL-C"] = "TOGGLEBACKPACK"
    log_in(addon)
    assert addon.g.bindings["CTRL-C"] == "TOGGLEBACKPACK"
    assert any("already used for Open Backpack" in line for line in addon.values("printed"))


def test_bindings_are_left_alone_until_they_are_loaded(addon):
    # The player's bindings arrive with the account data; at PLAYER_LOGIN they
    # may not be in yet, and a key bound then could be lost or steal one.
    addon.fire("PLAYER_LOGIN")
    addon.fire("PLAYER_ENTERING_WORLD")
    assert addon.g.bindings["CTRL-C"] is None
    assert addon.ns.db.defaultKeyOffered is False
    addon.fire("VARIABLES_LOADED")
    assert addon.g.bindings["CTRL-C"] == "WOWHEADGATHERER_LOOKUP"


def test_bindings_wait_for_both_events_in_either_order(addon):
    addon.fire("PLAYER_LOGIN")
    addon.fire("VARIABLES_LOADED")
    assert addon.g.bindings["CTRL-C"] is None
    addon.fire("PLAYER_ENTERING_WORLD")
    assert addon.g.bindings["CTRL-C"] == "WOWHEADGATHERER_LOOKUP"


def test_login_says_how_only_once(addon):
    log_in(addon)
    addon.fire("PLAYER_ENTERING_WORLD")  # zoning fires it again
    assert sum("press Ctrl-C" in line for line in addon.values("printed")) == 1


def test_login_in_combat_waits_for_combat_to_end(addon):
    addon.g.inCombat = True
    log_in(addon)
    assert addon.g.bindings["CTRL-C"] is None
    addon.g.inCombat = False
    addon.fire("PLAYER_REGEN_ENABLED")
    assert addon.g.bindings["CTRL-C"] == "WOWHEADGATHERER_LOOKUP"


def test_slash_command_opens_options(addon):
    addon.fire("PLAYER_LOGIN")
    addon.run("opened = false; function ns:OpenOptions() opened = true end")
    addon.g.SlashCmdList.WOWHEADGATHERER("")
    assert addon.g.opened is True
