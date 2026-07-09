import type { ReagentFamily, SkillId } from "@onyx/shared/skills";
import { getUnlockedSkillPerkEffects } from "./skills";

export interface SkillEffectContext {
  type: "gather";
  skillId: SkillId;
  itemId: string;
  family: ReagentFamily;
}

export interface ResolvedSkillEffects {
  doubleYieldChance: number;
}

export function resolveSkillEffects(userId: string, context: SkillEffectContext): ResolvedSkillEffects {
  const resolved: ResolvedSkillEffects = {
    doubleYieldChance: 0,
  };

  for (const effect of getUnlockedSkillPerkEffects(userId, context.skillId)) {
    if (effect.type === "double_yield_chance" && effect.target === context.family) {
      resolved.doubleYieldChance += effect.chance;
    }
  }

  resolved.doubleYieldChance = Math.max(0, Math.min(1, resolved.doubleYieldChance));
  return resolved;
}
