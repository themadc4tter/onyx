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
