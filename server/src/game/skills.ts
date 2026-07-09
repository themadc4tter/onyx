import {
  MAX_SKILL_XP,
  SKILL_DEFINITIONS,
  getSkillLevelForXp,
  getSkillPerkDefinition,
  getSkillPerkPointCountForXp,
  getSkillPerks,
  type SkillId,
  type SkillPerkDefinition,
  type SkillPerkEffect,
  type SkillPerkRequirement,
} from "@onyx/shared/skills";
import type { SkillsPayload } from "@onyx/shared/protocol";
import { supabase } from "../lib/supabase";

export interface SkillState {
  skillId: SkillId;
  totalXp: number;
  skillPerkPointsEarned: number;
  universalPerkPointsAllocated: number;
  unlockedPerkIds: Set<string>;
}

export interface UniversalPerkPointState {
  available: number;
  lifetimeEarned: number;
}

export interface SkillXpGrantResult {
  skillId: SkillId;
  xpGained: number;
  totalXp: number;
  skillPerkPointsGained: number;
}

export interface SkillPerkUnlockResult {
  ok: boolean;
  error?: string;
  skillId?: SkillId;
  perkId?: string;
  spentUniversalPoints?: number;
}

export interface UniversalPerkGrantResult {
  ok: boolean;
  pointsGranted: number;
  availablePoints: number;
  sourceRef?: string;
}

export interface UniversalPerkRefundResult {
  ok: boolean;
  error?: string;
  skillId?: SkillId;
  refundedUniversalPoints?: number;
  removedPerkIds?: string[];
}

const SKILL_SAVE_DELAY_MS = 30_000;
const SKILL_SAVE_RETRY_MS = 30_000;
const skillIds = new Set<SkillId>(SKILL_DEFINITIONS.map(skill => skill.id));
const skillsByUserId = new Map<string, Map<SkillId, SkillState>>();
const universalPerkPointsByUserId = new Map<string, UniversalPerkPointState>();
const universalGrantRefsByUserId = new Map<string, Set<string>>();
const dirtySkillUserIds = new Set<string>();
const skillSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const persistenceWarnings = new Set<string>();

let canUseExtendedSkillColumns = true;
let canUseSkillPerkTable = true;
let canUseUniversalPerkPointTable = true;

interface SkillRow {
  skill_id: string;
  total_xp: number;
  skill_perk_points_earned?: number | null;
  universal_perk_points_allocated?: number | null;
}

interface SkillPerkRow {
  skill_id: string;
  perk_id: string;
}

interface UniversalPerkPointRow {
  available_points: number;
  lifetime_points_earned: number;
}

function createSkillState(skillId: SkillId): SkillState {
  return {
    skillId,
    totalXp: 0,
    skillPerkPointsEarned: 0,
    universalPerkPointsAllocated: 0,
    unlockedPerkIds: new Set<string>(),
  };
}

function createEmptySkills() {
  return new Map<SkillId, SkillState>(SKILL_DEFINITIONS.map(skill => [skill.id, createSkillState(skill.id)]));
}

function createEmptyUniversalPerkPoints(): UniversalPerkPointState {
  return {
    available: 0,
    lifetimeEarned: 0,
  };
}

function isSkillId(skillId: string): skillId is SkillId {
  return skillIds.has(skillId as SkillId);
}

function clampTotalXp(totalXp: number) {
  if (!Number.isFinite(totalXp)) return 0;
  return Math.max(0, Math.min(MAX_SKILL_XP, Math.floor(totalXp)));
}

function clampPointCount(points: number) {
  if (!Number.isFinite(points)) return 0;
  return Math.max(0, Math.floor(points));
}

function warnPersistenceOnce(key: string, message: string, error: unknown) {
  if (persistenceWarnings.has(key)) return;
  persistenceWarnings.add(key);
  console.warn(message, error);
}

function syncEarnedSkillPerkPoints(skill: SkillState) {
  skill.skillPerkPointsEarned = Math.max(
    skill.skillPerkPointsEarned,
    getSkillPerkPointCountForXp(skill.totalXp),
  );
}

export function getSkills(userId: string) {
  let skills = skillsByUserId.get(userId);
  if (!skills) {
    skills = createEmptySkills();
    skillsByUserId.set(userId, skills);
  }

  for (const skill of skills.values()) {
    syncEarnedSkillPerkPoints(skill);
  }

  return skills;
}

export function getUniversalPerkPoints(userId: string) {
  let points = universalPerkPointsByUserId.get(userId);
  if (!points) {
    points = createEmptyUniversalPerkPoints();
    universalPerkPointsByUserId.set(userId, points);
  }

  return points;
}

function getSkillState(userId: string, skillId: SkillId) {
  const skills = getSkills(userId);
  let skill = skills.get(skillId);
  if (!skill) {
    skill = createSkillState(skillId);
    skills.set(skillId, skill);
  }

  syncEarnedSkillPerkPoints(skill);
  return skill;
}

function getTreeCapacity(skill: SkillState) {
  return skill.skillPerkPointsEarned + skill.universalPerkPointsAllocated;
}

function getSpentSkillPerkPoints(skillId: SkillId, unlockedPerkIds: Set<string>) {
  let spent = 0;
  for (const perkId of unlockedPerkIds) {
    const perk = getSkillPerkDefinition(skillId, perkId);
    if (perk) spent += perk.cost;
  }

  return spent;
}

function getAvailableTreePoints(skill: SkillState) {
  return getTreeCapacity(skill) - getSpentSkillPerkPoints(skill.skillId, skill.unlockedPerkIds);
}

export function getSkillsPayload(userId: string): SkillsPayload {
  const skills = getSkills(userId);
  const universalPerkPoints = getUniversalPerkPoints(userId);

  return {
    universalPerkPoints: {
      available: universalPerkPoints.available,
      lifetimeEarned: universalPerkPoints.lifetimeEarned,
    },
    skills: SKILL_DEFINITIONS.map(skillDefinition => {
      const skill = skills.get(skillDefinition.id) ?? createSkillState(skillDefinition.id);
      syncEarnedSkillPerkPoints(skill);

      return {
        skillId: skillDefinition.id,
        totalXp: skill.totalXp,
        skillPerkPointsEarned: skill.skillPerkPointsEarned,
        universalPerkPointsAllocated: skill.universalPerkPointsAllocated,
        availableTreePoints: Math.max(0, getAvailableTreePoints(skill)),
        unlockedPerkIds: [...skill.unlockedPerkIds],
      };
    }),
  };
}

export async function loadSkills(userId: string) {
  const skills = createEmptySkills();
  const selectColumns = canUseExtendedSkillColumns
    ? "skill_id, total_xp, skill_perk_points_earned, universal_perk_points_allocated"
    : "skill_id, total_xp";

  const response = await supabase
    .from("player_skills")
    .select(selectColumns)
    .eq("user_id", userId);
  let data = response.data as unknown[] | null;
  let error: unknown = response.error;

  if (error && canUseExtendedSkillColumns) {
    canUseExtendedSkillColumns = false;
    warnPersistenceOnce(
      "player_skills_extended_load",
      "[skills] player_skills perk columns are unavailable; continuing with XP-only persistence.",
      error,
    );

    const fallback = await supabase
      .from("player_skills")
      .select("skill_id, total_xp")
      .eq("user_id", userId);
    data = fallback.data as unknown[] | null;
    error = fallback.error;
  }

  if (error) {
    throw error;
  }

  for (const row of (data ?? []) as SkillRow[]) {
    if (!isSkillId(row.skill_id)) continue;
    const skill = skills.get(row.skill_id);
    if (!skill) continue;

    skill.totalXp = clampTotalXp(row.total_xp);
    skill.skillPerkPointsEarned = Math.max(
      clampPointCount(row.skill_perk_points_earned ?? 0),
      getSkillPerkPointCountForXp(skill.totalXp),
    );
    skill.universalPerkPointsAllocated = clampPointCount(row.universal_perk_points_allocated ?? 0);
  }

  skillsByUserId.set(userId, skills);
  await Promise.all([
    loadUnlockedSkillPerks(userId),
    loadUniversalPerkPoints(userId),
  ]);

  return skills;
}

async function loadUnlockedSkillPerks(userId: string) {
  if (!canUseSkillPerkTable) return;

  const { data, error } = await supabase
    .from("player_skill_perks")
    .select("skill_id, perk_id")
    .eq("user_id", userId);

  if (error) {
    canUseSkillPerkTable = false;
    warnPersistenceOnce(
      "player_skill_perks_load",
      "[skills] player_skill_perks is unavailable; perk unlocks will remain in memory for this server session.",
      error,
    );
    return;
  }

  const skills = getSkills(userId);
  for (const row of (data ?? []) as SkillPerkRow[]) {
    if (!isSkillId(row.skill_id)) continue;
    if (!getSkillPerkDefinition(row.skill_id, row.perk_id)) continue;
    skills.get(row.skill_id)?.unlockedPerkIds.add(row.perk_id);
  }
}

async function loadUniversalPerkPoints(userId: string) {
  if (!canUseUniversalPerkPointTable) return;

  const { data, error } = await supabase
    .from("player_universal_perk_points")
    .select("available_points, lifetime_points_earned")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    canUseUniversalPerkPointTable = false;
    warnPersistenceOnce(
      "player_universal_perk_points_load",
      "[skills] player_universal_perk_points is unavailable; universal perk points will remain in memory for this server session.",
      error,
    );
    return;
  }

  const row = data as UniversalPerkPointRow | null;
  if (!row) return;

  universalPerkPointsByUserId.set(userId, {
    available: clampPointCount(row.available_points),
    lifetimeEarned: clampPointCount(row.lifetime_points_earned),
  });
}

export async function saveSkills(userId: string, skills = getSkills(userId)) {
  const updatedAt = new Date().toISOString();
  const rows = SKILL_DEFINITIONS.map(skillDefinition => {
    const skill = skills.get(skillDefinition.id) ?? createSkillState(skillDefinition.id);
    syncEarnedSkillPerkPoints(skill);

    return {
      user_id: userId,
      skill_id: skillDefinition.id,
      total_xp: clampTotalXp(skill.totalXp),
      skill_perk_points_earned: clampPointCount(skill.skillPerkPointsEarned),
      universal_perk_points_allocated: clampPointCount(skill.universalPerkPointsAllocated),
      updated_at: updatedAt,
    };
  });

  if (canUseExtendedSkillColumns) {
    const { error } = await supabase
      .from("player_skills")
      .upsert(rows, { onConflict: "user_id,skill_id" });

    if (error) {
      canUseExtendedSkillColumns = false;
      warnPersistenceOnce(
        "player_skills_extended_save",
        "[skills] player_skills perk columns could not be saved; falling back to XP-only persistence.",
        error,
      );
    } else {
      await Promise.all([
        saveUnlockedSkillPerks(userId, skills),
        saveUniversalPerkPoints(userId),
      ]);
      return;
    }
  }

  const xpRows = rows.map(row => ({
    user_id: row.user_id,
    skill_id: row.skill_id,
    total_xp: row.total_xp,
    updated_at: row.updated_at,
  }));

  const { error } = await supabase
    .from("player_skills")
    .upsert(xpRows, { onConflict: "user_id,skill_id" });

  if (error) {
    throw error;
  }

  await Promise.all([
    saveUnlockedSkillPerks(userId, skills),
    saveUniversalPerkPoints(userId),
  ]);
}

async function saveUnlockedSkillPerks(userId: string, skills: Map<SkillId, SkillState>) {
  if (!canUseSkillPerkTable) return;

  const rows = [...skills.values()].flatMap(skill => (
    [...skill.unlockedPerkIds].map(perkId => ({
      user_id: userId,
      skill_id: skill.skillId,
      perk_id: perkId,
      unlocked_at: new Date().toISOString(),
    }))
  ));

  const deleteResult = await supabase
    .from("player_skill_perks")
    .delete()
    .eq("user_id", userId);

  if (deleteResult.error) {
    canUseSkillPerkTable = false;
    warnPersistenceOnce(
      "player_skill_perks_save_delete",
      "[skills] player_skill_perks could not be updated; perk unlocks will remain in memory for this server session.",
      deleteResult.error,
    );
    return;
  }

  if (rows.length === 0) return;

  const { error } = await supabase
    .from("player_skill_perks")
    .insert(rows);

  if (error) {
    canUseSkillPerkTable = false;
    warnPersistenceOnce(
      "player_skill_perks_save_insert",
      "[skills] player_skill_perks could not be updated; perk unlocks will remain in memory for this server session.",
      error,
    );
  }
}

async function saveUniversalPerkPoints(userId: string) {
  if (!canUseUniversalPerkPointTable) return;

  const points = getUniversalPerkPoints(userId);
  const { error } = await supabase
    .from("player_universal_perk_points")
    .upsert({
      user_id: userId,
      available_points: points.available,
      lifetime_points_earned: points.lifetimeEarned,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

  if (error) {
    canUseUniversalPerkPointTable = false;
    warnPersistenceOnce(
      "player_universal_perk_points_save",
      "[skills] player_universal_perk_points could not be saved; universal perk points will remain in memory for this server session.",
      error,
    );
  }
}

export function markSkillsDirty(userId: string) {
  dirtySkillUserIds.add(userId);
  if (skillSaveTimers.has(userId)) return;

  const timer = setTimeout(() => {
    skillSaveTimers.delete(userId);
    saveSkills(userId).then(() => {
      dirtySkillUserIds.delete(userId);
    }).catch(error => {
      console.error(`[skills] failed to save dirty skills for ${userId}`, error);
      const retryTimer = setTimeout(() => markSkillsDirty(userId), SKILL_SAVE_RETRY_MS);
      retryTimer.unref?.();
      skillSaveTimers.set(userId, retryTimer);
    });
  }, SKILL_SAVE_DELAY_MS);

  timer.unref?.();
  skillSaveTimers.set(userId, timer);
}

export async function flushDirtySkills(userId: string) {
  const timer = skillSaveTimers.get(userId);
  if (timer) {
    clearTimeout(timer);
    skillSaveTimers.delete(userId);
  }

  if (!dirtySkillUserIds.has(userId)) return;
  await saveSkills(userId);
  dirtySkillUserIds.delete(userId);
}

export async function flushAllDirtySkills() {
  await Promise.all([...dirtySkillUserIds].map(userId => flushDirtySkills(userId)));
}

export function grantSkillXp(userId: string, skillId: SkillId, xpAmount: number): SkillXpGrantResult {
  if (!skillIds.has(skillId)) {
    throw new Error(`Unknown skill id: ${skillId}`);
  }

  const skill = getSkillState(userId, skillId);
  const currentXp = skill.totalXp;
  const currentEarnedPoints = skill.skillPerkPointsEarned;
  const newTotalXp = clampTotalXp(currentXp + Math.max(0, Math.floor(xpAmount)));
  const xpGained = newTotalXp - currentXp;

  skill.totalXp = newTotalXp;
  skill.skillPerkPointsEarned = Math.max(currentEarnedPoints, getSkillPerkPointCountForXp(newTotalXp));
  const skillPerkPointsGained = skill.skillPerkPointsEarned - currentEarnedPoints;

  if (xpGained > 0 || skillPerkPointsGained > 0) markSkillsDirty(userId);

  return {
    skillId,
    xpGained,
    totalXp: newTotalXp,
    skillPerkPointsGained,
  };
}

export function grantUniversalPerkPoints(
  userId: string,
  points: number,
  source: string,
  sourceRef?: string,
): UniversalPerkGrantResult {
  const pointCount = clampPointCount(points);
  const universal = getUniversalPerkPoints(userId);

  if (pointCount <= 0) {
    return {
      ok: false,
      pointsGranted: 0,
      availablePoints: universal.available,
      sourceRef,
    };
  }

  if (sourceRef) {
    const refs = universalGrantRefsByUserId.get(userId) ?? new Set<string>();
    if (refs.has(sourceRef)) {
      return {
        ok: true,
        pointsGranted: 0,
        availablePoints: universal.available,
        sourceRef,
      };
    }

    refs.add(sourceRef);
    universalGrantRefsByUserId.set(userId, refs);
  }

  universal.available += pointCount;
  universal.lifetimeEarned += pointCount;
  markSkillsDirty(userId);
  console.log(`[skills] granted ${pointCount} universal perk point(s) to ${userId} from ${source}`);

  return {
    ok: true,
    pointsGranted: pointCount,
    availablePoints: universal.available,
    sourceRef,
  };
}

export function unlockSkillPerk(
  userId: string,
  skillId: SkillId,
  perkId: string,
  spendUniversalIfNeeded: boolean,
): SkillPerkUnlockResult {
  if (!skillIds.has(skillId)) {
    return { ok: false, error: "unknown_skill" };
  }

  const perk = getSkillPerkDefinition(skillId, perkId);
  if (!perk || !perk.implementation.visible) {
    return { ok: false, error: "unknown_perk" };
  }

  if (perk.implementation.status !== "live" || !perk.implementation.unlockable) {
    return { ok: false, error: "perk_blocked", skillId, perkId };
  }

  const skill = getSkillState(userId, skillId);
  if (skill.unlockedPerkIds.has(perkId)) {
    return { ok: false, error: "already_unlocked", skillId, perkId };
  }

  if (!arePerkRequirementsMet(perk, skill, skill.unlockedPerkIds)) {
    return { ok: false, error: "missing_requirements", skillId, perkId };
  }

  const availableTreePoints = getAvailableTreePoints(skill);
  const neededUniversalPoints = Math.max(0, perk.cost - availableTreePoints);
  let spentUniversalPoints = 0;

  if (neededUniversalPoints > 0) {
    if (!spendUniversalIfNeeded) {
      return { ok: false, error: "not_enough_points", skillId, perkId };
    }

    const universal = getUniversalPerkPoints(userId);
    if (universal.available < neededUniversalPoints) {
      return { ok: false, error: "not_enough_points", skillId, perkId };
    }

    universal.available -= neededUniversalPoints;
    skill.universalPerkPointsAllocated += neededUniversalPoints;
    spentUniversalPoints = neededUniversalPoints;
  }

  skill.unlockedPerkIds.add(perkId);
  markSkillsDirty(userId);

  return {
    ok: true,
    skillId,
    perkId,
    spentUniversalPoints,
  };
}

export function refundUniversalPerkPoints(
  userId: string,
  skillId: SkillId,
  refund: "one" | "all",
): UniversalPerkRefundResult {
  if (!skillIds.has(skillId)) {
    return { ok: false, error: "unknown_skill" };
  }

  const skill = getSkillState(userId, skillId);
  const refundedUniversalPoints = refund === "all"
    ? skill.universalPerkPointsAllocated
    : Math.min(1, skill.universalPerkPointsAllocated);

  if (refundedUniversalPoints <= 0) {
    return { ok: false, error: "no_universal_points_allocated", skillId };
  }

  const universal = getUniversalPerkPoints(userId);
  skill.universalPerkPointsAllocated -= refundedUniversalPoints;
  universal.available += refundedUniversalPoints;

  const removedPerkIds = pruneSkillTreeToBudget(skill);
  markSkillsDirty(userId);

  return {
    ok: true,
    skillId,
    refundedUniversalPoints,
    removedPerkIds,
  };
}

export function getUnlockedSkillPerkEffects(userId: string, skillId: SkillId): SkillPerkEffect[] {
  const skill = getSkillState(userId, skillId);
  const effects: SkillPerkEffect[] = [];

  for (const perk of getSkillPerks(skillId)) {
    if (!skill.unlockedPerkIds.has(perk.id)) continue;
    if (perk.implementation.status !== "live") continue;
    effects.push(...perk.effects);
  }

  return effects;
}

function arePerkRequirementsMet(
  perk: SkillPerkDefinition,
  skill: SkillState,
  unlockedPerkIds: Set<string>,
) {
  return perk.requires.every(requirement => isRequirementMet(requirement, skill, unlockedPerkIds));
}

function isRequirementMet(
  requirement: SkillPerkRequirement,
  skill: SkillState,
  unlockedPerkIds: Set<string>,
) {
  if (requirement.type === "perk") {
    return unlockedPerkIds.has(requirement.perkId);
  }

  if (requirement.type === "any_perk") {
    return requirement.perkIds.some(perkId => unlockedPerkIds.has(perkId));
  }

  return getSkillLevelForXp(skill.totalXp) >= requirement.level;
}

function pruneSkillTreeToBudget(skill: SkillState) {
  const removedPerkIds: string[] = [];

  while (!isUnlockedTreeValid(skill) || getAvailableTreePoints(skill) < 0) {
    const invalidPerkId = findInvalidUnlockedPerkId(skill);
    const perkToRemove = invalidPerkId ?? findRemovableLeafPerkId(skill);
    if (!perkToRemove) break;

    skill.unlockedPerkIds.delete(perkToRemove);
    removedPerkIds.push(perkToRemove);
  }

  return removedPerkIds;
}

function isUnlockedTreeValid(skill: SkillState) {
  if (getAvailableTreePoints(skill) < 0) return false;

  return [...skill.unlockedPerkIds].every(perkId => {
    const perk = getSkillPerkDefinition(skill.skillId, perkId);
    return !perk || arePerkRequirementsMet(perk, skill, skill.unlockedPerkIds);
  });
}

function findInvalidUnlockedPerkId(skill: SkillState) {
  for (const perk of getSkillPerks(skill.skillId)) {
    if (!skill.unlockedPerkIds.has(perk.id)) continue;
    if (!arePerkRequirementsMet(perk, skill, skill.unlockedPerkIds)) return perk.id;
  }

  return null;
}

function findRemovableLeafPerkId(skill: SkillState) {
  const unlockedDefinitions = getSkillPerks(skill.skillId)
    .filter(perk => skill.unlockedPerkIds.has(perk.id))
    .reverse();

  for (const perk of unlockedDefinitions) {
    const remainingPerks = new Set(skill.unlockedPerkIds);
    remainingPerks.delete(perk.id);

    const remainingTreeIsValid = getSkillPerks(skill.skillId)
      .filter(candidate => remainingPerks.has(candidate.id))
      .every(candidate => arePerkRequirementsMet(candidate, skill, remainingPerks));

    if (remainingTreeIsValid) return perk.id;
  }

  const unlockedPerkIds = [...skill.unlockedPerkIds];
  return unlockedPerkIds.length > 0 ? unlockedPerkIds[unlockedPerkIds.length - 1] : null;
}
