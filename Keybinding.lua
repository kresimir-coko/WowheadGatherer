local _, ns = ...

-- The lookup's binding action (see Bindings.xml) and the key offered for it.
ns.BINDING = "WOWHEADGATHERER_LOOKUP"
ns.DEFAULT_KEY = "CTRL-C"

-- Names shown in Options > Keybindings. Bindings.xml files the action under
-- the category named by BINDING_HEADER_WOWHEADGATHERER.
BINDING_HEADER_WOWHEADGATHERER = "Wowhead Gatherer"
BINDING_NAME_WOWHEADGATHERER_LOOKUP = "Look up hovered item or quest"

-- Run by the binding in Bindings.xml, which can only reach globals.
function WowheadGatherer_OnBinding()
    ns:LookupHovered()
end

-- Binds DEFAULT_KEY to the lookup the first time the add-on meets this binding
-- set (account-wide, or this character's own), so a key the player clears or
-- changes later is never put back. Returns "bound", or "taken" plus the
-- action already on DEFAULT_KEY, or nil when nothing needed doing.
function ns:OfferDefaultKey()
    local bindingSet = GetCurrentBindingSet()
    local store = bindingSet == Enum.BindingSet.Character and self.charDB or self.db
    if store.defaultKeyOffered then
        return nil
    end
    store.defaultKeyOffered = true

    if GetBindingKey(ns.BINDING) then
        return nil
    end
    local action = GetBindingAction(ns.DEFAULT_KEY)
    if action and action ~= "" then
        return "taken", action
    end
    SetBinding(ns.DEFAULT_KEY, ns.BINDING)
    SaveBindings(bindingSet)
    return "bound"
end

-- The lookup key as the game writes it, e.g. "Ctrl-C", or nil when unbound.
function ns.GetLookupKeyText()
    local key = GetBindingKey(ns.BINDING)
    return key and GetBindingText(key)
end
