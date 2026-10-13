import pytest

# A fake LibQuestieDB (QuestieDB's public library) with part of Karazhan's attunement.
QUESTIE = """
questieQuests = {
    [9824] = { name = "Arcane Disturbances" },
    [9825] = { name = "Restless Activity", preQuestSingle = { 9824 } },
    [9826] = { name = "Contact from Dalaran", preQuestSingle = { 9825 } },
    [9829] = { name = "Khadgar", preQuestSingle = { 9826 } },
    [9831] = { name = "Entry Into Karazhan", preQuestGroup = { 9826, 9829 } },
    [9836] = { name = "The Master's Touch", preQuestSingle = { 9831 }, nextQuestInChain = 9837 },
    [9837] = { name = "Return to Khadgar", preQuestSingle = { 9836 }, nextQuestInChain = 9838 },
    [9838] = { name = "The Violet Eye", preQuestSingle = { 9837 } },
}
LibQuestieDB = { Quest = { Get = function(id, key) local q = questieQuests[id]; return q and q[key] end } }
"""


@pytest.fixture
def addon(addon):
    addon.run(QUESTIE)
    addon.load_all()
    addon.fire("ADDON_LOADED", "WowheadGatherer")
    return addon


def chain(addon, quest_id):
    result = addon.run(f"return ns.QuestChain({quest_id})")
    return None if result is None else list(result.values())


def test_chain_lists_earlier_quests_first_then_later(addon):
    # Each quest comes after the ones it needs; then nextQuestInChain onward.
    assert chain(addon, 9836) == [9824, 9825, 9826, 9829, 9831, 9836, 9837, 9838]


def test_chain_survives_cycles_and_odd_values(addon):
    addon.run("""
        questieQuests[9824].preQuestSingle = { 9826, -5, "x", 0 }
        questieQuests[9838].nextQuestInChain = 9836
        questieQuests[9825].preQuestGroup = "not a table"
    """)
    result = chain(addon, 9836)
    assert len(result) == len(set(result))
    assert result[-3:] == [9836, 9837, 9838]


def test_chain_keeps_the_nearest_25_each_way(addon):
    addon.run("""
        questieQuests = {}
        for id = 1, 61 do
            questieQuests[id] = { name = "Q" .. id, preQuestSingle = id > 1 and { id - 1 } or nil,
                                  nextQuestInChain = id < 61 and id + 1 or nil }
        end
    """)
    assert chain(addon, 31) == list(range(6, 57))


def test_no_chain_without_questie(addon):
    addon.run("LibQuestieDB = nil")
    assert chain(addon, 9836) is None


def test_no_chain_for_a_lone_quest(addon):
    addon.run('questieQuests[1] = { name = "Alone" }')
    assert chain(addon, 1) is None


def test_questie_error_means_no_chain(addon):
    addon.run('LibQuestieDB.Quest.Get = function() error("broken") end')
    assert chain(addon, 9836) is None


def test_fragment_encodes_the_names(addon):
    addon.run('questieQuests[9825].name = "Plünderer der Höllenorcs"; questieQuests[9825].nextQuestInChain = nil')
    fragment = addon.run("return ns.QuestChainFragment(9825)")
    assert fragment == "#chain=9824~Arcane%20Disturbances.9825~Pl%C3%BCnderer%20der%20H%C3%B6llenorcs"


def test_quest_links_carry_their_chain_and_items_do_not(addon):
    assert addon.run('return ns:LookupURL("quest", 9837)') == (
        "https://www.wowhead.com/tbc/quest=9837#chain=9824~Arcane%20Disturbances.9825~Restless%20Activity"
        ".9826~Contact%20from%20Dalaran.9829~Khadgar.9831~Entry%20Into%20Karazhan"
        ".9836~The%20Master%27s%20Touch.9837~Return%20to%20Khadgar.9838~The%20Violet%20Eye")
    assert addon.run('return ns:LookupURL("item", 19019)') == "https://www.wowhead.com/tbc/item=19019"
