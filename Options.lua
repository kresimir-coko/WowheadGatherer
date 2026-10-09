local addonName, ns = ...

-- Registers a setting bound to ns.db[key].
local function RegisterSetting(category, key, varType, label)
    return Settings.RegisterAddOnSetting(category, addonName .. "_" .. key, key, ns.db,
        varType, label, ns.defaults[key])
end

local function AddCheckbox(category, key, label, tooltip)
    Settings.CreateCheckbox(category, RegisterSetting(category, key, Settings.VarType.Boolean, label), tooltip)
end

local function GetLanguageOptions()
    local container = Settings.CreateControlTextContainer()
    container:Add("client", "Same as the game")
    container:Add("english", "Always English")
    return container:GetData()
end

-- Blizzard's own key binding row, so the key is picked the same way as on the
-- Keybindings page. The settings window saves bindings when it closes.
local function AddKeybindingRow(layout)
    local bindingIndex = C_KeyBindings.GetBindingIndex(ns.BINDING)
    if not bindingIndex then
        return
    end
    local initializer = CreateKeybindingEntryInitializer(bindingIndex, true)
    initializer:AddSearchTags(BINDING_NAME_WOWHEADGATHERER_LOOKUP)
    layout:AddInitializer(initializer)
end

function ns:InitializeOptions()
    local category, layout = Settings.RegisterVerticalLayoutCategory(self.title)

    layout:AddInitializer(CreateSettingsListSectionHeaderInitializer("Lookup",
        "Hover over any item, in your bags, on your character, at a vendor, in loot or in a chat link, and press the key to get its Wowhead link."))
    AddCheckbox(category, "enabled", "Enabled",
        "Let the lookup key show Wowhead links. When off, the key only says that it's off.")
    AddKeybindingRow(layout)

    layout:AddInitializer(CreateSettingsListSectionHeaderInitializer("Link"))
    Settings.CreateDropdown(category, RegisterSetting(category, "language", Settings.VarType.String, "Wowhead language"),
        GetLanguageOptions, "The language Wowhead pages open in. Same as the game uses your game client's language.")
    AddCheckbox(category, "closeOnCopy", "Close after copying",
        "Close the link popup as soon as you copy the link.")

    Settings.RegisterAddOnCategory(category)
    self.optionsCategory = category
end

function ns:OpenOptions()
    Settings.OpenToCategory(self.optionsCategory:GetID())
end
