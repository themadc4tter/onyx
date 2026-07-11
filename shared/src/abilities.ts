import type { WeaponClass, WeaponType } from "./items";
import type { SkillId } from "./skills";

export const ABILITY_SLOT_COUNT = 4;

export type AbilityId = "whirlwind";

export type AbilityRequirement =
  | { kind: "skill_level"; skillId: SkillId; level: number }
  | { kind: "equipped_weapon_class"; slot: "main_hand"; weaponClass: WeaponClass }
  | { kind: "equipped_weapon_type"; slot: "main_hand"; weaponType: WeaponType };

export type AbilityTargetingDefinition =
  | { kind: "self" }
  | { kind: "selected_enemy"; rangeTiles: number }
  | { kind: "self_area"; radiusTiles: number; shape: "square" | "circle" };

export type AbilityEffectDefinition =
  | {
      kind: "damage";
      amount: number;
      target: "selected" | "enemies_in_area";
      damageClass: WeaponClass;
    };

export type AbilityAnimationDefinition =
  | { kind: "directional_slash" }
  | { kind: "radial_slash"; radiusTiles: number }
  | { kind: "projectile"; projectileClass: "ranged" | "magic" };

export interface AbilityDefinition {
  id: AbilityId;
  name: string;
  description: string;
  iconUrl: string;
  slotType: "combat";
  cooldownMs: number;
  requirements: AbilityRequirement[];
  targeting: AbilityTargetingDefinition;
  effects: AbilityEffectDefinition[];
  animation: AbilityAnimationDefinition;
}

export interface AbilitySlotPayload {
  slotIndex: number;
  abilityId: AbilityId | null;
}

export interface AbilityLoadoutPayload {
  slotCount: number;
  slots: AbilitySlotPayload[];
}

export const ABILITY_DEFINITIONS: Record<AbilityId, AbilityDefinition> = {
  whirlwind: {
    id: "whirlwind",
    name: "Whirlwind",
    description: "Strike all nearby enemies.",
    iconUrl: "assets/abilities/Ability_icons1_84.png",
    slotType: "combat",
    cooldownMs: 10_000,
    requirements: [
      { kind: "equipped_weapon_class", slot: "main_hand", weaponClass: "melee" },
    ],
    targeting: {
      kind: "self_area",
      radiusTiles: 1,
      shape: "square",
    },
    effects: [
      {
        kind: "damage",
        amount: 15,
        target: "enemies_in_area",
        damageClass: "melee",
      },
    ],
    animation: {
      kind: "radial_slash",
      radiusTiles: 1,
    },
  },
};

export const TEST_ABILITY_LOADOUT: AbilityLoadoutPayload = {
  slotCount: ABILITY_SLOT_COUNT,
  slots: Array.from({ length: ABILITY_SLOT_COUNT }, (_, slotIndex) => ({
    slotIndex,
    abilityId: slotIndex === 0 ? "whirlwind" : null,
  })),
};

export function getAbilityDefinition(abilityId: string) {
  return ABILITY_DEFINITIONS[abilityId as AbilityId] ?? null;
}
