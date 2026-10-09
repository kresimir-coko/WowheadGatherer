import pytest

# Records what the options page registers.
SETTINGS_SPY = """
registered = {}
Settings.RegisterAddOnSetting = function(_, variable, key) table.insert(registered, key); return Mock() end
Settings.RegisterVerticalLayoutCategory = function(name)
    categoryName = name
    local category = Mock()
    rawset(category, "GetID", function() return 7 end)
    return category, Mock()
end
Settings.OpenToCategory = function(id) openedID = id end
bindingIndex = 42
C_KeyBindings.GetBindingIndex = function(action)
    if action == "WOWHEADGATHERER_LOOKUP" then return bindingIndex end
end
bindingRows = 0
CreateKeybindingEntryInitializer = function(index)
    if index == 42 then bindingRows = bindingRows + 1 end
    return Mock()
end
"""


@pytest.fixture
def addon(addon):
    addon.run(SETTINGS_SPY)
    addon.load("Keybinding.lua")
    addon.load("Options.lua")
    addon.ns.title = "Wowhead Gatherer"
    addon.ns.defaults = addon.lua.table_from({"enabled": True, "language": "client", "closeOnCopy": True})
    addon.ns.db = addon.lua.table_from({"enabled": True, "language": "client", "closeOnCopy": True})
    return addon


def test_page_is_named_after_the_addon(addon):
    addon.run("ns:InitializeOptions()")
    assert addon.g.categoryName == "Wowhead Gatherer"


def test_every_setting_is_on_the_page(addon):
    addon.run("ns:InitializeOptions()")
    assert addon.values("registered") == ["enabled", "language", "closeOnCopy"]


def test_key_binding_row_is_on_the_page(addon):
    addon.run("ns:InitializeOptions()")
    assert addon.g.bindingRows == 1


def test_missing_binding_skips_the_row(addon):
    addon.g.bindingIndex = None
    addon.run("ns:InitializeOptions()")
    assert addon.g.bindingRows == 0


def test_open_options(addon):
    addon.run("ns:InitializeOptions(); ns:OpenOptions()")
    assert addon.g.openedID == 7
