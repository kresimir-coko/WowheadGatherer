import pytest

THUNDERFURY = "|cffff8000|Hitem:19019::::::::70:::::|h[Thunderfury, Blessed Blade of the Windseeker]|h|r"
FEL_ORC = (10482, "Fel Orc Scavengers")
KNOW_YOUR_ENEMY = (10160, "Know your Enemy")


def log_in(addon):
    addon.load_all()
    addon.fire("ADDON_LOADED", "WowheadGatherer")
    addon.fire("PLAYER_LOGIN")


@pytest.fixture
def tbc(addon):
    """TBC, logged in, with a zone header and two quests in the quest log."""
    addon.run("""
        questLog = {
            { title = "Hellfire Peninsula", isHeader = true },
            { title = "Fel Orc Scavengers", questID = 10482, objectives = 1 },
            { title = "Know your Enemy", questID = 10160, objectives = 2 },
        }
    """)
    log_in(addon)
    return addon


def hovered(addon):
    return addon.run("return ns.GetHoveredQuest()")


def enter_log_title(addon, row):
    """Hovers the quest log title on `row`, announced the way TBC's QuestLogFrame.lua does."""
    return addon.run(f"""
        local button = FakeHoverable({{ row = {row}, mouseOver = true }})
        EventRegistry:TriggerEvent("QuestLogFrame.MouseOver", button, {row} + questLogOffset)
        return button
    """)


def test_quest_log_title(tbc):
    enter_log_title(tbc, 2)
    assert hovered(tbc) == FEL_ORC


def test_zone_header_is_not_a_quest(tbc):
    enter_log_title(tbc, 1)
    assert hovered(tbc) is None


def test_leaving_the_title(tbc):
    button = enter_log_title(tbc, 2)
    button.mouseOver = False
    assert hovered(tbc) is None


def test_closing_the_quest_log(tbc):
    button = enter_log_title(tbc, 2)
    button.shown = False
    assert hovered(tbc) is None


def test_follows_a_wheel_scroll(tbc):
    # The wheel scrolls the list under a still cursor: the same title button now shows the next quest.
    enter_log_title(tbc, 2)
    tbc.g.questLogOffset = 1
    assert hovered(tbc) == KNOW_YOUR_ENEMY


def watch_both_quests(addon):
    # Lines: 1 Fel Orc Scavengers, 2 its objective, 3 Know your Enemy, 4 and 5 its objectives.
    addon.run("questWatches = { 2, 3 }; QuestWatch_Update()")


def hover_line(addon, line):
    addon.run(f"QuestWatchLine{line}.shown = true; QuestWatchLine{line}.mouseOver = true")


@pytest.mark.parametrize("line, quest", [(1, FEL_ORC), (2, FEL_ORC), (3, KNOW_YOUR_ENEMY), (5, KNOW_YOUR_ENEMY)])
def test_tracker_lines(tbc, line, quest):
    watch_both_quests(tbc)
    hover_line(tbc, line)
    assert hovered(tbc) == quest


def test_tracker_line_past_the_last_quest(tbc):
    watch_both_quests(tbc)
    hover_line(tbc, 6)
    assert hovered(tbc) is None


def test_hidden_tracker(tbc):
    # Questie's tracker hides Blizzard's.
    watch_both_quests(tbc)
    hover_line(tbc, 1)
    tbc.g.QuestWatchFrame.shown = False
    assert hovered(tbc) is None


def test_tracker_skips_quests_without_objectives(tbc):
    # QuestWatch_Update gives a quest with no objectives no lines at all.
    tbc.run("questLog[2].objectives = 0")
    watch_both_quests(tbc)
    hover_line(tbc, 1)
    assert hovered(tbc) == KNOW_YOUR_ENEMY


@pytest.fixture
def chat_link(addon):
    """A clicked chat link for Fel Orc Scavengers, its tooltip under the cursor."""
    addon.g.ItemRefTooltip = addon.tooltip(mouseOver=True)
    addon.g.questTitles[10482] = "Fel Orc Scavengers"
    log_in(addon)
    addon.run('ItemRefTooltip:SetHyperlink("quest:10482:58")')
    return addon


def test_chat_quest_link(chat_link):
    assert hovered(chat_link) == FEL_ORC


def test_chat_link_not_hovered(addon):
    addon.g.ItemRefTooltip = addon.tooltip(mouseOver=False)
    log_in(addon)
    addon.run('ItemRefTooltip:SetHyperlink("quest:10482:58")')
    assert hovered(addon) is None


def test_chat_link_replaced_by_an_item(chat_link):
    chat_link.run('ItemRefTooltip:SetHyperlink("item:19019")')
    assert hovered(chat_link) is None


@pytest.fixture
def forever(addon):
    """WoW Forever: the mainline quest functions, and none of TBC's quest log or tracker."""
    addon.run("""
        WOW_PROJECT_ID = 18
        GetQuestLogTitle, FauxScrollFrame_GetOffset, QuestLogListScrollFrame = nil, nil, nil
        QuestWatch_Update, QuestWatchFrame = nil, nil
        for i = 1, 30 do _G["QuestWatchLine" .. i] = nil end
        questTitles[10482] = "Fel Orc Scavengers"
        C_QuestLog = { GetTitleForQuestID = function(questID) return questTitles[questID] end }
    """)
    log_in(addon)
    return addon


def test_forever_logs_in_without_tbc_quest_functions(forever):
    assert hovered(forever) is None


def test_forever_quest_list_title(forever):
    forever.run("""
        local button = FakeHoverable({ mouseOver = true, questID = 10482 })
        EventRegistry:TriggerEvent("QuestMapLogTitleButton.OnEnter", button, 10482)
    """)
    assert hovered(forever) == FEL_ORC


def test_forever_tracker_quest(forever):
    forever.run("""
        local block = FakeHoverable({ mouseOver = true, id = 10482 })
        EventRegistry:TriggerEvent("OnQuestBlockHeader.OnEnter", block, 10482, false)
    """)
    assert hovered(forever) == FEL_ORC


def test_forever_leaving_the_tracker(forever):
    forever.run("""
        local block = FakeHoverable({ mouseOver = true, id = 10482 })
        EventRegistry:TriggerEvent("OnQuestBlockHeader.OnEnter", block, 10482, false)
        block.mouseOver = false
    """)
    assert hovered(forever) is None


def test_items_come_before_quests(tbc):
    tbc.g.GameTooltip = tbc.tooltip(legacyLink=THUNDERFURY)
    enter_log_title(tbc, 2)
    assert tbc.run("return ns.GetHovered()") == ("item", 19019, THUNDERFURY)


def test_a_quest_when_no_item_is_hovered(tbc):
    enter_log_title(tbc, 2)
    assert tbc.run("return ns.GetHovered()") == ("quest", 10482, "Fel Orc Scavengers")


def test_nothing_hovered(tbc):
    assert tbc.run("return ns.GetHovered()") is None


def test_entering_a_quest_tells_the_ready_copy(tbc):
    tbc.run("entered = 0; function ns:OnQuestEntered() entered = entered + 1 end")
    enter_log_title(tbc, 2)
    assert tbc.g.entered == 1


def test_the_all_button_is_not_a_quest(tbc):
    # "All" (QuestLogCollapseAllButton) uses the title buttons' template, so it
    # announces itself too, but it's no row: its ID is 0.
    tbc.g.questLogOffset = 2
    enter_log_title(tbc, 0)
    assert hovered(tbc) is None


def test_a_frame_over_the_quest_log_title_hides_it(tbc):
    button = enter_log_title(tbc, 2)
    tbc.run("mouseFocus = FakeHoverable({})")  # a bag open over the quest log
    assert hovered(tbc) is None
    # On a part of the title button itself, it counts.
    tbc.lua.eval("function(b) mouseFocus = FakeHoverable({ parent = b }) end")(button)
    assert hovered(tbc) == FEL_ORC


def test_a_bag_over_the_tracker_hides_it(tbc):
    watch_both_quests(tbc)
    hover_line(tbc, 1)
    tbc.run("mouseFocus = FakeHoverable({})")  # an open bag, which takes the mouse
    assert hovered(tbc) is None
    tbc.run("mouseFocus = WorldFrame")  # nothing takes the mouse there: the line shows through
    assert hovered(tbc) == FEL_ORC


def test_forever_a_bag_over_the_tracker_hides_it(forever):
    forever.run("""
        local block = FakeHoverable({ mouseOver = true, id = 10482 })
        EventRegistry:TriggerEvent("OnQuestBlockHeader.OnEnter", block, 10482, false)
        mouseFocus = FakeHoverable({})
    """)
    assert hovered(forever) is None


def test_not_while_turning_with_the_mouse(tbc):
    # Turning with the mouse freezes the cursor wherever the turn began.
    enter_log_title(tbc, 2)
    tbc.g.mouselooking = True
    assert hovered(tbc) is None


def test_spells_come_after_items_and_before_quests(tbc):
    enter_log_title(tbc, 2)
    tbc.g.GameTooltip = tbc.tooltip(legacySpell=tbc.lua.table_from(["Arcane Shot", 27019]))
    assert tbc.run("return ns.GetHovered()") == ("spell", 27019, "Arcane Shot")
    tbc.g.GameTooltip = tbc.tooltip(legacyLink=THUNDERFURY, legacySpell=tbc.lua.table_from(["Arcane Shot", 27019]))
    assert tbc.run("return ns.GetHovered()") == ("item", 19019, THUNDERFURY)


def test_chat_link_name_from_the_tooltip(addon):
    # The client hasn't cached the quest; the tooltip's first line still names it.
    addon.g.ItemRefTooltip = addon.tooltip(mouseOver=True)
    log_in(addon)
    addon.run('ItemRefTooltipTextLeft1:SetText("Fel Orc Scavengers"); ItemRefTooltip:SetHyperlink("quest:10482:58")')
    assert hovered(addon) == FEL_ORC


def test_closing_the_chat_link_tooltip_forgets_it(chat_link):
    chat_link.run_hook(chat_link.g.ItemRefTooltip, "OnHide")
    assert hovered(chat_link) is None


FEL_ORC_LINK = "|cffffff00|Hquest:10482:58|h[Fel Orc Scavengers]|h|r"
QUESTIE_LINK = "questie:10482:Player-4904-0ABC1234"
QUESTIE_TEXT = "|Hquestie:10482:Player-4904-0ABC1234|h|cff40c040[|r|cffffff00[58] Fel Orc Scavengers|r|cff40c040]|r|h"


def test_hovered_chat_quest_link(addon):
    log_in(addon)
    addon.run(f'EnterChatLink(ChatFrame1, "quest:10482:58", "{FEL_ORC_LINK}")')
    assert hovered(addon) == FEL_ORC


def test_hovered_questie_chat_link_is_named_by_questie(addon):
    addon.run('LibQuestieDB = { Quest = { Get = function(id, key) if id == 10482 and key == "name" then return "Fel Orc Scavengers" end end } }')
    log_in(addon)
    addon.run(f'EnterChatLink(ChatFrame3, "{QUESTIE_LINK}", "{QUESTIE_TEXT}")')
    assert hovered(addon) == FEL_ORC


def test_leaving_a_chat_link_forgets_it(addon):
    log_in(addon)
    addon.run(f'EnterChatLink(ChatFrame1, "quest:10482:58", "{FEL_ORC_LINK}"); LeaveChatLink(ChatFrame1)')
    assert hovered(addon) is None


def test_hovered_chat_link_counts_only_under_the_cursor(addon):
    log_in(addon)
    addon.run(f'EnterChatLink(ChatFrame1, "quest:10482:58", "{FEL_ORC_LINK}"); ChatFrame1.mouseOver = false')
    assert hovered(addon) is None


def test_hovered_chat_item_link_is_no_quest(addon):
    log_in(addon)
    addon.run(f'EnterChatLink(ChatFrame1, "quest:10482:58", "{FEL_ORC_LINK}")')
    addon.run('EnterChatLink(ChatFrame1, "item:19019", "[Thunderfury]")')
    assert hovered(addon) is None


def test_clicked_questie_link_while_questie_shows_the_tooltip(addon):
    # Questie replaces ItemRefTooltip.SetHyperlink after login and doesn't call
    # what it replaced for quests it knows; the click is still seen.
    addon.g.ItemRefTooltip = addon.tooltip(mouseOver=True)
    addon.g.questTitles[10482] = "Fel Orc Scavengers"
    log_in(addon)
    addon.run('function ItemRefTooltip:SetHyperlink(link) self.questieShown = link end')
    addon.run(f'SetItemRef("{QUESTIE_LINK}", "{QUESTIE_TEXT}", "LeftButton", ChatFrame1)')
    assert hovered(addon) == FEL_ORC
