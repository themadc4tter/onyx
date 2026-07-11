import { getAbilityDefinition, type AbilityId } from "@onyx/shared/abilities";
import { getItemDefinition } from "@onyx/shared/items";
import { EQUIPMENT_SLOTS, type EquipmentSlot, type EquipmentState } from "../../game/equipment";
import type { TooltipManager } from "../tooltips/TooltipManager";
import {
  buildAbilityTooltip,
  buildItemTooltip,
} from "../tooltips/tooltipBuilders";

export type CharacterTabId = "equipment" | "abilities";

interface CharacterPanelOptions {
  selectedTab: CharacterTabId;
  equipment: EquipmentState;
  selectedEquipmentSlot: EquipmentSlot | null;
  tooltip: TooltipManager;
  onSelectTab: (tabId: CharacterTabId) => void;
  onSelectEquipmentSlot: (equipmentSlot: EquipmentSlot) => void;
  onUnequipSlot: (equipmentSlot: EquipmentSlot) => void;
}

const CHARACTER_TABS: Array<{ id: CharacterTabId; label: string }> = [
  { id: "equipment", label: "Equipment" },
  { id: "abilities", label: "Abilities" },
];

const UNLOCKED_ABILITY_IDS: AbilityId[] = ["whirlwind"];

export function createCharacterPanel(options: CharacterPanelOptions) {
  const panel = document.createElement("div");
  panel.className = "character-panel";

  const tabs = document.createElement("div");
  tabs.className = "character-tabs";
  for (const tab of CHARACTER_TABS) {
    const button = document.createElement("button");
    button.className = `character-tab${tab.id === options.selectedTab ? " active" : ""}`;
    button.type = "button";
    button.textContent = tab.label;
    button.setAttribute("aria-pressed", String(tab.id === options.selectedTab));
    button.addEventListener("click", () => options.onSelectTab(tab.id));
    tabs.appendChild(button);
  }

  const body = document.createElement("div");
  body.className = "character-tab-body";
  if (options.selectedTab === "equipment") body.appendChild(createEquipmentPanel(options));
  if (options.selectedTab === "abilities") body.appendChild(createAbilitiesPanel(options.tooltip));

  panel.append(tabs, body);
  return panel;
}

function createAbilitiesPanel(tooltip: TooltipManager) {
  const panel = document.createElement("div");
  panel.className = "abilities-panel";

  const list = document.createElement("div");
  list.className = "abilities-list";

  for (const ability of getUnlockedAbilities()) {
    const entry = document.createElement("div");
    entry.className = "ability-entry";

    const iconButton = document.createElement("button");
    iconButton.className = "ability-spell-icon";
    iconButton.type = "button";
    iconButton.setAttribute("aria-label", ability.name);
    tooltip.attach(iconButton, () => buildAbilityTooltip(ability));

    const icon = document.createElement("img");
    icon.src = ability.iconUrl;
    icon.alt = "";
    iconButton.appendChild(icon);

    const name = document.createElement("strong");
    name.className = "ability-spell-name";
    name.textContent = ability.name;

    entry.append(iconButton, name);
    list.appendChild(entry);
  }

  panel.appendChild(list);
  return panel;
}

function getUnlockedAbilities() {
  return UNLOCKED_ABILITY_IDS
    .map(abilityId => getAbilityDefinition(abilityId))
    .filter((ability): ability is NonNullable<ReturnType<typeof getAbilityDefinition>> => ability !== null);
}

function createEquipmentPanel(options: CharacterPanelOptions) {
  const panel = document.createElement("div");
  const equippedSlots = Object.values(options.equipment.slots).filter(Boolean).length;
  panel.innerHTML = `
    <div class="equipment-header">
      <span>${equippedSlots} / ${EQUIPMENT_SLOTS.length} equipped</span>
      <div class="equipment-actions">
        <button class="inventory-action-button unequip" type="button">Unequip</button>
      </div>
    </div>
  `;

  const unequipButton = panel.querySelector<HTMLButtonElement>(".inventory-action-button.unequip")!;
  unequipButton.disabled = !getSelectedEquipmentItem(options);
  unequipButton.addEventListener("click", () => {
    if (options.selectedEquipmentSlot !== null) options.onUnequipSlot(options.selectedEquipmentSlot);
  });

  const layout = document.createElement("div");
  layout.className = "equipment-layout";

  const slots = document.createElement("div");
  slots.className = "equipment-grid";
  for (const equipmentSlot of EQUIPMENT_SLOTS) {
    slots.appendChild(createEquipmentSlot(options, equipmentSlot));
  }

  const stats = document.createElement("aside");
  stats.className = "equipment-stats";
  stats.appendChild(createEquipmentStatsPanel(options.equipment));

  layout.append(slots, stats);
  panel.appendChild(layout);
  return panel;
}

function createEquipmentSlot(options: CharacterPanelOptions, equipmentSlot: EquipmentSlot) {
  const equippedItem = options.equipment.slots[equipmentSlot];
  const item = equippedItem ? getItemDefinition(equippedItem.itemId) : null;
  const frame = document.createElement("div");
  frame.className = "equipment-slot-frame";

  const label = document.createElement("span");
  label.className = "equipment-slot-label";
  label.textContent = formatEquipmentSlot(equipmentSlot);
  frame.appendChild(label);

  const slot = document.createElement("div");
  slot.className = [
    "equipment-slot",
    item ? "filled" : "",
    item ? "" : "empty",
    item?.rarity ?? "",
    options.selectedEquipmentSlot === equipmentSlot ? "selected" : "",
  ].filter(Boolean).join(" ");
  if (item) {
    options.tooltip.attach(slot, () => buildItemTooltip(item, { context: "equipment" }));
  }
  slot.addEventListener("click", () => options.onSelectEquipmentSlot(equipmentSlot));
  slot.addEventListener("dblclick", () => options.onUnequipSlot(equipmentSlot));

  const main = document.createElement("div");
  main.className = "equipment-slot-main";

  if (item) {
    const icon = document.createElement("img");
    icon.className = "equipment-item-icon";
    icon.src = item.iconUrl;
    icon.alt = item.name;
    main.appendChild(icon);
  }

  const text = document.createElement("div");
  text.className = "equipment-slot-text";

  const itemName = document.createElement("strong");
  itemName.className = item ? "slot-item" : "slot-item equipment-slot-empty";
  itemName.textContent = item?.name ?? "Empty";
  text.appendChild(itemName);

  const statSummary = item?.equipment?.stats ? formatStatSummary(item.equipment.stats) : "";
  if (statSummary) {
    const statLine = document.createElement("span");
    statLine.className = "equipment-stat-line";
    statLine.textContent = statSummary;
    text.appendChild(statLine);
  }

  main.appendChild(text);
  slot.appendChild(main);
  frame.appendChild(slot);

  return frame;
}

function getSelectedEquipmentItem(options: CharacterPanelOptions) {
  if (options.selectedEquipmentSlot === null) return null;
  return options.equipment.slots[options.selectedEquipmentSlot] ?? null;
}

function createEquipmentStatsPanel(equipment: EquipmentState) {
  const container = document.createElement("div");
  const title = document.createElement("div");
  title.className = "detail-title";
  title.textContent = "Character";
  container.appendChild(title);

  const statList = document.createElement("div");
  statList.className = "stat-list";
  const totals = getEquipmentStatTotals(equipment);
  const statEntries = Object.entries(totals);

  if (statEntries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "stat-row";
    empty.innerHTML = `<span class="stat-label">Equipment bonuses</span><strong class="stat-value">None</strong>`;
    statList.appendChild(empty);
  } else {
    for (const [stat, value] of statEntries) {
      const row = document.createElement("div");
      row.className = "stat-row";
      row.innerHTML = `<span class="stat-label">${formatStatName(stat)}</span><strong class="stat-value">+${value}</strong>`;
      statList.appendChild(row);
    }
  }

  container.appendChild(statList);
  return container;
}

function getEquipmentStatTotals(equipment: EquipmentState) {
  const totals: Record<string, number> = {};
  for (const equippedItem of Object.values(equipment.slots)) {
    const item = equippedItem ? getItemDefinition(equippedItem.itemId) : null;
    if (!item?.equipment?.stats) continue;

    for (const [stat, value] of Object.entries(item.equipment.stats)) {
      if (typeof value !== "number" || value === 0) continue;
      totals[stat] = (totals[stat] ?? 0) + value;
    }
  }

  return totals;
}

function formatStatSummary(stats: object) {
  return Object.entries(stats as Record<string, number | undefined>)
    .filter((entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] !== 0)
    .map(([stat, value]) => `+${value} ${formatStatName(stat)}`)
    .join(", ");
}

function formatEquipmentSlot(slot: EquipmentSlot) {
  const labels: Record<EquipmentSlot, string> = {
    head: "Head",
    chest: "Chest",
    legs: "Legs",
    feet: "Boots",
    main_hand: "Main Hand",
    off_hand: "Off Hand",
    ring: "Ring",
    charm: "Charm",
  };
  return labels[slot];
}

function formatStatName(stat: string) {
  return stat
    .split("_")
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
