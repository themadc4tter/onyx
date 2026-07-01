import type { EquipmentSlot } from "./items";

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

export interface RemotePlayerData {
  socketId: string;
  username: string;
  position: Position;
  equipment?: EquipmentPayload;
}

export interface PlayerMovedPayload extends Position {
  socketId: string;
}

export interface PlayerEquipmentChangedPayload {
  socketId: string;
  equipment: EquipmentPayload;
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

export interface ProfilePayload {
  profile: PlayerProfile;
  zoneId: string;
  position: Position;
  herbSpawns?: HerbSpawnState[];
  inventory?: InventoryPayload;
  equipment?: EquipmentPayload;
}

export interface ZoneChangedPayload {
  zoneId: string;
  position: Position;
  initPlayers: RemotePlayerData[];
  herbSpawns?: HerbSpawnState[];
  inventory?: InventoryPayload;
  equipment?: EquipmentPayload;
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
