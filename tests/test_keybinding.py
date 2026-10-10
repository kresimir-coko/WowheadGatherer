import pytest

ACCOUNT, CHARACTER = 1, 2


@pytest.fixture
def addon(addon):
    addon.load("Keybinding.lua")
    addon.ns.db = addon.lua.table_from({"defaultKeyOffered": False})
    addon.ns.charDB = addon.lua.table_from({"defaultKeyOffered": False})
    return addon


def offer(addon):
    return addon.run("return ns:OfferDefaultKey()")


def test_binds_ctrl_c_on_first_run(addon):
    assert offer(addon) == "bound"
    assert addon.g.bindings["CTRL-C"] == "WOWHEADGATHERER_LOOKUP"
    assert addon.g.savedSet == ACCOUNT
    assert addon.ns.db.defaultKeyOffered is True


def test_offers_only_once(addon):
    offer(addon)
    addon.g.bindings["CTRL-C"] = None  # the player cleared the key
    assert offer(addon) is None
    assert addon.g.bindings["CTRL-C"] is None


def test_never_steals_a_key_in_use(addon):
    addon.g.bindings["CTRL-C"] = "TOGGLEBACKPACK"
    assert offer(addon) == ("taken", "TOGGLEBACKPACK")
    assert addon.g.bindings["CTRL-C"] == "TOGGLEBACKPACK"
    assert addon.g.savedSet is None
    assert addon.ns.db.defaultKeyOffered is True


def test_keeps_the_players_own_key(addon):
    addon.g.bindings["ALT-W"] = "WOWHEADGATHERER_LOOKUP"
    assert offer(addon) is None
    assert addon.g.bindings["CTRL-C"] is None


def test_character_bindings_use_the_character_flag(addon):
    addon.g.currentSet = CHARACTER
    assert offer(addon) == "bound"
    assert addon.g.savedSet == CHARACTER
    assert addon.ns.charDB.defaultKeyOffered is True
    assert addon.ns.db.defaultKeyOffered is False


def test_character_bindings_offered_even_after_account(addon):
    addon.ns.db.defaultKeyOffered = True
    addon.g.currentSet = CHARACTER
    assert offer(addon) == "bound"


def test_key_text(addon):
    assert addon.ns.GetLookupKeyText() is None
    offer(addon)
    assert addon.ns.GetLookupKeyText() == "Ctrl-C"


def test_binding_runs_the_lookup(addon):
    addon.run("calls = 0; function ns:LookupHovered() calls = calls + 1 end")
    addon.g.WowheadGatherer_OnBinding()
    assert addon.g.calls == 1
