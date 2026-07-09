# Skills Architecture

## Goal

Skills should become a generic progression system, not a set of one-off systems per skill. Herbalism is the first vertical slice, but the same architecture should support Mining, Smithing, Alchemy, Cooking, Fishing, combat skills, and later skills with their own unlocks and specialization trees.

The scalable rule is:

**Skills define content, gameplay systems define behavior, and the effect resolver connects them.**

## Current State

Skills currently store XP totals per skill. The client receives those XP totals and renders level progress.

Herbalism is still prototype-level:

- Herb pickup happens through the herb gathering flow.
- Moonleaf grants Herbalism XP directly in the pickup handler.
- The current Herbalism UI mock keeps unlock and specialization data in the HUD code.

That is fine for proving the loop, but real perks need a shared definition layer and server-owned validation.

## Recommended Shape

### 1. Shared Skill Definitions

Move unlocks, specialization paths, perk trees, effect descriptions, and UI labels into shared skill definition data.

The client uses this data to render the Skills UI. The server uses the same data to validate unlocks and resolve gameplay effects.

Suggested shared types:

```ts
interface SkillDefinition {
  id: SkillId;
  name: string;
  category: SkillCategory;
  perkPointLevels: number[];
  overview: SkillOverviewDefinition;
  unlocks: SkillUnlockDefinition[];
  specialization?: SkillSpecializationDefinition;
}

interface SkillUnlockDefinition {
  level: number;
  title: string;
  description: string;
  unlockType: "reagent" | "action" | "recipe" | "system" | "other";
}

interface SkillSpecializationDefinition {
  paths: SkillSpecializationPathDefinition[];
  perks: SkillPerkDefinition[];
}

interface SkillSpecializationPathDefinition {
  id: string;
  name: string;
  description: string;
}

interface SkillPerkDefinition {
  id: SkillPerkId;
  skillId: SkillId;
  pathId: string;
  name: string;
  description: string;
  requiredLevel?: number;
  pointCost: number;
  requiresPerks: SkillPerkId[];
  effects: SkillPerkEffectDefinition[];
}
```

### 2. Stable Perk IDs

Perk IDs should not use display names because names will change during design.

A good ID format is:

```text
<skillId>.p<pathNumber>.n<nodeNumber>
```

Examples:

```text
herbalism.p1.n01
herbalism.p1.n02
herbalism.p2.n01
herbalism.p3.n01
```

For Herbalism, the first path is Botanist, the second is Mycologist, and the third is Bloomkeeper:

| Path Number | Current Path Name | Meaning |
|---:|---|---|
| p1 | Botanist | Herb-focused path |
| p2 | Mycologist | Mushroom-focused path |
| p3 | Bloomkeeper | Bloomheart-focused path |

This is slightly clearer than `herbalism.perk1_1`, while keeping the same intention. It avoids locking the ID to the perk name. It also leaves room for future non-perk nodes if we ever need them.

Once a perk ships, its ID should never be renamed or renumbered. If the tree changes later, keep old IDs stable and add new IDs for new nodes.

Example mapping for the current Herbalism draft:

| Old Draft ID | Stable Perk ID | Path | Current Name |
|---|---|---|---|
| A | herbalism.p1.n01 | Botanist | Herb Collector |
| C | herbalism.p1.n02 | Botanist | Leafsense |
| F | herbalism.p1.n03 | Botanist | Herb Harvester |
| G | herbalism.p1.n04 | Botanist | Tide Greens |
| M | herbalism.p1.n05 | Botanist | Crimson Harvest |
| N | herbalism.p1.n06 | Botanist | Azure Harvest |
| O | herbalism.p1.n07 | Botanist | Violet Harvest |
| S | herbalism.p1.n08 | Botanist | Expert Herb Harvester |
| B | herbalism.p2.n01 | Mycologist | Mushroom Collector |
| D | herbalism.p2.n02 | Mycologist | Fungal Eye |
| H | herbalism.p2.n03 | Mycologist | Mushroom Harvester |
| I | herbalism.p2.n04 | Mycologist | Stonecap Lore |
| P | herbalism.p2.n05 | Mycologist | Pale Mycelia |
| Q | herbalism.p2.n06 | Mycologist | Earthen Mycelia |
| T | herbalism.p2.n07 | Mycologist | Expert Mushroom Harvester |
| E | herbalism.p3.n01 | Bloomkeeper | Bloomheart Instinct |
| J | herbalism.p3.n02 | Bloomkeeper | Herbal Prospecting |
| K | herbalism.p3.n03 | Bloomkeeper | Fungal Prospecting |
| L | herbalism.p3.n04 | Bloomkeeper | Living Core |
| R | herbalism.p3.n05 | Bloomkeeper | Heart of the Hoard |
| U | herbalism.p3.n06 | Bloomkeeper | Bloomkeeper's Gift |

### 3. Player Skill State

Keep current XP state, but add stored perk point balances and unlocked perks.

Players earn skill-specific perk points at specific levels:

```text
10, 20, 30, 40, 50, 60, 70, 80, 90
```

These points are not spent automatically. They are stored and can be spent later, like WoW talent points.

Rare events can also grant universal perk points. Universal perk points are account/player-level points that can be spent on any skill's perks.

Suggested database shape:

```text
player_skills
- user_id
- skill_id
- total_xp
- skill_perk_points_earned
- universal_perk_points_allocated
- updated_at

player_skill_perks
- user_id
- skill_id
- perk_id
- unlocked_at

player_universal_perk_points
- user_id
- available_points
- lifetime_points_earned
- updated_at

player_perk_point_grants
- id
- user_id
- skill_id nullable
- point_type
- points
- source
- source_ref nullable
- granted_at
```

`player_skills.skill_perk_points_earned` is the total number of skill-specific perk points earned from level milestones for that skill.

`player_skills.universal_perk_points_allocated` is the number of universal perk points currently invested into that skill.

`player_universal_perk_points.available_points` is the unspent universal balance that can still be allocated to any skill.

`player_skill_perks` should only track which perks are unlocked. It should not need to know which specific perk was paid for with a universal point.

Available points for a skill can be derived:

```text
skill tree capacity = skill_perk_points_earned + universal_perk_points_allocated
spent points = sum point cost of unlocked perks in that skill
available points in that skill tree = skill tree capacity - spent points
```

`player_perk_point_grants` is optional for the first implementation, but recommended. It gives us an audit trail and prevents duplicate grants from rare events or repeated milestone processing.

For milestone grants, `source_ref` should be stable and unique per player, skill, and milestone:

```text
skill:herbalism:level:20
skill:herbalism:level:30
```

For rare universal grants, `source_ref` should point to the event that created it:

```text
world_boss:first_kill:ancient_warden
dungeon_event:crystal_grove:2026-07-09
```

This makes point grants idempotent: if the server retries the same reward, it can see that the grant already happened.

### 4. Universal Points Are Skill-Level Budget

Universal points should be treated as extra budget allocated to a skill tree, not as a payment attached to a specific perk.

Example:

```text
A -> B -> C

A is unlocked while the player has skill-specific points.
B is unlocked after allocating 1 universal point into the skill.
C is unlocked later while the player has another skill-specific point.
```

In this situation, the universal point should not be considered "attached" to B. The active state is simply:

```text
Unlocked perks: A, B, C
Skill-specific points earned: 2
Universal points allocated to this skill: 1
Total tree capacity: 3
```

If the player refunds 1 universal point from that skill, the skill's tree capacity drops from 3 to 2. The tree is now over budget by 1 point, so the player must remove 1 point worth of perks while keeping the tree valid.

For a simple chain, C is the only leaf node, so C is removed and A -> B stays active:

```text
Unlocked perks: A, B
Skill-specific points earned: 2
Universal points allocated to this skill: 0
Total tree capacity: 2
```

For a branching tree, the player can choose which removable leaf node or dependent branch to refund. This is better UX than saying "B was the universal perk, so B and C must be removed."

### 5. Perk Point Awarding

Skill-specific perk points are awarded when a skill crosses a perk point milestone.

Example:

```text
Herbalism moves from level 19 to level 20
-> award +1 Herbalism perk point
-> increase player_skills.skill_perk_points_earned for Herbalism
```

If a player gains multiple milestone levels at once, award every crossed milestone:

```text
Herbalism moves from level 8 to level 31
-> crossed 10, 20, 30
-> award +3 Herbalism perk points
```

The award function should compare the previous level and the new level after XP is granted:

```ts
awardSkillPerkPointsForLevelUp(userId, skillId, previousLevel, newLevel)
```

The level milestones should live in shared skill definitions:

```ts
const DEFAULT_SKILL_PERK_POINT_LEVELS = [10, 20, 30, 40, 50, 60, 70, 80, 90];
```

Most skills can use the default schedule. A future skill can override it if needed.

Universal perk points are awarded by rare events:

```ts
grantUniversalPerkPoints(userId, points, source, sourceRef)
```

Examples of possible sources:

- World boss first kill.
- Rare exploration discovery.
- Seasonal or account milestone.
- Major quest reward.
- Very rare dungeon event.

Universal points should not belong to any one skill until they are spent.

### 6. Server-Owned Perk Validation

The client can preview perk availability, but the server owns the truth.

Add a server service with responsibilities like:

```ts
canUnlockPerk(userId, skillId, perkId)
unlockPerk(userId, skillId, perkId, spendUniversalIfNeeded)
getUnlockedPerks(userId, skillId)
getSkillProgressionPayload(userId)
grantSkillPerkPoints(userId, skillId, points, source, sourceRef)
grantUniversalPerkPoints(userId, points, source, sourceRef)
```

Validation should check:

- The skill exists.
- The perk exists and belongs to that skill.
- The player has the required skill level.
- The player has enough skill tree capacity, or enough available universal points to increase that skill's capacity.
- Required perks are already unlocked.
- The perk is not already unlocked.
- Any path-specific rules are satisfied.

For spending, the cleanest default is:

```text
Use existing skill tree capacity first.
If the skill tree is out of capacity, allocate a universal point into that skill if the player confirms or has enabled that behavior.
```

The UI should make it clear when an unlock will consume a universal point.

### 7. Refunding Universal Points

Because universal points are tracked per skill, refund items only need to know how many universal points are allocated to each skill.

For "refund one universal point":

```text
1. Choose a skill with universal_perk_points_allocated > 0.
2. Reduce that skill's universal_perk_points_allocated by 1.
3. Increase player_universal_perk_points.available_points by 1.
4. Recalculate whether the skill tree is over budget.
5. If over budget, ask the player to remove valid leaf perks or dependent branches until the tree is valid again.
```

For "refund all universal points":

```text
1. Find every skill with universal_perk_points_allocated > 0.
2. Move all allocated universal points back into player_universal_perk_points.available_points.
3. Set those skills' universal_perk_points_allocated to 0.
4. For each affected skill, prune or ask the player to prune unlocked perks until the tree is valid.
```

The pruning rule is:

```text
total unlocked perk cost <= skill_perk_points_earned + universal_perk_points_allocated
```

The tree also needs to remain structurally valid:

```text
Every unlocked perk must still have its required parent perks.
```

The safest first implementation is to only allow refunding removable leaf perks. Later, the UI can allow choosing a non-leaf perk and automatically refunding all dependent child perks.

### 8. Effect Resolver

Gameplay systems should not directly ask whether the player has a specific perk.

Instead of:

```ts
if (hasPerk(userId, "herbalism.p1.n01")) {
  // add Herb Collector behavior
}
```

They should ask a generic resolver:

```ts
resolveSkillEffects(userId, context)
```

For Herbalism gathering, the context might look like:

```ts
{
  action: "gather",
  skillId: "herbalism",
  itemId: "moonleaf",
  family: "herb",
  color: "red",
  zoneType: "overworld"
}
```

The resolver returns modifiers:

```ts
{
  doubleYieldChance: 0.12,
  xpBonusChance: 0.10,
  bloomheartDropChanceBonus: 0.01,
  revealNearestHerb: true
}
```

This keeps perk logic out of individual gameplay handlers and makes new skills easier to add.

## Effect Types

Most perks should be data-driven with typed effects:

```ts
type SkillPerkEffectDefinition =
  | {
      type: "double_yield_chance";
      family: "herb" | "mushroom" | "ore" | "fish" | string;
      chance: number;
    }
  | {
      type: "drop_chance_bonus";
      itemId: string;
      chance: number;
    }
  | {
      type: "unlock_action";
      action: string;
    }
  | {
      type: "reveal_nearest_node";
      family: string;
      trigger: "after_gather" | "manual" | string;
    }
  | {
      type: "prospect_reagent";
      family: string;
      consumesItem: boolean;
      chance: number;
      rewardItemId: string;
    };
```

Some special effects will still need custom handlers. The important rule is that custom behavior should live in effect handlers, not scattered checks throughout gameplay code.

## Herbalism Gathering Flow With Perks

The Herbalism gather flow should eventually become:

```text
Player picks node
-> Check required Herbalism level
-> Create gather context
-> Resolve active perk effects
-> Roll double yield
-> Roll Bloomheart bonus drops
-> Roll XP modifiers
-> Add inventory rewards
-> Grant Herbalism XP
-> Emit inventory, skill, and feedback events
```

The current hardcoded Moonleaf XP grant should move behind this flow.

## Example Herbalism Effect Definitions

```ts
{
  id: "herbalism.p1.n01",
  skillId: "herbalism",
  pathId: "botanist",
  name: "Herb Collector",
  effects: [
    {
      type: "double_yield_chance",
      family: "herb",
      chance: 0.04,
    },
  ],
}

{
  id: "herbalism.p3.n01",
  skillId: "herbalism",
  pathId: "bloomkeeper",
  name: "Bloomheart Instinct",
  requiresPerks: ["herbalism.p1.n01", "herbalism.p2.n01"],
  effects: [
    {
      type: "drop_chance_bonus",
      itemId: "bloomheart",
      chance: 0.01,
    },
  ],
}
```

For "requires A or B" style requirements, the final schema should support requirement groups instead of only a flat `requiresPerks` list:

```ts
requirements: [
  {
    type: "any_perk",
    perkIds: ["herbalism.p1.n01", "herbalism.p2.n01"],
  },
]
```

## Client Payloads

The client needs enough data to render:

- Skill XP and level progress.
- Available tree points for each skill.
- Available universal perk points.
- Universal perk points allocated into each skill.
- Unlocked perk IDs.
- Skill definitions, unlocks, paths, and perk tree data.
- Whether each perk is unlockable, locked, or already unlocked.

Definitions can ship with the client through shared code. Player-specific state should come from the server.

Suggested payload shape:

```ts
interface SkillProgressionPayload {
  universalPerkPoints: {
    available: number;
    lifetimeEarned: number;
  };
  skills: Array<{
    skillId: SkillId;
    totalXp: number;
    skillPerkPointsEarned: number;
    universalPerkPointsAllocated: number;
    availableTreePoints: number;
    unlockedPerkIds: SkillPerkId[];
  }>;
}
```

The client can derive most display states locally from definitions plus player state. The server should still validate every unlock request.

The Skills UI should show both balances:

```text
Herbalism perk points: 2
Universal points invested here: 1
Universal perk points: 1
```

When the player unlocks a Herbalism perk, the server checks whether the skill tree has available capacity. If not, it can allocate one or more universal points into Herbalism, record the unlocked perk, and send back the updated progression payload.

## Scaling To More Skills

Adding a new skill should usually require:

- Shared skill content.
- Shared unlock data.
- Shared perk definitions.
- Server effect handlers only if the skill introduces new behavior.
- Client rendering through the generic Skills UI.
- Tests for unlock rules and effect math.

Mining can use the same system for ore yield, gems, prospecting, cave nodes, and special node visibility.

Cooking can use it for burn chance, bonus servings, rare quality, recipe unlocks, and ingredient conservation.

Alchemy can use it for potion strength, batch size, rare outcomes, reagent substitution, and Bloomheart interactions.

## Implementation Order

1. Move Herbalism mock data out of the HUD and into shared skill definitions.
2. Add stable perk IDs and path IDs.
3. Add stored skill-specific perk points earned per skill.
4. Add stored universal perk point balance.
5. Add stored universal point allocation per skill.
6. Add server state for unlocked perks.
7. Award skill-specific perk points when XP causes milestone levels to be crossed.
8. Add rare-event hooks for universal perk point grants.
9. Add server unlock validation, universal allocation, and refund pruning.
10. Add the generic effect resolver.
11. Move Herbalism gathering through the effect resolver.
12. Update the Skills UI to render from shared definitions instead of hardcoded Herbalism mock data.
13. Add tests for point awards, universal point allocation, universal refunds, perk unlocking, requirement checks, and Herbalism gather effects.
