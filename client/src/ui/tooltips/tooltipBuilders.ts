import type {
  AbilityDefinition,
  AbilityEffectDefinition,
  AbilityRequirement,
  AbilityTargetingDefinition,
} from "@onyx/shared/abilities";
import type {
  EquipmentSlot,
  EquipmentStats,
  ItemDefinition,
  ItemRarity,
  ItemType,
  WeaponClass,
  WeaponType,
} from "@onyx/shared/items";
import type { SkillPerkDefinition } from "@onyx/shared/skills";
import type { TooltipContent, TooltipRow } from "./TooltipManager";

interface ItemTooltipOptions {
  quantity?: number;
  context?: "inventory" | "equipment" | "trade";
}

interface AbilityTooltipOptions {
  slotNumber?: number;
}

interface PerkTooltipOptions {
  status: string;
  unlocked: boolean;
  blocked: boolean;
  requirementsMet: boolean;
  hasPoints: boolean;
  neededUniversalPoints: number;
}

const RARITY_LABELS: Record<ItemRarity, string> = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  epic: "Epic",
};

const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  material: "Material",
  consumable: "Consumable",
  equipment: "Equipment",
  quest: "Quest Item",
};

const WEAPON_CLASS_LABELS: Record<WeaponClass, string> = {
  melee: "Melee",
  ranged: "Ranged",
  magic: "Magic",
};

const WEAPON_TYPE_LABELS: Record<WeaponType, string> = {
  sword: "Sword",
  bow: "Bow",
  staff: "Staff",
};

const EQUIPMENT_SLOT_LABELS: Record<EquipmentSlot, string> = {
  head: "Head",
  chest: "Chest",
  legs: "Legs",
  feet: "Boots",
  main_hand: "Main Hand",
  off_hand: "Off Hand",
  ring: "Ring",
  charm: "Charm",
};

export function buildItemTooltip(item: ItemDefinition, options: ItemTooltipOptions = {}): TooltipContent {
  const detailRows: TooltipRow[] = [
    { kind: "stat", label: "Type", value: ITEM_TYPE_LABELS[item.type] },
  ];

  if (item.maxStack > 1) {
    detailRows.push({ kind: "stat", label: "Stack", value: formatStackText(item, options.quantity) });
  }

  if (options.context === "equipment") {
    detailRows.unshift({ kind: "text", text: "Currently equipped", tone: "good" });
  }

  const sections = [{ rows: detailRows }];

  if (item.equipment) {
    const equipmentRows: TooltipRow[] = [
      { kind: "stat", label: "Slot", value: EQUIPMENT_SLOT_LABELS[item.equipment.slot] },
    ];

    if (item.equipment.slot === "main_hand") {
      equipmentRows.push(
        { kind: "stat", label: "Weapon", value: `${WEAPON_CLASS_LABELS[item.equipment.weaponClass]} ${WEAPON_TYPE_LABELS[item.equipment.weaponType]}` },
        { kind: "stat", label: "Speed", value: `${item.equipment.attackSpeed.toFixed(1)}s` },
        { kind: "stat", label: "Hands", value: item.equipment.twoHanded ? "Two-handed" : "One-handed" },
      );

      if (typeof item.equipment.attackRange === "number") {
        equipmentRows.push({ kind: "stat", label: "Range", value: `${item.equipment.attackRange} tiles` });
      }
    }

    sections.push({ rows: equipmentRows });

    const stats = buildEquipmentStatRows(item.equipment.stats);
    if (stats.length > 0) sections.push({ rows: stats });
  }

  return {
    title: item.name,
    subtitle: RARITY_LABELS[item.rarity],
    iconUrl: item.iconUrl,
    tone: item.rarity,
    description: item.description,
    sections,
  };
}

export function buildAbilityTooltip(ability: AbilityDefinition, options: AbilityTooltipOptions = {}): TooltipContent {
  const detailRows: TooltipRow[] = [
    { kind: "stat", label: "Cooldown", value: formatDuration(ability.cooldownMs) },
    { kind: "stat", label: "Target", value: formatAbilityTargeting(ability.targeting) },
  ];

  const effectRows = ability.effects.map<TooltipRow>(effect => ({
    kind: "text",
    text: formatAbilityEffect(effect),
    tone: "good",
  }));

  const requirementRows = ability.requirements.map<TooltipRow>(requirement => ({
    kind: "text",
    text: formatAbilityRequirement(requirement),
    tone: "warning",
  }));

  return {
    title: ability.name,
    subtitle: options.slotNumber ? `Ability slot ${options.slotNumber}` : "Ability",
    iconUrl: ability.iconUrl,
    tone: "ability",
    description: ability.description,
    sections: [
      { rows: detailRows },
      ...(effectRows.length > 0 ? [{ rows: effectRows }] : []),
      ...(requirementRows.length > 0 ? [{ rows: requirementRows }] : []),
    ],
  };
}

export function buildPerkTooltip(perk: SkillPerkDefinition, options: PerkTooltipOptions): TooltipContent {
  const statusTone = options.unlocked
    ? "good"
    : options.blocked || !options.requirementsMet || !options.hasPoints
      ? "warning"
      : "normal";
  const rows: TooltipRow[] = [
    { kind: "stat", label: "Status", value: options.status, tone: statusTone },
    { kind: "stat", label: "Cost", value: `${perk.cost} point${perk.cost === 1 ? "" : "s"}` },
    { kind: "stat", label: "Requires", value: perk.requirementText },
  ];

  if (perk.plannedRequirementText) {
    rows.push({ kind: "stat", label: "Planned path", value: perk.plannedRequirementText, tone: "muted" });
  }

  if (options.neededUniversalPoints > 0 && !options.unlocked && !options.blocked) {
    rows.push({
      kind: "text",
      text: `Uses ${options.neededUniversalPoints} universal point${options.neededUniversalPoints === 1 ? "" : "s"}.`,
      tone: "warning",
    });
  }

  const implementationRows: TooltipRow[] = [];
  if (perk.implementation.status !== "live") {
    implementationRows.push({ kind: "text", text: "This perk is planned and is not live yet.", tone: "warning" });
  }

  for (const reason of perk.implementation.blockedBy ?? []) {
    implementationRows.push({ kind: "text", text: `Blocked by ${formatLabel(reason)}.`, tone: "bad" });
  }

  return {
    title: perk.name,
    tone: options.blocked ? "warning" : "perk",
    description: perk.effectText,
    sections: [
      { rows },
      ...(implementationRows.length > 0 ? [{ rows: implementationRows }] : []),
    ],
  };
}

function buildEquipmentStatRows(stats: EquipmentStats) {
  return Object.entries(stats)
    .filter((entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] !== 0)
    .map<TooltipRow>(([stat, value]) => ({
      kind: "stat",
      label: formatLabel(stat),
      value: value > 0 ? `+${value}` : String(value),
      tone: value > 0 ? "good" : "bad",
    }));
}

function formatStackText(item: ItemDefinition, quantity?: number) {
  if (typeof quantity === "number" && item.maxStack > 1) return `${quantity} / ${item.maxStack}`;
  return item.maxStack > 1 ? `Up to ${item.maxStack}` : "Unique";
}

function formatAbilityTargeting(targeting: AbilityTargetingDefinition) {
  if (targeting.kind === "self") return "Self";
  if (targeting.kind === "selected_enemy") return `Enemy within ${targeting.rangeTiles} tiles`;
  return `${formatLabel(targeting.shape)} area, ${targeting.radiusTiles} tile radius`;
}

function formatAbilityEffect(effect: AbilityEffectDefinition) {
  if (effect.kind === "damage") {
    const target = effect.target === "selected" ? "selected enemy" : "nearby enemies";
    return `Deals ${effect.amount} ${WEAPON_CLASS_LABELS[effect.damageClass].toLowerCase()} damage to ${target}.`;
  }

  return "Applies an effect.";
}

function formatAbilityRequirement(requirement: AbilityRequirement) {
  if (requirement.kind === "skill_level") {
    return `Requires ${formatLabel(requirement.skillId)} level ${requirement.level}.`;
  }

  if (requirement.kind === "equipped_weapon_class") {
    return `Requires a ${WEAPON_CLASS_LABELS[requirement.weaponClass].toLowerCase()} weapon equipped.`;
  }

  return `Requires a ${WEAPON_TYPE_LABELS[requirement.weaponType].toLowerCase()} equipped.`;
}

function formatDuration(ms: number) {
  if (ms < 1_000) return `${Math.max(0, Math.ceil(ms))}ms`;

  const seconds = ms / 1_000;
  if (seconds < 10 && !Number.isInteger(seconds)) return `${seconds.toFixed(1)}s`;
  return `${Math.ceil(seconds)}s`;
}

function formatLabel(value: string) {
  return value
    .split("_")
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
