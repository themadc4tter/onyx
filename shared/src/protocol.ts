import type { EquipmentSlot } from "./items";
import type { SkillId } from "./skills";
import type { AbilityId, AbilityLoadoutPayload } from "./abilities";

export type Facing = "up" | "down" | "left" | "right";

export interface Position {
  tileX: number;
  tileY: number;
  facing: Facing;
}

export interface MovePayload extends Position {
  seq?: number;
}

export interface MoveAck {
  seq: number;
  position: Position;
}

export interface InventorySlotPayload {
  slotIndex: number;
  itemId: string;
  quantity: number;
}

export interface InventoryPayload {
  slotCount: number;
  slots: Array<InventorySlotPayload | null>;
}

export interface EquippedItemPayload {
  slot: EquipmentSlot;
  itemId: string;
}

export interface EquipmentPayload {
  slots: Record<EquipmentSlot, EquippedItemPayload | null>;
}

export interface SkillXpPayload {
  skillId: SkillId;
  totalXp: number;
  skillPerkPointsEarned: number;
  universalPerkPointsAllocated: number;
  availableTreePoints: number;
  unlockedPerkIds: string[];
}

export interface UniversalPerkPointsPayload {
  available: number;
  lifetimeEarned: number;
}

export interface SkillsPayload {
  skills: SkillXpPayload[];
  universalPerkPoints: UniversalPerkPointsPayload;
}

export interface AbilityUsePayload {
  slotIndex?: number;
  abilityId?: AbilityId;
  targetId?: string;
}

export interface AbilityUsedPayload {
  abilityId: AbilityId;
  casterSocketId: string;
  originTileX: number;
  originTileY: number;
  affectedMobIds: string[];
  cooldownMs: number;
}

export interface AbilityErrorPayload {
  message?: string;
}

export interface SkillXpGainedPayload {
  skillId: SkillId;
  xpGained: number;
  totalXp: number;
  skillPerkPointsGained?: number;
}

export interface SkillPerkUnlockPayload {
  skillId?: SkillId;
  perkId?: string;
  spendUniversalIfNeeded?: boolean;
}

export interface SkillPerkUnlockedPayload {
  skillId: SkillId;
  perkId: string;
  spentUniversalPoints: number;
}

export interface SkillUniversalPerkRefundPayload {
  skillId?: SkillId;
  refund?: "one" | "all";
}

export interface SkillUniversalPerkRefundedPayload {
  skillId: SkillId;
  refundedUniversalPoints: number;
  removedPerkIds: string[];
}

export interface RemotePlayerData {
  socketId: string;
  username: string;
  position: Position;
  equipment?: EquipmentPayload;
}

export interface PlayerCombatState {
  hp: number;
  maxHp: number;
  alive: boolean;
  /** Epoch ms when the player's combat tag expires. 0 (or any past timestamp) means not in combat. */
  combatEndsAt: number;
  /** Epoch ms when the current out-of-combat health regeneration window started. 0 means not regenerating. */
  healthRegenStartedAt: number;
  /** Epoch ms when the next out-of-combat health regeneration tick lands. 0 means not regenerating. */
  nextHealthRegenAt: number;
}

export interface PlayerMovedPayload extends Position {
  socketId: string;
}

export interface PlayerEquipmentChangedPayload {
  socketId: string;
  equipment: EquipmentPayload;
}

export interface PlayerCombatStatePayload extends PlayerCombatState {}

export interface PlayerDiedPayload {
  zoneId: string;
  position: Position;
  combat: PlayerCombatState;
}

export interface PlayerDamagedPayload {
  damage: number;
  combat: PlayerCombatState;
}

export interface PlayerLeftPayload {
  socketId: string;
}

export interface PlayerProfile {
  id: string;
  username: string;
}

export interface HerbSpawnState {
  id: string;
  tileX: number;
  tileY: number;
  itemId: string;
  available: boolean;
}

export interface MobSpawnState {
  id: string;
  spawnId: string;
  tileX: number;
  tileY: number;
  mobId: string;
  hp: number;
  maxHp: number;
  alive: boolean;
}

export interface ProfilePayload {
  profile: PlayerProfile;
  zoneId: string;
  position: Position;
  combat?: PlayerCombatState;
  herbSpawns?: HerbSpawnState[];
  mobSpawns?: MobSpawnState[];
  inventory?: InventoryPayload;
  equipment?: EquipmentPayload;
  skills?: SkillsPayload;
  abilities?: AbilityLoadoutPayload;
}

export interface ZoneChangedPayload {
  zoneId: string;
  position: Position;
  initPlayers: RemotePlayerData[];
  combat?: PlayerCombatState;
  herbSpawns?: HerbSpawnState[];
  mobSpawns?: MobSpawnState[];
  inventory?: InventoryPayload;
  equipment?: EquipmentPayload;
  skills?: SkillsPayload;
  abilities?: AbilityLoadoutPayload;
}

export type ChatChannel = "zone" | "world";
export type ChatMessageChannel = ChatChannel | "system";

export interface ChatSendPayload {
  channel?: ChatChannel;
  text?: string;
}

export interface NormalizedChatPayload {
  channel: ChatChannel;
  text: string;
}

export interface ChatMessage {
  id: string;
  channel: ChatMessageChannel;
  username: string;
  text: string;
  sentAt: string;
}

export interface ChatErrorPayload {
  message?: string;
}

export interface HerbPickPayload {
  id?: string;
}

export interface HerbStatePayload {
  id: string;
  available: boolean;
}

export interface HerbPickedPayload {
  itemId?: string;
  itemName?: string;
  quantity?: number;
  bonusQuantity?: number;
}

export interface MobStatePayload extends MobSpawnState {}

export interface MobAutoAttackPayload {
  id?: string;
}

export interface MobMeleeImpactPayload {
  attackerSocketId: string;
  targetId: string;
  originTileX: number;
  originTileY: number;
  targetTileX: number;
  targetTileY: number;
}

export interface PlayerMeleeImpactPayload {
  attackerId: string;
  targetSocketId: string;
  originTileX: number;
  originTileY: number;
  targetTileX: number;
  targetTileY: number;
}

export interface MobProjectileFiredPayload {
  projectileId: string;
  projectileClass: "ranged" | "magic";
  attackerSocketId: string;
  targetId: string;
  originTileX: number;
  originTileY: number;
  targetTileX: number;
  targetTileY: number;
  durationMs: number;
}

export interface InventoryMovePayload {
  fromSlotIndex?: number;
  toSlotIndex?: number;
}

export interface InventorySplitPayload {
  fromSlotIndex?: number;
  quantity?: number;
}

export interface InventoryDeletePayload {
  slotIndex?: number;
}

export interface EquipmentEquipPayload {
  inventorySlotIndex?: number;
}

export interface EquipmentUnequipPayload {
  slot?: string;
}

export interface TradeOfferItem {
  slotIndex: number;
  itemId: string;
  quantity: number;
}

export interface TradeStatePayload {
  id: string;
  partnerUsername: string;
  ownOffer: TradeOfferItem[];
  otherOffer: TradeOfferItem[];
  ownAccepted: boolean;
  otherAccepted: boolean;
}

export interface TradeRequestPayload {
  targetSocketId?: string;
}

export interface TradeRequestResponsePayload {
  requestId?: string;
}

export interface TradeOfferPayload {
  slotIndex?: number;
  quantity?: number;
}

export interface TradeRemoveOfferPayload {
  slotIndex?: number;
}

export interface TradeSetAcceptedPayload {
  accepted?: boolean;
}

export interface TradeRequestSentPayload {
  requestId?: string;
  targetUsername?: string;
}

export interface TradeRequestReceivedPayload {
  requestId?: string;
  fromUsername?: string;
}

export interface TradeDeclinedPayload {
  byUsername?: string;
}

export interface TradeCancelledPayload {
  reason?: string;
}

export interface TradeErrorPayload {
  message?: string;
}
