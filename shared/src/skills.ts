export const MAX_SKILL_LEVEL = 100;
export const OSRS_REFERENCE_MAX_LEVEL = 90;

export type SkillCategory = "combat" | "gathering" | "crafting";

export type SkillId =
  | "melee"
  | "ranged"
  | "magic"
  | "mining"
  | "smithing"
  | "herbalism"
  | "alchemy"
  | "cooking"
  | "fishing";

export interface SkillDefinition {
  id: SkillId;
  name: string;
  category: SkillCategory;
}

export type ReagentFamily = "herb" | "mushroom" | "bloomheart" | "seaweed";
export type ReagentRarity = "Common" | "Uncommon" | "Rare";
export type SkillPerkImplementationStatus =
  | "live"
  | "definition_only"
  | "blocked_by_missing_system"
  | "hidden";

export interface SkillUnlockDefinition {
  id: string;
  itemId: string;
  level: number;
  name: string;
  family: ReagentFamily;
  nodeType: string;
  rarity: ReagentRarity;
  location: string;
  xp: number;
  alchemyRole: string;
  baseYield: number;
  stackSize: number;
}

export interface SkillSpecializationPathDefinition {
  id: string;
  skillId: SkillId;
  name: string;
  summary: string;
}

export type SkillPerkRequirement =
  | { type: "perk"; perkId: string }
  | { type: "any_perk"; perkIds: string[] }
  | { type: "skill_level"; level: number };

export type SkillPerkEffect =
  | {
      type: "double_yield_chance";
      target: ReagentFamily;
      chance: number;
    }
  | {
      type: "drop_chance_bonus";
      target: ReagentFamily;
      chance: number;
    }
  | {
      type: "unlock_action";
      actionId: string;
    }
  | {
      type: "reveal_nearest_node";
      target: ReagentFamily;
    }
  | {
      type: "prospect_reagent";
      target: ReagentFamily;
      chance: number;
    };

export interface SkillPerkImplementation {
  status: SkillPerkImplementationStatus;
  unlockable: boolean;
  visible: boolean;
  blockedBy?: string[];
}

export interface SkillPerkDefinition {
  id: string;
  code: string;
  skillId: SkillId;
  pathId: string;
  name: string;
  effectText: string;
  requirementText: string;
  cost: number;
  requires: SkillPerkRequirement[];
  plannedRequirementText?: string;
  plannedRequires?: SkillPerkRequirement[];
  effects: SkillPerkEffect[];
  implementation: SkillPerkImplementation;
}

export interface SkillContentDefinition {
  skillId: SkillId;
  nextUnlock: string;
  overview: {
    role: string;
    gathering: string;
    progression: string;
  };
  unlocks: SkillUnlockDefinition[];
  specializationPaths: SkillSpecializationPathDefinition[];
  perks: SkillPerkDefinition[];
}

export interface SkillLevelRequirement {
  level: number;
  totalXp: number;
  xpFromPreviousLevel: number;
}

export interface SkillProgress {
  level: number;
  totalXp: number;
  currentLevelXp: number;
  nextLevelXp: number | null;
  xpIntoLevel: number;
  xpForNextLevel: number;
  percentToNextLevel: number;
  isMaxLevel: boolean;
}

export const SKILL_DEFINITIONS: SkillDefinition[] = [
  { id: "melee", name: "Melee", category: "combat" },
  { id: "ranged", name: "Ranged", category: "combat" },
  { id: "magic", name: "Magic", category: "combat" },
  { id: "mining", name: "Mining", category: "gathering" },
  { id: "smithing", name: "Smithing", category: "crafting" },
  { id: "herbalism", name: "Herbalism", category: "gathering" },
  { id: "alchemy", name: "Alchemy", category: "crafting" },
  { id: "cooking", name: "Cooking", category: "crafting" },
  { id: "fishing", name: "Fishing", category: "gathering" },
];

export const SKILL_PERK_POINT_LEVELS = [10, 20, 30, 40, 50, 60, 70, 80, 90] as const;

export const HERBALISM_UNLOCKS: SkillUnlockDefinition[] = [
  {
    id: "herbalism.unlock.moonleaf",
    itemId: "moonleaf",
    level: 1,
    name: "Moonleaf",
    family: "herb",
    nodeType: "Herb",
    rarity: "Common",
    location: "safe meadows near settlement",
    xp: 8,
    alchemyRole: "basic healing, weak restoration elixirs",
    baseYield: 1,
    stackSize: 20,
  },
  {
    id: "herbalism.unlock.sunspindle",
    itemId: "sunspindle",
    level: 5,
    name: "Sunspindle",
    family: "herb",
    nodeType: "Herb",
    rarity: "Common",
    location: "roadsides, sunny fields, farm edges",
    xp: 11,
    alchemyRole: "stamina, movement, light resistance",
    baseYield: 1,
    stackSize: 20,
  },
  {
    id: "herbalism.unlock.briarcap",
    itemId: "briarcap",
    level: 10,
    name: "Briarcap",
    family: "herb",
    nodeType: "Herb",
    rarity: "Common",
    location: "forest edges, thorny groves, denser wild areas",
    xp: 15,
    alchemyRole: "antidotes, bleed/poison mitigation",
    baseYield: 1,
    stackSize: 20,
  },
  {
    id: "herbalism.unlock.gloomcap",
    itemId: "gloomcap",
    level: 18,
    name: "Gloomcap",
    family: "mushroom",
    nodeType: "Mushroom",
    rarity: "Uncommon",
    location: "caves, dungeon side rooms, damp ruins",
    xp: 22,
    alchemyRole: "darkness vision, fear/magic resistance",
    baseYield: 1,
    stackSize: 20,
  },
  {
    id: "herbalism.unlock.emberroot",
    itemId: "emberroot",
    level: 20,
    name: "Emberroot",
    family: "herb",
    nodeType: "Herb",
    rarity: "Uncommon",
    location: "warm rocky slopes, dangerous meadow edges",
    xp: 26,
    alchemyRole: "fire resistance, burst damage elixirs",
    baseYield: 1,
    stackSize: 20,
  },
  {
    id: "herbalism.unlock.silverthorn",
    itemId: "silverthorn",
    level: 25,
    name: "Silverthorn",
    family: "herb",
    nodeType: "Herb",
    rarity: "Rare",
    location: "rare overworld nodes in risky outer zones",
    xp: 32,
    alchemyRole: "stronger healing, protection, Bloomheart synergy",
    baseYield: 1,
    stackSize: 20,
  },
  {
    id: "herbalism.unlock.gravebloom_fungus",
    itemId: "gravebloom_fungus",
    level: 28,
    name: "Gravebloom Fungus",
    family: "mushroom",
    nodeType: "Mushroom",
    rarity: "Rare",
    location: "deeper caves, dungeon boss-adjacent rooms",
    xp: 38,
    alchemyRole: "death/curse resistance, revive/last-stand elixirs",
    baseYield: 1,
    stackSize: 20,
  },
];

export const HERBALISM_PATHS: SkillSpecializationPathDefinition[] = [
  {
    id: "botanist",
    skillId: "herbalism",
    name: "Botanist",
    summary: "Overworld herbs, herb yield, route awareness, color specialization.",
  },
  {
    id: "mycologist",
    skillId: "herbalism",
    name: "Mycologist",
    summary: "Cave fungi, dungeon resources, uncommon mushroom sources.",
  },
  {
    id: "bloomkeeper",
    skillId: "herbalism",
    name: "Bloomkeeper",
    summary: "Bloomheart discovery, prospecting, rare drops, boss rewards.",
  },
];

const LIVE_PERK_IMPLEMENTATION: SkillPerkImplementation = {
  status: "live",
  unlockable: true,
  visible: true,
};

function blockedPerkImplementation(blockedBy: string[]): SkillPerkImplementation {
  return {
    status: "blocked_by_missing_system",
    unlockable: false,
    visible: true,
    blockedBy,
  };
}

export const HERBALISM_PERKS: SkillPerkDefinition[] = [
  {
    id: "herbalism.p1.n01",
    code: "A",
    skillId: "herbalism",
    pathId: "botanist",
    name: "Herb Collector",
    effectText: "Gain 4% chance to get double yield from herbs.",
    requirementText: "None",
    cost: 1,
    requires: [],
    effects: [{ type: "double_yield_chance", target: "herb", chance: 0.04 }],
    implementation: LIVE_PERK_IMPLEMENTATION,
  },
  {
    id: "herbalism.p1.n02",
    code: "C",
    skillId: "herbalism",
    pathId: "botanist",
    name: "Leafsense",
    effectText: "Briefly show the direction of the nearest herb node after picking a herb.",
    requirementText: "Herb Collector",
    cost: 1,
    requires: [{ type: "perk", perkId: "herbalism.p1.n01" }],
    effects: [{ type: "reveal_nearest_node", target: "herb" }],
    implementation: blockedPerkImplementation(["node_direction_reveal"]),
  },
  {
    id: "herbalism.p1.n03",
    code: "F",
    skillId: "herbalism",
    pathId: "botanist",
    name: "Herb Harvester",
    effectText: "Gain 8% chance to get double yield from herbs.",
    requirementText: "Herb Collector",
    cost: 1,
    requires: [{ type: "perk", perkId: "herbalism.p1.n01" }],
    plannedRequirementText: "Leafsense",
    plannedRequires: [{ type: "perk", perkId: "herbalism.p1.n02" }],
    effects: [{ type: "double_yield_chance", target: "herb", chance: 0.08 }],
    implementation: LIVE_PERK_IMPLEMENTATION,
  },
  {
    id: "herbalism.p1.n04",
    code: "G",
    skillId: "herbalism",
    pathId: "botanist",
    name: "Tide Greens",
    effectText: "Gain the ability to fish seaweed.",
    requirementText: "Leafsense",
    cost: 1,
    requires: [{ type: "perk", perkId: "herbalism.p1.n02" }],
    effects: [{ type: "unlock_action", actionId: "fish_seaweed" }],
    implementation: blockedPerkImplementation(["fishing_seaweed"]),
  },
  {
    id: "herbalism.p1.n05",
    code: "M",
    skillId: "herbalism",
    pathId: "botanist",
    name: "Crimson Harvest",
    effectText: "Red herbs gain +10% double yield and XP chance.",
    requirementText: "Herb Harvester",
    cost: 1,
    requires: [{ type: "perk", perkId: "herbalism.p1.n03" }],
    effects: [{ type: "double_yield_chance", target: "herb", chance: 0.1 }],
    implementation: blockedPerkImplementation(["red_herbs", "xp_yield_modifiers"]),
  },
  {
    id: "herbalism.p1.n06",
    code: "N",
    skillId: "herbalism",
    pathId: "botanist",
    name: "Azure Harvest",
    effectText: "Blue herbs gain +10% double yield and XP chance.",
    requirementText: "Herb Harvester",
    cost: 1,
    requires: [{ type: "perk", perkId: "herbalism.p1.n03" }],
    effects: [{ type: "double_yield_chance", target: "herb", chance: 0.1 }],
    implementation: blockedPerkImplementation(["blue_herbs", "xp_yield_modifiers"]),
  },
  {
    id: "herbalism.p1.n07",
    code: "O",
    skillId: "herbalism",
    pathId: "botanist",
    name: "Violet Harvest",
    effectText: "Purple herbs gain +10% double yield and XP chance.",
    requirementText: "Herb Harvester",
    cost: 1,
    requires: [{ type: "perk", perkId: "herbalism.p1.n03" }],
    effects: [{ type: "double_yield_chance", target: "herb", chance: 0.1 }],
    implementation: blockedPerkImplementation(["purple_herbs", "xp_yield_modifiers"]),
  },
  {
    id: "herbalism.p1.n08",
    code: "S",
    skillId: "herbalism",
    pathId: "botanist",
    name: "Expert Herb Harvester",
    effectText: "Gain 16% chance to get double yield from herbs.",
    requirementText: "Herb Harvester",
    cost: 1,
    requires: [{ type: "perk", perkId: "herbalism.p1.n03" }],
    plannedRequirementText: "Crimson, Azure, or Violet Harvest",
    plannedRequires: [{ type: "any_perk", perkIds: ["herbalism.p1.n05", "herbalism.p1.n06", "herbalism.p1.n07"] }],
    effects: [{ type: "double_yield_chance", target: "herb", chance: 0.16 }],
    implementation: LIVE_PERK_IMPLEMENTATION,
  },
  {
    id: "herbalism.p2.n01",
    code: "B",
    skillId: "herbalism",
    pathId: "mycologist",
    name: "Mushroom Collector",
    effectText: "Gain 2% chance to get double yield from mushrooms.",
    requirementText: "None",
    cost: 1,
    requires: [],
    effects: [{ type: "double_yield_chance", target: "mushroom", chance: 0.02 }],
    implementation: blockedPerkImplementation(["mushrooms"]),
  },
  {
    id: "herbalism.p2.n02",
    code: "D",
    skillId: "herbalism",
    pathId: "mycologist",
    name: "Fungal Eye",
    effectText: "Find mushrooms easier outside of dungeons.",
    requirementText: "Mushroom Collector",
    cost: 1,
    requires: [{ type: "perk", perkId: "herbalism.p2.n01" }],
    effects: [{ type: "reveal_nearest_node", target: "mushroom" }],
    implementation: blockedPerkImplementation(["mushrooms", "node_direction_reveal"]),
  },
  {
    id: "herbalism.p2.n03",
    code: "H",
    skillId: "herbalism",
    pathId: "mycologist",
    name: "Mushroom Harvester",
    effectText: "Gain 4% chance to get double yield from mushrooms.",
    requirementText: "Fungal Eye",
    cost: 1,
    requires: [{ type: "perk", perkId: "herbalism.p2.n02" }],
    effects: [{ type: "double_yield_chance", target: "mushroom", chance: 0.04 }],
    implementation: blockedPerkImplementation(["mushrooms"]),
  },
  {
    id: "herbalism.p2.n04",
    code: "I",
    skillId: "herbalism",
    pathId: "mycologist",
    name: "Stonecap Lore",
    effectText: "Gain the ability to mine stonecap mushrooms.",
    requirementText: "Fungal Eye",
    cost: 1,
    requires: [{ type: "perk", perkId: "herbalism.p2.n02" }],
    effects: [{ type: "unlock_action", actionId: "mine_stonecap_mushrooms" }],
    implementation: blockedPerkImplementation(["mushrooms", "mining_node_rewards"]),
  },
  {
    id: "herbalism.p2.n05",
    code: "P",
    skillId: "herbalism",
    pathId: "mycologist",
    name: "Pale Mycelia",
    effectText: "White mushrooms gain +5% double yield and XP chance.",
    requirementText: "Mushroom Harvester",
    cost: 1,
    requires: [{ type: "perk", perkId: "herbalism.p2.n03" }],
    effects: [{ type: "double_yield_chance", target: "mushroom", chance: 0.05 }],
    implementation: blockedPerkImplementation(["mushrooms", "xp_yield_modifiers"]),
  },
  {
    id: "herbalism.p2.n06",
    code: "Q",
    skillId: "herbalism",
    pathId: "mycologist",
    name: "Earthen Mycelia",
    effectText: "Brown mushrooms gain +5% double yield and XP chance.",
    requirementText: "Mushroom Harvester",
    cost: 1,
    requires: [{ type: "perk", perkId: "herbalism.p2.n03" }],
    effects: [{ type: "double_yield_chance", target: "mushroom", chance: 0.05 }],
    implementation: blockedPerkImplementation(["mushrooms", "xp_yield_modifiers"]),
  },
  {
    id: "herbalism.p2.n07",
    code: "T",
    skillId: "herbalism",
    pathId: "mycologist",
    name: "Expert Mushroom Harvester",
    effectText: "Gain 8% chance to get double yield from mushrooms.",
    requirementText: "Pale or Earthen Mycelia",
    cost: 1,
    requires: [{ type: "any_perk", perkIds: ["herbalism.p2.n05", "herbalism.p2.n06"] }],
    effects: [{ type: "double_yield_chance", target: "mushroom", chance: 0.08 }],
    implementation: blockedPerkImplementation(["mushrooms"]),
  },
  {
    id: "herbalism.p3.n01",
    code: "E",
    skillId: "herbalism",
    pathId: "bloomkeeper",
    name: "Bloomheart Instinct",
    effectText: "Increase the random drop chance of a Bloomheart by 1%.",
    requirementText: "Herb Collector or Mushroom Collector",
    cost: 1,
    requires: [{ type: "any_perk", perkIds: ["herbalism.p1.n01", "herbalism.p2.n01"] }],
    effects: [{ type: "drop_chance_bonus", target: "bloomheart", chance: 0.01 }],
    implementation: blockedPerkImplementation(["bloomhearts"]),
  },
  {
    id: "herbalism.p3.n02",
    code: "J",
    skillId: "herbalism",
    pathId: "bloomkeeper",
    name: "Herbal Prospecting",
    effectText: "Prospect and consume herbs for a 5% chance to find a Bloomheart.",
    requirementText: "Bloomheart Instinct",
    cost: 1,
    requires: [{ type: "perk", perkId: "herbalism.p3.n01" }],
    effects: [{ type: "prospect_reagent", target: "herb", chance: 0.05 }],
    implementation: blockedPerkImplementation(["bloomhearts", "prospecting"]),
  },
  {
    id: "herbalism.p3.n03",
    code: "K",
    skillId: "herbalism",
    pathId: "bloomkeeper",
    name: "Fungal Prospecting",
    effectText: "Prospect and consume mushrooms for a 10% chance to find a Bloomheart.",
    requirementText: "Bloomheart Instinct",
    cost: 1,
    requires: [{ type: "perk", perkId: "herbalism.p3.n01" }],
    effects: [{ type: "prospect_reagent", target: "mushroom", chance: 0.1 }],
    implementation: blockedPerkImplementation(["mushrooms", "bloomhearts", "prospecting"]),
  },
  {
    id: "herbalism.p3.n04",
    code: "L",
    skillId: "herbalism",
    pathId: "bloomkeeper",
    name: "Living Core",
    effectText: "Increase the random drop chance of a Bloomheart by 2%.",
    requirementText: "Herbal or Fungal Prospecting",
    cost: 1,
    requires: [{ type: "any_perk", perkIds: ["herbalism.p3.n02", "herbalism.p3.n03"] }],
    effects: [{ type: "drop_chance_bonus", target: "bloomheart", chance: 0.02 }],
    implementation: blockedPerkImplementation(["bloomhearts"]),
  },
  {
    id: "herbalism.p3.n05",
    code: "R",
    skillId: "herbalism",
    pathId: "bloomkeeper",
    name: "Heart of the Hoard",
    effectText: "Dungeon bosses have a chance to drop a Bloomheart.",
    requirementText: "Living Core",
    cost: 1,
    requires: [{ type: "perk", perkId: "herbalism.p3.n04" }],
    effects: [{ type: "drop_chance_bonus", target: "bloomheart", chance: 0 }],
    implementation: blockedPerkImplementation(["bloomhearts", "dungeons", "boss_loot"]),
  },
  {
    id: "herbalism.p3.n06",
    code: "U",
    skillId: "herbalism",
    pathId: "bloomkeeper",
    name: "Bloomkeeper's Gift",
    effectText: "Increase the random drop chance of a Bloomheart by 4%.",
    requirementText: "Heart of the Hoard",
    cost: 1,
    requires: [{ type: "perk", perkId: "herbalism.p3.n05" }],
    effects: [{ type: "drop_chance_bonus", target: "bloomheart", chance: 0.04 }],
    implementation: blockedPerkImplementation(["bloomhearts"]),
  },
];

export const SKILL_CONTENT_DEFINITIONS: Partial<Record<SkillId, SkillContentDefinition>> = {
  herbalism: {
    skillId: "herbalism",
    nextUnlock: "Moonleaf",
    overview: {
      role: "Gathers plants, fungi, and rare Bloomhearts for Alchemy, trading, and dungeon preparation.",
      gathering: "Nodes above your Herbalism level stay visible, but show their required level.",
      progression: "Higher levels make more of the world useful instead of replacing old herbs.",
    },
    unlocks: HERBALISM_UNLOCKS,
    specializationPaths: HERBALISM_PATHS,
    perks: HERBALISM_PERKS,
  },
};

function getOldSchoolRuneScapeXpForLevel(level: number) {
  let points = 0;

  for (let currentLevel = 1; currentLevel < level; currentLevel += 1) {
    points += Math.floor(currentLevel + 300 * Math.pow(2, currentLevel / 7));
  }

  return Math.floor(points / 4);
}

export const MAX_SKILL_XP = getOldSchoolRuneScapeXpForLevel(OSRS_REFERENCE_MAX_LEVEL);

function getStretchedReferenceLevel(level: number) {
  const progressToMax = (level - 1) / (MAX_SKILL_LEVEL - 1);
  return 1 + progressToMax * (OSRS_REFERENCE_MAX_LEVEL - 1);
}

function getInterpolatedReferenceXp(referenceLevel: number) {
  const lowerLevel = Math.floor(referenceLevel);
  const upperLevel = Math.ceil(referenceLevel);

  if (lowerLevel === upperLevel) {
    return getOldSchoolRuneScapeXpForLevel(lowerLevel);
  }

  const lowerXp = getOldSchoolRuneScapeXpForLevel(lowerLevel);
  const upperXp = getOldSchoolRuneScapeXpForLevel(upperLevel);
  const levelFraction = referenceLevel - lowerLevel;

  return Math.round(lowerXp + (upperXp - lowerXp) * levelFraction);
}

function buildSkillXpTable(): SkillLevelRequirement[] {
  return Array.from({ length: MAX_SKILL_LEVEL }, (_, index) => {
    const level = index + 1;
    const totalXp = getInterpolatedReferenceXp(getStretchedReferenceLevel(level));
    const previousTotalXp = index === 0 ? 0 : getInterpolatedReferenceXp(getStretchedReferenceLevel(level - 1));

    return {
      level,
      totalXp,
      xpFromPreviousLevel: totalXp - previousTotalXp,
    };
  });
}

export const SKILL_XP_TABLE = buildSkillXpTable();

function clampTotalXp(totalXp: number) {
  if (!Number.isFinite(totalXp)) return 0;
  return Math.max(0, Math.min(MAX_SKILL_XP, Math.floor(totalXp)));
}

export function getXpRequiredForSkillLevel(level: number) {
  if (!Number.isInteger(level) || level < 1 || level > MAX_SKILL_LEVEL) {
    throw new RangeError(`Skill level must be an integer from 1 to ${MAX_SKILL_LEVEL}.`);
  }

  return SKILL_XP_TABLE[level - 1].totalXp;
}

export function getSkillLevelForXp(totalXp: number) {
  const clampedXp = clampTotalXp(totalXp);

  for (let index = SKILL_XP_TABLE.length - 1; index >= 0; index -= 1) {
    if (clampedXp >= SKILL_XP_TABLE[index].totalXp) {
      return SKILL_XP_TABLE[index].level;
    }
  }

  return 1;
}

export function getSkillProgress(totalXp: number): SkillProgress {
  const clampedXp = clampTotalXp(totalXp);
  const level = getSkillLevelForXp(clampedXp);
  const currentLevelXp = getXpRequiredForSkillLevel(level);
  const isMaxLevel = level >= MAX_SKILL_LEVEL;
  const nextLevelXp = isMaxLevel ? null : getXpRequiredForSkillLevel(level + 1);
  const xpForNextLevel = nextLevelXp === null ? 0 : nextLevelXp - currentLevelXp;
  const xpIntoLevel = isMaxLevel ? 0 : clampedXp - currentLevelXp;

  return {
    level,
    totalXp: clampedXp,
    currentLevelXp,
    nextLevelXp,
    xpIntoLevel,
    xpForNextLevel,
    percentToNextLevel: xpForNextLevel === 0 ? 100 : Math.round((xpIntoLevel / xpForNextLevel) * 100),
    isMaxLevel,
  };
}

export function getSkillContentDefinition(skillId: SkillId) {
  return SKILL_CONTENT_DEFINITIONS[skillId] ?? null;
}

export function getSkillUnlocks(skillId: SkillId) {
  return getSkillContentDefinition(skillId)?.unlocks ?? [];
}

export function getSkillUnlockByItemId(skillId: SkillId, itemId: string) {
  return getSkillUnlocks(skillId).find(unlock => unlock.itemId === itemId) ?? null;
}

export function getSkillPerks(skillId: SkillId) {
  return getSkillContentDefinition(skillId)?.perks ?? [];
}

export function getSkillPerkDefinition(skillId: SkillId, perkId: string) {
  return getSkillPerks(skillId).find(perk => perk.id === perkId) ?? null;
}

export function getSkillPerkPointCountForLevel(level: number) {
  return SKILL_PERK_POINT_LEVELS.filter(perkLevel => level >= perkLevel).length;
}

export function getSkillPerkPointCountForXp(totalXp: number) {
  return getSkillPerkPointCountForLevel(getSkillLevelForXp(totalXp));
}
