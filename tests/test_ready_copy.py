import pytest

from conftest import Addon

ITEM = 0
URL = "https://www.wowhead.com/tbc/item=19019"
HEARTHSTONE_URL = "https://www.wowhead.com/tbc/item=6948"
THUNDERFURY = "|cffff8000|Hitem:19019::::::::70:::::|h[Thunderfury, Blessed Blade of the Windseeker]|h|r"
HEARTHSTONE = "|cffffffff|Hitem:6948::::::::70:::::|h[Hearthstone]|h|r"


@pytest.fixture
def addon(addon):
    """Logged in on TBC, hovering Thunderfury in a bag."""
    addon.g.GameTooltip = addon.tooltip(legacyLink=THUNDERFURY)
    addon.load_all()
    addon.fire("ADDON_LOADED", "WowheadGatherer")
    addon.run("function ns.Flash(text) table.insert(flashes, text) end")
    addon.fire("PLAYER_LOGIN")
    return addon


def hold_ctrl(addon):
    addon.g.ctrlDown = True
    addon.fire("MODIFIER_STATE_CHANGED", "LCTRL", 1)


def release_ctrl(addon):
    addon.g.ctrlDown = False
    addon.fire("MODIFIER_STATE_CHANGED", "LCTRL", 0)


def ready_url(addon):
    return addon.run("return ns:GetReadyURL()")


def ready_box(addon):
    return addon.g.keyboardFocus


def key(addon, script, name):
    box = ready_box(addon)
    box.scripts[script](box, name)


def test_holding_ctrl_over_an_item_readies_its_link(addon):
    hold_ctrl(addon)
    assert ready_url(addon) == URL
    assert ready_box(addon).text == URL


def test_releasing_ctrl_lets_go(addon):
    hold_ctrl(addon)
    release_ctrl(addon)
    assert ready_url(addon) is None
    assert addon.g.keyboardFocus is None


def test_ctrl_with_nothing_hovered_does_nothing(addon):
    addon.g.GameTooltip = addon.tooltip(shown=False)
    hold_ctrl(addon)
    assert ready_url(addon) is None
    assert addon.g.keyboardFocus is None


def test_never_in_combat(addon):
    addon.g.inCombat = True
    hold_ctrl(addon)
    assert ready_url(addon) is None


def test_entering_combat_lets_go(addon):
    hold_ctrl(addon)
    addon.fire("PLAYER_REGEN_DISABLED")
    assert ready_url(addon) is None
    assert addon.g.keyboardFocus is None


def test_leaves_chat_typing_alone(addon):
    addon.run('chatBox = CreateFrame("EditBox"); keyboardFocus = chatBox')
    hold_ctrl(addon)
    assert ready_url(addon) is None
    assert addon.run("return keyboardFocus == chatBox") is True


def test_leaves_the_link_popup_focus_alone(addon):
    # The fallback link popup is open with its box focused. Holding Ctrl to
    # copy from it must not move the focus to the hidden box.
    addon.run(f'ns:ShowCopyPopup("{HEARTHSTONE_URL}", 6948, nil); popupBox = keyboardFocus')
    hold_ctrl(addon)
    assert ready_url(addon) is None
    assert addon.run("return keyboardFocus == popupBox") is True


def test_not_over_action_buttons(addon):
    button = addon.lua.table_from({"action": 5})
    addon.g.GameTooltip = addon.tooltip(legacyLink=THUNDERFURY, owner=button)
    hold_ctrl(addon)
    assert ready_url(addon) is None


@pytest.mark.parametrize("setting", ["enabled", "readyCopy"])
def test_off_when_turned_off(addon, setting):
    addon.g.WowheadGathererDB[setting] = False
    hold_ctrl(addon)
    assert ready_url(addon) is None


def test_ctrl_c_copies_and_says_so(addon):
    hold_ctrl(addon)
    key(addon, "OnKeyDown", "C")
    key(addon, "OnKeyUp", "C")
    assert addon.values("flashes") == ["Wowhead link copied."]
    # Ctrl is still held, so the link stays ready for another copy.
    assert ready_url(addon) == URL


def test_any_other_key_lets_go(addon):
    hold_ctrl(addon)
    key(addon, "OnKeyDown", "1")
    assert ready_url(addon) is None
    assert addon.g.keyboardFocus is None


def test_other_modifiers_keep_it_ready(addon):
    hold_ctrl(addon)
    key(addon, "OnKeyDown", "LSHIFT")
    assert ready_url(addon) == URL


def test_escape_lets_go(addon):
    hold_ctrl(addon)
    box = ready_box(addon)
    box.scripts.OnEscapePressed(box)
    assert ready_url(addon) is None


def test_typing_cannot_change_the_link(addon):
    hold_ctrl(addon)
    box = ready_box(addon)
    box.SetText(box, "junk")
    box.scripts.OnTextChanged(box, True)
    assert box.text == URL


def test_ctrl_key_up_is_a_backstop_for_letting_go(addon):
    hold_ctrl(addon)
    addon.g.ctrlDown = False
    key(addon, "OnKeyUp", "LCTRL")
    assert ready_url(addon) is None


def test_moving_to_another_item_while_holding_ctrl(addon):
    tooltip = addon.g.GameTooltip
    hold_ctrl(addon)
    addon.run(f'function GameTooltip:GetItem() return "Hearthstone", "{HEARTHSTONE}" end')
    addon.run_hook(tooltip, "OnTooltipSetItem")
    assert ready_url(addon) == HEARTHSTONE_URL


def test_item_tooltip_without_ctrl_does_nothing(addon):
    addon.run_hook(addon.g.GameTooltip, "OnTooltipSetItem")
    assert ready_url(addon) is None


def test_tooltip_hiding_lets_go(addon):
    hold_ctrl(addon)
    addon.run_hook(addon.g.GameTooltip, "OnHide")
    assert ready_url(addon) is None


def test_shift_does_not_ready(addon):
    addon.fire("MODIFIER_STATE_CHANGED", "LSHIFT", 1)
    assert ready_url(addon) is None


def test_hooks_tooltip_data_on_mainline_clients():
    # WoW Forever's tooltips carry data; TooltipDataProcessor is the way in there.
    addon = Addon()
    addon.run("postCalls = {}; TooltipDataProcessor = { AddTooltipPostCall = function(kind, fn) postCalls[kind] = fn end }")
    addon.g.GameTooltip = addon.tooltip(dataType=ITEM, dataID=19019, dataLink=THUNDERFURY)
    addon.load_all()
    addon.fire("ADDON_LOADED", "WowheadGatherer")
    addon.fire("PLAYER_LOGIN")
    assert addon.run("return postCalls[Enum.TooltipDataType.Item] ~= nil") is True
    assert addon.run("return GameTooltip.hooks.OnTooltipSetItem == nil") is True
