import pytest

ITEM, SPELL = 0, 1
THUNDERFURY = "|cffff8000|Hitem:19019::::::::70:::::|h[Thunderfury, Blessed Blade of the Windseeker]|h|r"
HEARTHSTONE = "|cffffffff|Hitem:6948::::::::70:::::|h[Hearthstone]|h|r"


@pytest.fixture
def addon(addon):
    addon.load("Url.lua")
    addon.load("Lookup.lua")
    return addon


def test_reads_item_from_game_tooltip(addon):
    addon.g.GameTooltip = addon.tooltip(dataType=ITEM, dataID=19019, dataLink=THUNDERFURY)
    assert addon.ns.GetHoveredItem() == (19019, THUNDERFURY)


def test_uncached_item_still_gives_its_id(addon):
    addon.g.GameTooltip = addon.tooltip(dataType=ITEM, dataID=19019)
    assert addon.ns.GetHoveredItem() == (19019, None)


def test_spell_tooltip_is_not_an_item(addon):
    addon.g.GameTooltip = addon.tooltip(dataType=SPELL, dataID=133)
    assert addon.ns.GetHoveredItem() is None


def test_hidden_tooltip_is_ignored(addon):
    addon.g.GameTooltip = addon.tooltip(shown=False, dataType=ITEM, dataID=19019, dataLink=THUNDERFURY)
    assert addon.ns.GetHoveredItem() is None


def test_falls_back_to_legacy_get_item(addon):
    addon.g.GameTooltip = addon.tooltip(legacyLink=THUNDERFURY)
    assert addon.ns.GetHoveredItem() == (19019, THUNDERFURY)


def test_nothing_shown(addon):
    assert addon.ns.GetHoveredItem() is None


def test_hovered_chat_link_tooltip_wins(addon):
    addon.g.ItemRefTooltip = addon.tooltip(mouseOver=True, dataType=ITEM, dataID=19019, dataLink=THUNDERFURY)
    addon.g.GameTooltip = addon.tooltip(dataType=ITEM, dataID=6948, dataLink=HEARTHSTONE)
    assert addon.ns.GetHoveredItem() == (19019, THUNDERFURY)


def test_open_chat_link_tooltip_not_hovered_is_ignored(addon):
    # A chat link clicked earlier is still open, but the cursor is on a bag item.
    addon.g.ItemRefTooltip = addon.tooltip(mouseOver=False, dataType=ITEM, dataID=19019, dataLink=THUNDERFURY)
    addon.g.GameTooltip = addon.tooltip(dataType=ITEM, dataID=6948, dataLink=HEARTHSTONE)
    assert addon.ns.GetHoveredItem() == (6948, HEARTHSTONE)


def test_hovered_chat_spell_link_falls_through_to_game_tooltip(addon):
    addon.g.ItemRefTooltip = addon.tooltip(mouseOver=True, dataType=SPELL, dataID=133)
    addon.g.GameTooltip = addon.tooltip(shown=False)
    assert addon.ns.GetHoveredItem() is None


# TBC Anniversary doesn't load TooltipUtil (Blizzard_SharedXMLGame.toc loads it
# only for mainline clients), so there every lookup goes through GetItem().
@pytest.fixture
def tbc(addon):
    addon.g.TooltipUtil = None
    return addon


def test_tbc_tooltip_without_tooltip_util_uses_get_item(tbc):
    # Even a tooltip that has the data methods must not reach for TooltipUtil.
    tbc.g.GameTooltip = tbc.tooltip(dataType=ITEM, dataID=19019, legacyLink=THUNDERFURY)
    assert tbc.ns.GetHoveredItem() == (19019, THUNDERFURY)


def test_tbc_hovered_chat_link_wins(tbc):
    tbc.g.ItemRefTooltip = tbc.tooltip(mouseOver=True, legacyLink=THUNDERFURY)
    tbc.g.GameTooltip = tbc.tooltip(legacyLink=HEARTHSTONE)
    assert tbc.ns.GetHoveredItem() == (19019, THUNDERFURY)


def test_tbc_open_chat_link_not_hovered_is_ignored(tbc):
    tbc.g.ItemRefTooltip = tbc.tooltip(mouseOver=False, legacyLink=THUNDERFURY)
    tbc.g.GameTooltip = tbc.tooltip(legacyLink=HEARTHSTONE)
    assert tbc.ns.GetHoveredItem() == (6948, HEARTHSTONE)


def test_tbc_hidden_tooltip_is_ignored(tbc):
    tbc.g.GameTooltip = tbc.tooltip(shown=False, legacyLink=THUNDERFURY)
    assert tbc.ns.GetHoveredItem() is None


def test_tbc_tooltip_without_an_item_link(tbc):
    tbc.g.GameTooltip = tbc.tooltip(legacyLink="|cff71d5ff|Hspell:133|h[Fireball]|h|r")
    assert tbc.ns.GetHoveredItem() is None


ARCANE_SHOT = (27019, "Arcane Shot")


def test_reads_a_spell_from_tooltip_data(addon):
    # Forever: the spell book's tooltip carries Spell data (Blizzard_SpellBookItem.lua).
    addon.g.spellNames[27019] = "Arcane Shot"
    addon.g.GameTooltip = addon.tooltip(dataType=SPELL, dataID=27019)
    assert addon.ns.GetHoveredSpell() == ARCANE_SHOT


def test_item_tooltip_is_not_a_spell(addon):
    addon.g.GameTooltip = addon.tooltip(dataType=ITEM, dataID=19019, dataLink=THUNDERFURY)
    assert addon.ns.GetHoveredSpell() is None


def test_hidden_spell_tooltip_is_ignored(addon):
    addon.g.GameTooltip = addon.tooltip(shown=False, dataType=SPELL, dataID=27019)
    assert addon.ns.GetHoveredSpell() is None


def test_tbc_reads_a_spell_with_get_spell(tbc):
    tbc.g.GameTooltip = tbc.tooltip(legacySpell=tbc.lua.table_from(["Arcane Shot", 27019]))
    assert tbc.ns.GetHoveredSpell() == ARCANE_SHOT


def test_tbc_reads_an_old_style_spell(tbc):
    # Older clients return name, rank, spellID.
    tbc.g.GameTooltip = tbc.tooltip(legacySpell=tbc.lua.table_from(["Arcane Shot", "Rank 9", 27019]))
    assert tbc.ns.GetHoveredSpell() == ARCANE_SHOT


def test_tbc_hovered_chat_spell_link(tbc):
    tbc.g.ItemRefTooltip = tbc.tooltip(mouseOver=True, legacySpell=tbc.lua.table_from(["Arcane Shot", 27019]))
    tbc.g.GameTooltip = tbc.tooltip(shown=False)
    assert tbc.ns.GetHoveredSpell() == ARCANE_SHOT
