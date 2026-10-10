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
    addon.run(f'ns:ShowCopyPopup("{HEARTHSTONE_URL}", "item", 6948, nil); popupBox = keyboardFocus')
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


def test_a_let_go_lasts_until_ctrl_is_released(addon):
    # Bag tooltips refresh every 0.2 s while hovered (ContainerFrameItemButton_OnEnter
    # through UpdateTooltip), firing OnTooltipSetItem again. That mustn't take back the
    # focus a non-C key just gave up, or every Ctrl+key press would be swallowed.
    hold_ctrl(addon)
    key(addon, "OnKeyDown", "1")
    addon.run_hook(addon.g.GameTooltip, "OnTooltipSetItem")
    assert ready_url(addon) is None
    assert addon.g.keyboardFocus is None


def test_escape_lets_go_until_ctrl_is_released(addon):
    hold_ctrl(addon)
    box = ready_box(addon)
    box.scripts.OnEscapePressed(box)
    addon.run_hook(addon.g.GameTooltip, "OnTooltipSetItem")
    assert ready_url(addon) is None


def test_pressing_ctrl_again_readies_again(addon):
    hold_ctrl(addon)
    key(addon, "OnKeyDown", "1")
    release_ctrl(addon)
    hold_ctrl(addon)
    assert ready_url(addon) == URL


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


FEL_ORC_URL = "https://www.wowhead.com/tbc/quest=10482"


def hover_quest_title(addon, owner=None):
    """Moves from the bag item to a TBC quest log title (Fel Orc Scavengers), announced
    as Blizzard does. The game tooltip is closed; `owner` is its last owner."""
    addon.g.GameTooltip = addon.tooltip(shown=False, owner=owner)
    return addon.run("""
        questLog = { { title = "Fel Orc Scavengers", questID = 10482, objectives = 1 } }
        local button = FakeHoverable({ row = 1, mouseOver = true })
        EventRegistry:TriggerEvent("QuestLogFrame.MouseOver", button, 1)
        return button
    """)


def frame(addon):
    """One frame of the game: the ready box's OnUpdate."""
    box = ready_box(addon)
    box.scripts.OnUpdate(box, 0.016)


def test_holding_ctrl_over_a_quest_readies_its_link(addon):
    hover_quest_title(addon)
    hold_ctrl(addon)
    assert ready_url(addon) == FEL_ORC_URL


def test_entering_a_quest_while_holding_ctrl(addon):
    hold_ctrl(addon)
    hover_quest_title(addon)
    assert ready_url(addon) == FEL_ORC_URL


def test_leaving_the_quest_lets_go(addon):
    # A quest has no tooltip that closes when the cursor leaves it.
    button = hover_quest_title(addon)
    hold_ctrl(addon)
    assert ready_url(addon) == FEL_ORC_URL
    button.mouseOver = False
    frame(addon)
    assert ready_url(addon) is None
    assert addon.g.keyboardFocus is None


def test_staying_on_the_quest_keeps_it_ready(addon):
    hover_quest_title(addon)
    hold_ctrl(addon)
    frame(addon)
    assert ready_url(addon) == FEL_ORC_URL


def test_a_closed_tooltip_last_owned_by_an_action_button_does_not_matter(addon):
    hover_quest_title(addon, owner=addon.lua.table_from({"action": 5}))
    hold_ctrl(addon)
    assert ready_url(addon) == FEL_ORC_URL


def test_the_quest_check_leaves_items_alone(addon):
    hold_ctrl(addon)
    frame(addon)
    assert ready_url(addon) == URL


def test_ctrl_c_copies_a_quest(addon):
    hover_quest_title(addon)
    hold_ctrl(addon)
    key(addon, "OnKeyDown", "C")
    key(addon, "OnKeyUp", "C")
    assert addon.values("flashes") == ["Wowhead link copied."]
