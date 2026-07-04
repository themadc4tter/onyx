import { MAX_SKILL_XP, SKILL_DEFINITIONS, type SkillId } from "@onyx/shared/skills";
import { supabase } from "../lib/supabase";

export interface SkillXpState {
  skillId: SkillId;
  totalXp: number;
}

export interface SkillXpGrantResult {
  skillId: SkillId;
  xpGained: number;
  totalXp: number;
}

const SKILL_SAVE_DELAY_MS = 30_000;
const SKILL_SAVE_RETRY_MS = 30_000;
const skillIds = new Set<SkillId>(SKILL_DEFINITIONS.map(skill => skill.id));
const skillsByUserId = new Map<string, Map<SkillId, number>>();
const dirtySkillUserIds = new Set<string>();
const skillSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

interface SkillRow {
  skill_id: string;
  total_xp: number;
}

function createEmptySkills() {
  return new Map<SkillId, number>(SKILL_DEFINITIONS.map(skill => [skill.id, 0]));
}

function isSkillId(skillId: string): skillId is SkillId {
  return skillIds.has(skillId as SkillId);
}

function clampTotalXp(totalXp: number) {
  if (!Number.isFinite(totalXp)) return 0;
  return Math.max(0, Math.min(MAX_SKILL_XP, Math.floor(totalXp)));
}

export function getSkills(userId: string) {
  let skills = skillsByUserId.get(userId);
  if (!skills) {
    skills = createEmptySkills();
    skillsByUserId.set(userId, skills);
  }

  return skills;
}

export function getSkillsPayload(userId: string) {
  const skills = getSkills(userId);
  return {
    skills: SKILL_DEFINITIONS.map(skill => ({
      skillId: skill.id,
      totalXp: skills.get(skill.id) ?? 0,
    })),
  };
}

export async function loadSkills(userId: string) {
  const skills = createEmptySkills();
  const { data, error } = await supabase
    .from("player_skills")
    .select("skill_id, total_xp")
    .eq("user_id", userId);

  if (error) {
    throw error;
  }

  for (const row of (data ?? []) as SkillRow[]) {
    if (!isSkillId(row.skill_id)) continue;
    skills.set(row.skill_id, clampTotalXp(row.total_xp));
  }

  skillsByUserId.set(userId, skills);
  return skills;
}

export async function saveSkills(userId: string, skills = getSkills(userId)) {
  const updatedAt = new Date().toISOString();
  const rows = SKILL_DEFINITIONS.map(skill => ({
    user_id: userId,
    skill_id: skill.id,
    total_xp: clampTotalXp(skills.get(skill.id) ?? 0),
    updated_at: updatedAt,
  }));

  const { error } = await supabase
    .from("player_skills")
    .upsert(rows, { onConflict: "user_id,skill_id" });

  if (error) {
    throw error;
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

  const skills = getSkills(userId);
  const currentXp = skills.get(skillId) ?? 0;
  const newTotalXp = clampTotalXp(currentXp + Math.max(0, Math.floor(xpAmount)));
  const xpGained = newTotalXp - currentXp;

  skills.set(skillId, newTotalXp);
  if (xpGained > 0) markSkillsDirty(userId);

  return {
    skillId,
    xpGained,
    totalXp: newTotalXp,
  };
}
