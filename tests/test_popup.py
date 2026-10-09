import pytest

URL = "https://www.wowhead.com/tbc/item=19019"
THUNDERFURY = "|cffff8000|Hitem:19019::::::::70:::::|h[Thunderfury, Blessed Blade of the Windseeker]|h|r"


@pytest.fixture
def watcher(addon):
    addon.load("Popup.lua")
    return addon.ns.CreateCopyWatcher()


def test_ctrl_c_copies(watcher):
    watcher.KeyDown("C", True)
    assert watcher.KeyUp("C") is True


def test_key_up_of_the_opening_key_is_not_a_copy(watcher):
    # The lookup key (Ctrl+C) went down before the box had focus; only its key-up arrives.
    assert watcher.KeyUp("C") is False


def test_plain_c_is_not_a_copy(watcher):
    watcher.KeyDown("C", False)
    assert watcher.KeyUp("C") is False


def test_modifier_presses_keep_the_copy(watcher):
    watcher.KeyDown("LCTRL", True)
    watcher.KeyDown("C", True)
    watcher.KeyDown("RSHIFT", True)
    assert watcher.KeyUp("C") is True


def test_other_key_cancels_the_copy(watcher):
    watcher.KeyDown("C", True)
    watcher.KeyDown("A", True)
    assert watcher.KeyUp("C") is False


def test_copy_counts_once(watcher):
    watcher.KeyDown("C", True)
    watcher.KeyUp("C")
    assert watcher.KeyUp("C") is False


def test_reset_disarms(watcher):
    watcher.KeyDown("C", True)
    watcher.Reset()
    assert watcher.KeyUp("C") is False


def test_releasing_ctrl_first_still_copies(watcher):
    watcher.KeyDown("C", True)
    assert watcher.KeyUp("LCTRL") is False
    assert watcher.KeyUp("C") is True


@pytest.fixture
def popup(addon):
    addon.load("Keybinding.lua")
    addon.load("Popup.lua")
    addon.ns.db = addon.lua.table_from({"closeOnCopy": True})
    addon.run("function ns.Flash(text) table.insert(flashes, text) end")
    addon.run(f'ns:ShowCopyPopup("{URL}", 19019, "{THUNDERFURY}")')
    return addon.g.WowheadGathererPopup


def press(addon, popup, key, ctrl=False):
    addon.g.ctrlDown = ctrl
    popup.box.scripts.OnKeyDown(popup.box, key)


def release(addon, popup, key):
    popup.box.scripts.OnKeyUp(popup.box, key)


def test_popup_shows_the_address(popup):
    assert popup.shown is True
    assert popup.box.GetText(popup.box) == URL
    assert popup.name.GetText(popup.name) == THUNDERFURY


def test_escape_closes_with_escape_list(addon, popup):
    assert "WowheadGathererPopup" in addon.values("UISpecialFrames")


def test_typing_puts_the_address_back(popup):
    popup.box.SetText(popup.box, "oops")
    popup.box.scripts.OnTextChanged(popup.box, True)
    assert popup.box.GetText(popup.box) == URL


def test_copy_closes_and_confirms(addon, popup):
    press(addon, popup, "C", ctrl=True)
    release(addon, popup, "C")
    assert popup.shown is False
    assert addon.values("flashes") == ["Wowhead link copied."]


def test_opening_key_release_keeps_it_open(addon, popup):
    # Ctrl+C opened the popup; the box only sees that key's release.
    release(addon, popup, "C")
    assert popup.shown is True
    assert addon.values("flashes") == []


def test_copy_can_leave_it_open(addon, popup):
    addon.ns.db.closeOnCopy = False
    press(addon, popup, "C", ctrl=True)
    release(addon, popup, "C")
    assert popup.shown is True
    assert addon.values("flashes") == ["Wowhead link copied."]


def test_mac_cmd_c_copies(addon, popup):
    addon.g.metaDown = True
    press(addon, popup, "C")
    release(addon, popup, "C")
    assert popup.shown is False


def test_showing_again_swaps_the_item(addon, popup):
    other = "https://www.wowhead.com/tbc/item=6948"
    addon.run(f'ns:ShowCopyPopup("{other}", 6948, nil)')
    assert len(addon.values("UISpecialFrames")) == 1  # the same popup, not a second one
    assert popup.box.GetText(popup.box) == other


def test_name_and_box_keep_to_their_rows(addon, popup):
    # A second anchor on the frame's RIGHT (its vertical middle) would pull the
    # name or the box down to the middle of the popup, over each other.
    assert addon.run("""
        local frame = WowheadGathererPopup
        for _, region in ipairs({ frame.name, frame.box }) do
            for _, point in ipairs(region.points) do
                if point[2] == frame and point[3] == "RIGHT" then return false end
            end
        end
        return true
    """) is True


@pytest.fixture
def lookups(addon, popup):
    """The lookup key is Ctrl+C. Counts lookups; `hovered` is the item under the cursor."""
    addon.g.bindings["CTRL-C"] = "WOWHEADGATHERER_LOOKUP"
    addon.run("""
        lookups = 0
        hovered = 6948
        function ns.GetHoveredItem() return hovered end
        function ns:LookupHoveredItem() lookups = lookups + 1 end
    """)
    return addon


def test_lookup_key_over_another_item_looks_it_up(lookups, popup):
    # Key bindings don't fire while the box has focus, so the box passes the key on.
    press(lookups, popup, "C", ctrl=True)
    release(lookups, popup, "C")
    assert lookups.g.lookups == 1
    assert lookups.values("flashes") == []


def test_lookup_key_over_the_same_item_copies(lookups, popup):
    lookups.g.hovered = 19019
    press(lookups, popup, "C", ctrl=True)
    release(lookups, popup, "C")
    assert lookups.g.lookups == 0
    assert lookups.values("flashes") == ["Wowhead link copied."]


def test_lookup_key_over_nothing_copies(lookups, popup):
    lookups.g.hovered = None
    press(lookups, popup, "C", ctrl=True)
    release(lookups, popup, "C")
    assert lookups.g.lookups == 0
    assert lookups.values("flashes") == ["Wowhead link copied."]
