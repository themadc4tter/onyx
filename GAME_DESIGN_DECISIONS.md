# Game Design Decisions

**Project:** Onyx  
**Purpose:** Living design log for turning the current multiplayer walking prototype into a specific game.

## Current Foundation

- Browser-based multiplayer game.
- Persistent always-on server.
- Shared world with no user-created lobbies.
- 2D movement across multiple zones.
- Current gameplay is intentionally minimal and used as an infrastructure placeholder.

## High-Level Direction

- The game should be multiplayer and aimed at being played with friends.
- The expected social group size is roughly 5-10 players, not a massive public MMO population.
- Player interaction should be core to the fun.
- The world should be persistent rather than split into individual matches or user-created lobbies.
- The design should not depend on a large macro economy like World of Warcraft or RuneScape.
- The preferred theme direction is a cozy-but-dangerous guild settlement.
- The settlement should feel warm, social, and welcoming, while dungeons and high-value outer areas provide danger and stakes.
- Detailed world context, lore, and storylines are intentionally deferred for later design.
- The game may use RPG-style group dungeons inspired by World of Warcraft instances.
- Outside dungeons, players should have a wide range of trainable skills, inspired by RuneScape.

## World And Settlement

- The world should initially revolve around one large shared settlement.
- The settlement should act as the main social, crafting, skilling, trading, and dungeon-preparation hub.
- The design should preserve flexibility to add more settlements later.
- The main settlement should be mostly NPC-owned in early versions.
- Player housing, player-owned businesses, and player-owned crafting stations are possible later-stage features rather than MVP requirements.
- The overworld should mostly avoid normal combat, especially in general travel and settlement-adjacent areas.
- High-value overworld areas can be gated by a combination of threat zones and non-combat environmental hazards.
- Non-combat hazards can include effects such as darkness, poison mist, cold, unstable terrain, locks, or other skill/tool/consumable checks.
- Threat zones can make certain high-value areas dangerous without making overworld combat the baseline activity.
- Combat training and major combat rewards should primarily come from dungeons rather than overworld farming.
- High-value overworld resource nodes should be shared world nodes rather than per-player instanced nodes.
- Shared node scarcity and respawn rates should be tuned for the small expected player group.
- Shared resource nodes should use variable/randomized respawn timers rather than fully predictable timers.
- Finding rare shared resource nodes should mostly come from manually checking the world rather than tracking tools.
- Resource gathering should produce variable yields based on factors such as skill level, tools, and possibly specialization.
- Higher-level resource nodes should have hard minimum skill and/or tool requirements before players can gather them.

## Art Direction

- Art direction should be simple top-down pixel art.
- Settlement areas should lean warm, cozy, and readable.
- Dungeons and threat zones can use darker or higher-contrast palettes to communicate danger.
- MVP should prioritize readable assets and low animation burden over highly detailed custom art.
- MVP should establish a small custom visual identity rather than relying entirely on generic asset-pack placeholders.
- Custom art scope should stay tight around the compact MVP world, initial skills, player sprites, core UI icons, and first dungeon.

## Skills And Specialization

- The game should not rely on a single overall character level.
- Character progression should mostly come from individual skills, gear, abilities, specializations, and dungeon unlocks.
- Skills should prepare players for dungeons, unlock dungeon-related opportunities, and support independent non-dungeon play.
- The game should be enjoyable even for players who do not engage heavily with dungeon content.
- Players should not be able to trivially master every role or become better at everything just by playing much more than their friends.
- Skill progression should avoid hard profession limits like only being allowed to train two professions.
- A soft specialization system is preferred over strict skill caps.
- Skill progression should use a long XP curve with many incremental levels, closer to RuneScape than a small rank ladder.
- Skills should have a level cap of 100.
- Skill XP should use the Old School RuneScape cumulative XP curve stretched so this game's level 100 requires the same total XP as Old School RuneScape level 90: 5,346,332 XP.
- The generated XP table in `shared/src/skills.ts` is the source of truth for exact per-level requirements.
- XP checkpoint examples: level 10 requires 986 XP, level 20 requires 3,559 XP, level 50 requires 61,839 XP, level 75 requires 577,934 XP, and level 100 requires 5,346,332 XP.
- Important skill unlocks should be spread throughout the full 1-100 range, not front-loaded too early.
- Skill specialization should combine broad skill trees with interdependent recipes.
- Each skill can have sub-specialization branches that let players develop different identities within the same skill.
- Players should mostly choose skill sub-specializations through points or perks earned while leveling skills.
- Some crafting recipes should be discoverable as loot, similar to World of Warcraft recipe drops.
- Discoverable crafting recipes should include a mix of tradeable recipes and bound recipes.
- Recipe tradeability can depend on rarity, source, or intended prestige.
- Crafting outcomes can be variable for some skills, especially skills that create consumables.
- Variable crafting should be skill/output-specific rather than applying to every crafted item.
- Gear crafting can produce important endgame gear.
- Best-in-slot or near-best gear can come from both skills/crafting and dungeon loot, similar to early World of Warcraft.
- Crafted endgame gear should usually require rare materials, dungeon-sourced recipes or materials, and high skill levels.
- Powerful crafted gear can be made for other players, but the wearer should meet level requirements to equip or use it.
- Gear level requirements should mostly be based on combat skills.
- High-tier outputs should often require components or contributions from multiple skills, making cooperation more efficient than total self-sufficiency.
- Skills should support both passive/low-attention activities with lower XP or yield and active activities with better XP, yield, or control.
- RuneScape is a useful reference for the balance between relaxed skilling and more active training methods.

## Dungeon Structure

- Dungeons should create focused group content while avoiding persistent overworld respawn problems.
- Dungeons should include more randomness than World of Warcraft-style fixed instances so they stay fun when replayed.
- Dungeon entrances should exist out in the overworld rather than only through a town menu or central portal.
- Travel and exploration should matter for accessing dungeon content.
- Dungeon entrances should be fixed overworld locations.
- Dungeon randomness should primarily happen inside the dungeon rather than through rotating or temporary entrance locations.
- Starting a dungeon should require the participating group to gather physically at the dungeon entrance.
- Dungeon content should account for the small player base by supporting small groups.
- A 2-player dungeon should feel roughly equivalent to a standard dungeon for this game's audience size.
- A 5-player dungeon should feel more like a raid-scale event for this game's audience size.
- Possible dungeon tiers include 2-player, 3-player, and 5-player content.
- Dungeon difficulty should come from both dungeon location/level range and selectable difficulty tiers.
- Some dungeons should naturally be easier or harder based on intended level/progression.
- The same dungeon can also have Normal and Heroic difficulty tiers.
- Heroic difficulty should offer both better drop rates for some existing loot and exclusive loot.
- Players should complete a dungeon on Normal before unlocking its Heroic difficulty.

## Dungeon Randomness

- Preferred dungeon randomness sources are enemy pack variation, boss variants, and random dungeon events.
- Enemy packs can vary between runs using encounter templates.
- Dungeon trash packs should be both obstacles/pacing between bosses and a meaningful source of XP, resources, and occasional loot.
- Bosses can have different mechanic variants between runs.
- Random dungeon events can create surprises such as minibosses, treasure opportunities, hazards, special NPCs, or rare resource spawns.
- Dungeon randomness should mostly be discovered inside the run rather than fully known before choosing a loadout.
- Players should need to adapt during the dungeon, not only optimize beforehand.

## Combat

- Combat should be kept low-to-medium cost initially and revisited later if the rest of the game direction supports it.
- Combat progression should combine combat skills, inspired by RuneScape, with gear stats such as strength and stamina.
- MVP combat skills should be Melee, Ranged, and Magic.
- Combat skill names should stay simple and use the original names: Melee, Ranged, and Magic.
- Defense/Endurance is deferred until it has a more unique role and does not overlap too much with Melee's tanking/guarding path.
- Each MVP combat skill should start with two basic paths.
- Each MVP combat path should have roughly 2-3 abilities, matching the initial level 20-30 content scope.
- Combat skills should not be locked into single roles.
- Each combat skill can unlock offensive, defensive, support, or utility options.
- Support identity should come from ability choices and loadouts rather than a dedicated healer-only skill.
- Magic can include harmful spells as well as healing, shielding, or protective spells.
- Melee can include damaging attacks as well as tanking, guarding, or interception abilities.
- Ranged can include damaging attacks as well as traps, control, scouting, or utility.
- Combat skills should share the same XP curve as a form of soft specialization.
- Spreading combat progression across multiple combat skills should cost similar total XP to specializing deeply in one combat skill.
- Example: leveling Melee from 1 to 9 and Ranged from 1 to 2 could require similar total XP to leveling Melee from 1 to 10.
- Combat XP should go into a shared combat XP pool, and players choose which combat skill to level.
- Combat skills should initially progress mostly through using that combat style in combat.
- Non-combat combat-skill training methods, such as dummies, quests, or crafted manuals, can be considered later or used as secondary sources.
- Support-style combat XP rules are undecided and should be revisited once support mechanics are clearer.
- Most normal gear should have straightforward stats.
- Some rare boss drops can have special effects that change or augment abilities.
- Combat roles should be defined after the combat system is clearer.
- If combat emphasizes dodging abilities and personal execution, traditional tank requirements may be less important.
- Combat should support some form of class or specialization identity without permanently locking players into a class like World of Warcraft.
- Combat should combine auto-attacks, player abilities, and encounter mechanics.
- Auto-attacks should provide a baseline for gear, stats, and DPS checks.
- Initial auto-attack combat should work by clicking a target, then clicking Auto Attack as an ability, similar to World of Warcraft.
- Once Auto Attack is active, the player should periodically attack the selected target while the target remains in range.
- Initial melee auto-attack range should be any target within 1 tile, including diagonal tiles.
- Facing should not affect initial auto-attack range because the game does not currently have combat-facing rules.
- Player abilities should support moment-to-moment decisions such as interrupts, defensive actions, support, burst damage, or utility.
- Encounter mechanics can include dodging, interrupts, positioning, or other boss-specific rules.
- Boss complexity can vary: some bosses can be simple DPS checks while others can be more mechanically involved.
- A useful reference point is a lightweight 2D interpretation of World of Warcraft-style combat.
- There should be no player-vs-player combat in normal zones.
- PvP combat can exist as arena matches somewhere in the settlement.
- Arena PvP should have rewards attached eventually, but it needs careful design before implementation.
- Arena design must consider multi-account win trading, gear fairness, and fairness for support-oriented specializations.
- Arena PvP should be fleshed out later rather than treated as an MVP requirement.

## Combat Loadouts

- Players should choose a limited combat loadout before a dungeon run.
- A typical loadout should be around 4-5 active abilities.
- Builds that rely less on auto-attacks may be allowed 1-2 additional active abilities, for a rough upper range of 6 abilities.
- Players can learn or own many abilities, but only bring a limited subset into each dungeon run.
- Players should set or change their dungeon combat loadout at the dungeon entrance before starting the run.
- Loadouts should be treated as part of run preparation.

## Dungeon Items And Preparation

- Skill-created consumables should help players adapt to bad dungeon matchups after randomness is revealed.
- Alchemy and other skills can produce consumables that counter hazards, enemy types, boss variants, or difficult mechanics.
- Dungeon preparation should include deciding which consumables to bring, not only choosing combat abilities.
- Dungeon support items should include both permanently consumed items and reusable tools.
- Permanently consumed items should create an ongoing demand for skilling outputs.
- Reusable tools can provide longer-term progression through cooldowns, charges, repairs, upgrades, or durability.
- Dungeon support items should live in a separate inventory from combat abilities/loadouts.
- Item preparation and combat ability preparation should be related but distinct run-prep choices.
- The item inventory should mostly behave like a normal inventory rather than a special limited dungeon loadout.
- Dungeon item limits can be revisited later if unrestricted carrying undermines balance.

## Dungeon Rewards And Failure

- Dungeon loot should be sparse through low chances for rare/epic personal drops rather than one notable boss item for the whole group.
- Very rare loot is desirable because it can create long-term replay motivation.
- Boss loot should use personal loot-table rolls, similar to RuneScape bosses.
- Each participating player automatically gets their own roll on the boss loot table.
- Bosses and trash packs can occasionally drop uncommon/rare items.
- Item rarity tiers should include common, uncommon, rare, and epic.
- Higher rarity items are more likely to be bind-on-pickup rather than tradeable.
- Lower rarity items are more likely to remain tradeable and support the player economy.
- Dungeon failure should be moderately forgiving with unsecured run loot at risk.
- Players should keep permanent gear on death or wipe.
- Consumables used during the run are gone.
- Reusable tools may lose durability, charges, or require repair.
- Loot found during a dungeon run should be unsecured until completion, extraction, or a reward-banking point.
- A full party wipe should lose most or all unsecured run loot.
- Individual death should allow revival or recovery where appropriate, while full party wipes carry the main penalty.
- Longer or harder dungeons should include checkpoint-style reward banking.
- Reward-banking checkpoints can secure some run loot before final completion.
- Reward-banking checkpoints can act as a money sink.
- Securing loot mid-dungeon may require paying currency or another cost.

## Economy And Trade

- The game should have both general currency and materials/resources.
- General currency should not be an inventory item and should not occupy inventory slots.
- RuneScape is a useful reference for using both money and resources, while World of Warcraft is a useful reference for currency not occupying inventory.
- Players should mainly earn general currency through selling items to NPCs, dungeon coin rewards, and player trade.
- Early player trade should use direct player-to-player trading.
- An auction house or asynchronous market can be considered later.

## Candidate Core Loop

Persistent overworld skilling provides independent progression and preparation for replayable group dungeons, which provide rare shared loot and additional progression incentives.

## MVP Direction

- MVP should include both basic skills and one dungeon.
- MVP should test the combined loop: gather resources, craft basic supplies or gear, meet at a dungeon entrance, choose loadouts, complete a short dungeon, get personal loot rolls, and return to the settlement to trade, craft, or upgrade.
- MVP non-combat skills should be Mining, Smithing, Herbalism, Alchemy, Cooking, and Fishing.
- No additional non-combat skills are planned for MVP.
- MVP dungeon theme is deferred until lore/world context is developed.
- MVP social features should include chat, party/group system, direct trade, and dungeon ready/start flow at the entrance.
- MVP world should be compact.
- MVP skill content does not need to support the full level 1-100 range.
- MVP should target roughly level 20-30 worth of skill content.
- MVP gathering should include safe early areas, for example levels 1-10, and slightly riskier areas, for example levels 11-20.
- MVP world should include one main settlement, nearby safe gathering, a slightly riskier high-value gathering area, and one fixed dungeon entrance.
- MVP dungeon should be designed for 2 players.
- MVP dungeon should include a few trash packs, roughly 3-4, and one boss.
- MVP dungeon does not need run-to-run randomness initially.
- Dungeon randomness can be added after the base dungeon loop works.
- MVP dungeon should include Normal difficulty only.
- Heroic difficulty can be added after MVP.
- MVP dungeon failure/death penalty should be limited to repair costs.
- MVP repair costs should only trigger on dungeon death or wipe, not through general gear durability wear.
- Unsecured run loot, reward-banking checkpoints, and paid checkpoint banking can be added after MVP.

## Open Questions

- What is the high-level player fantasy?
- What should the core player motivation be?
- What is the world context around the cozy-but-dangerous guild settlement?
- What storylines, factions, or threats explain the settlement and nearby dungeons?
- Which genre best fits a solo developer building for small friend groups?
- How important should other players be to the experience?
- What is the primary verb after walking?
- Should the world permanently change over time?
- How deep should each skill's sub-specialization branches go?
- How often should high-tier recipes require cooperation across multiple skills?
- What should active skilling involve: timing, routing, minigames, risk, cooperation, choices, or resource optimization?
- How should skill level, tools, and specialization affect gathering yield?
- What player services and systems belong in the main settlement at MVP?
- What later player-ownership features would be most valuable: housing, shops, workshops, land, guild halls, or something else?
- Which overworld areas should use environmental hazards, and which should use threat zones?
- How wide should shared node respawn windows be?
- How should players discover fixed dungeon entrances: visible map locations, clues, skill checks, keys, quests, or exploration?
- Should early development support only 2-player and 5-player dungeons, or include a distinct 3-player tier too?
- How should combat specializations work without permanent classes?
- How should support-style combat skills gain XP without falling behind damage-focused skills?
- Which skills should produce dungeon-relevant consumables, and what problems should those consumables solve?
- Which dungeon support effects should be consumable-only versus reusable tool-based?
- How should normal inventory capacity and item stack sizes be balanced for dungeon preparation?
- How often should reward-banking checkpoints appear, and should using one affect final rewards?
- What currency/cost should reward-banking checkpoints use, and should the cost scale with dungeon tier or secured loot value?
- How should NPC sale prices be controlled so they create currency without making every item only a money token?
- What safeguards should direct trading have to prevent mistakes or abuse?
- What rules should settlement arena PvP use?
- What rewards can arena PvP offer without encouraging abuse or undermining PvE/skilling progression?
- Should arena PvP normalize gear, use brackets, or have separate PvP loadout rules?

## Rejected Directions

- No player-vs-player combat in normal zones.

## Notes

- Keep decisions short and explicit.
- Capture rejected ideas when useful so the same ground does not need to be re-litigated.
- Prefer an MVP loop that fits the existing permanent multiplayer world.
