export type StatusEffectType = "root" | "stun" | "sleep";

export interface ActiveStatusEffect {
  type: StatusEffectType;
  sourceId?: string;
  expiresAt: number;
}

const MOVEMENT_BLOCKING_STATUS_EFFECT_TYPES: StatusEffectType[] = ["root", "stun", "sleep"];

export function isStatusEffectActive(effect: ActiveStatusEffect, nowMs = Date.now()) {
  return effect.expiresAt > nowMs;
}

export function getActiveStatusEffects(effects: ActiveStatusEffect[] | undefined, nowMs = Date.now()) {
  return (effects ?? []).filter(effect => isStatusEffectActive(effect, nowMs));
}

export function hasActiveStatusEffect(
  effects: ActiveStatusEffect[] | undefined,
  type: StatusEffectType,
  nowMs = Date.now(),
) {
  return getActiveStatusEffects(effects, nowMs).some(effect => effect.type === type);
}

export function blocksMovement(effects: ActiveStatusEffect[] | undefined, nowMs = Date.now()) {
  return MOVEMENT_BLOCKING_STATUS_EFFECT_TYPES.some(type => hasActiveStatusEffect(effects, type, nowMs));
}
