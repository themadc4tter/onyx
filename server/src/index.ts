import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import cors from "cors";
import { supabase } from "./lib/supabase";
import { isTileWalkable, normalizeZoneId, ZONES, type HerbSpawn, type ZoneExit } from "./config/map";
import {
  addItemToInventory,
  deleteInventoryItem,
  flushAllDirtyInventories,
  flushDirtyInventory,
  getInventory,
  loadInventory,
  markInventoryDirty,
  moveInventoryItem,
  saveInventory,
  splitInventoryStack,
} from "./game/inventory";
import {
  equipInventoryItem,
  getEquipment,
  loadEquipment,
  saveEquipment,
  unequipItem,
} from "./game/equipment";
import { getItemDefinition } from "./game/items";
import {
  acceptTradeRequest,
  addTradeOfferItem,
  cancelTradeForUser,
  confirmTrade,
  createTradeRequest,
  declineTradeRequest,
  getTradeParticipants,
  getTradeStateForUser,
  removeTradeOfferItem,
  setTradeLocked,
  type TradeParticipant,
  type TradeSession,
} from "./game/trading";

const PORT = process.env.PORT ?? 3001;
const CLIENT_URL = process.env.CLIENT_URL ?? "http://localhost:5173";

type Facing = "up" | "down" | "left" | "right";
type ChatChannel = "zone" | "world";
interface Position { tileX: number; tileY: number; facing: Facing; }
interface MovePayload extends Position { seq?: number; }
interface MoveAck { seq: number; position: Position; }
interface ChatSendPayload { channel?: ChatChannel; text?: string; }
interface NormalizedChatPayload { channel: ChatChannel; text: string; }
interface ChatMessage {
  id: string;
  channel: ChatChannel;
  username: string;
  text: string;
  sentAt: string;
}
interface HerbSpawnState extends HerbSpawn {
  available: boolean;
}
interface HerbPickPayload {
  id?: string;
}
interface InventoryPayload {
  slotCount: number;
  slots: ReturnType<typeof getInventory>["slots"];
}
interface InventoryMovePayload {
  fromSlotIndex?: number;
  toSlotIndex?: number;
}
interface InventorySplitPayload {
  fromSlotIndex?: number;
  quantity?: number;
}
interface InventoryDeletePayload {
  slotIndex?: number;
}
interface EquipmentPayload {
  slots: ReturnType<typeof getEquipment>["slots"];
}
interface EquipmentEquipPayload {
  inventorySlotIndex?: number;
}
interface EquipmentUnequipPayload {
  slot?: string;
}
interface TradeRequestPayload {
  targetSocketId?: string;
}
interface TradeRequestResponsePayload {
  requestId?: string;
}
interface TradeOfferPayload {
  slotIndex?: number;
  quantity?: number;
}
interface TradeRemoveOfferPayload {
  slotIndex?: number;
}
interface ConnectedPlayer {
  socketId: string;
  userId: string;
  username: string;
  position: Position;
  zoneId: string;
  lastMoveAt: number;
  lastProcessedMoveSeq: number;
  lastChatAt: number;
}

const connectedPlayers = new Map<string, ConnectedPlayer>();
const MOVE_INTERVAL_MS = 120;
const MOVE_RATE_TOLERANCE_MS = 30;
const MIN_MOVE_INTERVAL_MS = MOVE_INTERVAL_MS - MOVE_RATE_TOLERANCE_MS;
const CHAT_RATE_LIMIT_MS = 800;
const MAX_CHAT_LENGTH = 240;
const HERB_RESPAWN_MS = 10_000;
const TRADE_RANGE_TILES = 5;
const herbSpawnStates = new Map<string, Map<string, HerbSpawnState>>();

// Debounced position saves: map of socketId → pending timeout
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

async function savePosition(userId: string, zoneId: string, pos: Position) {
  await supabase.from("player_state").upsert({
    user_id:    userId,
    zone_id:    zoneId,
    tile_x:     pos.tileX,
    tile_y:     pos.tileY,
    facing:     pos.facing,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
}

function scheduleSave(socketId: string, userId: string, zoneId: string, pos: Position) {
  const existing = saveTimers.get(socketId);
  if (existing) clearTimeout(existing);
  saveTimers.set(socketId, setTimeout(() => {
    saveTimers.delete(socketId);
    savePosition(userId, zoneId, pos).catch(console.error);
  }, 5000));
}

function flushSave(socketId: string, userId: string, zoneId: string, pos: Position) {
  const existing = saveTimers.get(socketId);
  if (existing) { clearTimeout(existing); saveTimers.delete(socketId); }
  savePosition(userId, zoneId, pos).catch(console.error);
}

function emitMoveAck(socket: Socket, seq: number, position: Position) {
  const ack: MoveAck = { seq, position };
  socket.emit("move:ack", ack);
}

function getHerbSpawnStates(zoneId: string) {
  const zone = ZONES[zoneId];
  if (!zone) return [];

  let zoneStates = herbSpawnStates.get(zoneId);
  if (!zoneStates) {
    zoneStates = new Map();
    herbSpawnStates.set(zoneId, zoneStates);
  }

  for (const spawn of zone.herbSpawns) {
    if (!zoneStates.has(spawn.id)) {
      zoneStates.set(spawn.id, { ...spawn, available: true });
    }
  }

  return [...zoneStates.values()];
}

function getHerbSpawnState(zoneId: string, herbId: string) {
  getHerbSpawnStates(zoneId);
  return herbSpawnStates.get(zoneId)?.get(herbId) ?? null;
}

function getInventoryPayload(userId: string): InventoryPayload {
  const inventory = getInventory(userId);
  return {
    slotCount: inventory.slotCount,
    slots: inventory.slots.map(slot => slot ? { ...slot } : null),
  };
}

function getEquipmentPayload(userId: string): EquipmentPayload {
  const equipment = getEquipment(userId);
  return {
    slots: Object.fromEntries(
      Object.entries(equipment.slots).map(([slot, item]) => [slot, item ? { ...item } : null]),
    ) as EquipmentPayload["slots"],
  };
}

function getPlayerSnapshot(player: ConnectedPlayer) {
  return {
    socketId: player.socketId,
    username: player.username,
    position: player.position,
    equipment: getEquipmentPayload(player.userId),
  };
}

function getInventoryErrorMessage(error?: string) {
  const messages: Record<string, string> = {
    empty_source: "That inventory slot is empty.",
    empty_equipment_slot: "That equipment slot is empty.",
    inventory_full: "Inventory is full.",
    invalid_equipment_slot: "That equipment slot is not valid.",
    invalid_quantity: "That stack cannot be split that way.",
    invalid_slot: "That inventory slot is not valid.",
    not_equipment: "That item cannot be equipped.",
    unknown_item: "That item is not available.",
  };

  return messages[error ?? ""] ?? "Inventory action failed.";
}

function getTradeErrorMessage(error?: string) {
  const messages: Record<string, string> = {
    already_trading: "One of you is already trading.",
    invalid_offer: "That item cannot be offered.",
    not_locked: "Both players must lock the trade first.",
    not_trading: "You are not in a trade.",
    out_of_range: "You are too far away to trade.",
    request_not_found: "That trade request is no longer available.",
    request_pending: "A trade request is already pending.",
    self_trade: "You cannot trade with yourself.",
    target_unavailable: "That player is not available to trade.",
    trade_failed: "Trade failed.",
    trade_locked: "Unlock the trade before changing your offer.",
    inventory_full: "One of you does not have enough inventory space.",
  };

  return messages[error ?? ""] ?? "Trade action failed.";
}

function emitInventoryActionResult(socket: Socket, userId: string, ok: boolean, error?: string) {
  if (!ok) {
    socket.emit("chat:error", { message: getInventoryErrorMessage(error) });
  }

  socket.emit("inventory:changed", getInventoryPayload(userId));
}

function emitEquipmentActionResult(socket: Socket, userId: string, ok: boolean, error?: string) {
  if (!ok) {
    socket.emit("chat:error", { message: getInventoryErrorMessage(error) });
  }

  socket.emit("inventory:changed", getInventoryPayload(userId));
  socket.emit("equipment:changed", getEquipmentPayload(userId));
}

function normalizeChatPayload(payload: unknown): NormalizedChatPayload | null {
  const candidate = payload as ChatSendPayload;
  const channel = candidate?.channel;
  const text = typeof candidate?.text === "string" ? candidate.text.trim() : "";

  if ((channel !== "zone" && channel !== "world") || text.length === 0) {
    return null;
  }

  return {
    channel,
    text: text.slice(0, MAX_CHAT_LENGTH),
  };
}

function getPlayerByUserId(userId: string) {
  return [...connectedPlayers.values()].find(player => player.userId === userId) ?? null;
}

function getTradeParticipant(player: ConnectedPlayer): TradeParticipant {
  return {
    userId: player.userId,
    socketId: player.socketId,
    username: player.username,
  };
}

function arePlayersCloseEnoughToTrade(a: ConnectedPlayer, b: ConnectedPlayer) {
  if (a.zoneId !== b.zoneId) return false;

  const dx = Math.abs(a.position.tileX - b.position.tileX);
  const dy = Math.abs(a.position.tileY - b.position.tileY);
  return Math.max(dx, dy) <= TRADE_RANGE_TILES;
}

function emitTradeError(socket: Socket, error?: string) {
  socket.emit("trade:error", { message: getTradeErrorMessage(error) });
}

function emitTradeUpdate(io: Server, session: TradeSession) {
  for (const participant of getTradeParticipants(session)) {
    const state = getTradeStateForUser(session, participant.userId);
    if (!state) continue;
    io.to(participant.socketId).emit("trade:updated", state);
  }
}

function cancelTrade(io: Server, userId: string, reason: string) {
  const session = cancelTradeForUser(userId);
  if (!session) return;

  for (const participant of getTradeParticipants(session)) {
    io.to(participant.socketId).emit("trade:cancelled", { reason });
  }
}

function validateTradeParticipantsInRange(session: TradeSession) {
  const first = getPlayerByUserId(session.a.userId);
  const second = getPlayerByUserId(session.b.userId);
  return Boolean(first && second && arePlayersCloseEnoughToTrade(first, second));
}

async function handleZoneTransition(io: Server, socket: Socket, exit: ZoneExit) {
  const oldZoneId = socket.data.zoneId as string;
  const newZoneId = exit.toZoneId;
  const newPos: Position = { tileX: exit.toTileX, tileY: exit.toTileY, facing: "down" };

  const newZonePlayers = [...connectedPlayers.values()]
    .filter(p => p.zoneId === newZoneId)
    .map(getPlayerSnapshot);

  const player = connectedPlayers.get(socket.id)!;
  cancelTrade(io, player.userId, "movement");
  player.position = newPos;
  player.zoneId   = newZoneId;
  player.lastMoveAt = 0;
  player.lastProcessedMoveSeq = 0;
  socket.data.position = newPos;
  socket.data.zoneId   = newZoneId;

  socket.leave(oldZoneId);
  await socket.join(newZoneId);

  io.to(oldZoneId).emit("player:left",   { socketId: socket.id });
  socket.to(newZoneId).emit("player:joined", getPlayerSnapshot(player));
  socket.emit("zone:changed", {
    zoneId: newZoneId,
    position: newPos,
    initPlayers: newZonePlayers,
    herbSpawns: getHerbSpawnStates(newZoneId),
    inventory: getInventoryPayload(player.userId),
    equipment: getEquipmentPayload(player.userId),
  });

  flushSave(socket.id, player.userId, newZoneId, newPos);
  console.log(`[zone]       ${socket.id} (${player.username}) ${oldZoneId} → ${newZoneId}`);
}

// ─── Express + Socket.io ────────────────────────────────────────────────────

const app = express();
app.use(cors({ origin: CLIENT_URL }));
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    players: connectedPlayers.size,
    heapMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
  });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: CLIENT_URL },
  pingInterval: 15000,
  pingTimeout:  10000,
});

io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token as string | undefined;
  if (!token) return next(new Error("no_token"));
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return next(new Error("invalid_token"));
  socket.data.userId = user.id;
  next();
});

io.on("connection", async (socket) => {
  if (connectedPlayers.size >= 50) {
    socket.emit("error", "server_full");
    socket.disconnect(true);
    return;
  }

  const userId = socket.data.userId as string;

  const [{ data: profile }, { data: state }] = await Promise.all([
    supabase.from("profiles").select("id, username").eq("id", userId).single(),
    supabase.from("player_state").select("zone_id, tile_x, tile_y, facing").eq("user_id", userId).single(),
  ]);
  await Promise.all([
    loadInventory(userId),
    loadEquipment(userId),
  ]);

  const username = profile?.username ?? userId;

  const hasSavedZone = Boolean(state?.zone_id && ZONES[state.zone_id]);

  // Resolve zone, falling back to the current single Tiled settlement map.
  const zoneId = normalizeZoneId(state?.zone_id);
  const zone = ZONES[zoneId]!;

  // Resolve position (saved → zone spawn)
  let startPos: Position = {
    tileX:  hasSavedZone ? (state?.tile_x ?? zone.spawn.x) : zone.spawn.x,
    tileY:  hasSavedZone ? (state?.tile_y ?? zone.spawn.y) : zone.spawn.y,
    facing: (state?.facing as Facing) ?? "down",
  };

  // Safety: ensure saved position is actually walkable (e.g. map changed)
  if (!isTileWalkable(zoneId, startPos.tileX, startPos.tileY)) {
    startPos = { tileX: zone.spawn.x, tileY: zone.spawn.y, facing: "down" };
  }

  socket.data.position = startPos;
  socket.data.zoneId   = zoneId;

  // Snapshot players in the same zone before adding self
  const others = [...connectedPlayers.values()]
    .filter(p => p.zoneId === zoneId)
    .map(getPlayerSnapshot);
  socket.emit("players:init", others);

  connectedPlayers.set(socket.id, {
    socketId: socket.id,
    userId,
    username,
    position: startPos,
    zoneId,
    lastMoveAt: 0,
    lastProcessedMoveSeq: 0,
    lastChatAt: 0,
  });

  await socket.join(zoneId);
  socket.to(zoneId).emit("player:joined", getPlayerSnapshot(connectedPlayers.get(socket.id)!));

  console.log(`[connect]    ${socket.id} (${username}) → ${zoneId} — ${connectedPlayers.size} online`);

  socket.emit("profile", {
    profile,
    position: startPos,
    zoneId,
    herbSpawns: getHerbSpawnStates(zoneId),
    inventory: getInventoryPayload(userId),
    equipment: getEquipmentPayload(userId),
  });

  // ─── Move ─────────────────────────────────────────────────────────────────

  socket.on("move", async (payload: unknown) => {
    const { seq = 0, tileX, tileY, facing } = payload as MovePayload;
    const current: Position = socket.data.position;
    const currentZoneId: string = socket.data.zoneId;

    const now = Date.now();
    const player = connectedPlayers.get(socket.id);
    if (!player) {
      emitMoveAck(socket, seq, current);
      return;
    }

    if (seq <= player.lastProcessedMoveSeq) {
      emitMoveAck(socket, seq, current);
      return;
    }

    if (player.lastMoveAt > 0 && now - player.lastMoveAt < MIN_MOVE_INTERVAL_MS) {
      emitMoveAck(socket, seq, current);
      return;
    }

    const dx = Math.abs(tileX - current.tileX);
    const dy = Math.abs(tileY - current.tileY);
    const isOneStep = (dx === 1 && dy === 0) || (dx === 0 && dy === 1);

    if (!isOneStep || !isTileWalkable(currentZoneId, tileX, tileY)) {
      emitMoveAck(socket, seq, current);
      return;
    }

    const accepted: Position = { tileX, tileY, facing };
    socket.data.position = accepted;
    player.position = accepted;
    player.lastMoveAt = now;
    player.lastProcessedMoveSeq = seq;
    cancelTrade(io, player.userId, "movement");

    // Check for zone exit
    const currentZone = ZONES[currentZoneId];
    const exit = currentZone?.exits.find(e => e.tileX === tileX && e.tileY === tileY);
    if (exit) {
      await handleZoneTransition(io, socket, exit);
      return;
    }

    emitMoveAck(socket, seq, accepted);
    socket.to(currentZoneId).emit("player:moved", { socketId: socket.id, tileX, tileY, facing });
    scheduleSave(socket.id, player.userId, currentZoneId, accepted);
  });

  socket.on("chat:send", (payload: unknown) => {
    const player = connectedPlayers.get(socket.id);
    if (!player) {
      socket.emit("chat:error", { message: "You are not connected to chat." });
      return;
    }

    const normalized = normalizeChatPayload(payload);
    if (!normalized) {
      socket.emit("chat:error", { message: "Message could not be sent." });
      return;
    }

    const now = Date.now();
    if (now - player.lastChatAt < CHAT_RATE_LIMIT_MS) {
      socket.emit("chat:error", { message: "You are sending messages too quickly." });
      return;
    }

    player.lastChatAt = now;

    const message: ChatMessage = {
      id: `${now}-${socket.id}`,
      channel: normalized.channel,
      username: player.username,
      text: normalized.text,
      sentAt: new Date(now).toISOString(),
    };

    if (message.channel === "zone") {
      io.to(player.zoneId).emit("chat:message", message);
      return;
    }

    io.emit("chat:message", message);
  });

  socket.on("trade:request", (payload: TradeRequestPayload) => {
    const player = connectedPlayers.get(socket.id);
    const target = payload?.targetSocketId ? connectedPlayers.get(payload.targetSocketId) : null;
    if (!player || !target) {
      emitTradeError(socket, "target_unavailable");
      return;
    }

    if (!arePlayersCloseEnoughToTrade(player, target)) {
      emitTradeError(socket, "out_of_range");
      return;
    }

    const result = createTradeRequest(getTradeParticipant(player), getTradeParticipant(target));
    if (!result.ok || !result.request) {
      emitTradeError(socket, result.error);
      return;
    }

    socket.emit("trade:requestSent", {
      requestId: result.request.id,
      targetUsername: target.username,
    });
    io.to(target.socketId).emit("trade:request", {
      requestId: result.request.id,
      fromUsername: player.username,
    });
  });

  socket.on("trade:decline", (payload: TradeRequestResponsePayload) => {
    const player = connectedPlayers.get(socket.id);
    if (!player || !payload?.requestId) return;

    const result = declineTradeRequest(player.userId, payload.requestId);
    if (!result.ok || !result.request) {
      emitTradeError(socket, result.error);
      return;
    }

    io.to(result.request.from.socketId).emit("trade:declined", {
      byUsername: player.username,
    });
  });

  socket.on("trade:accept", (payload: TradeRequestResponsePayload) => {
    const player = connectedPlayers.get(socket.id);
    if (!player || !payload?.requestId) return;

    const result = acceptTradeRequest(player.userId, payload.requestId);
    if (!result.ok || !result.session) {
      emitTradeError(socket, result.error);
      return;
    }

    if (!validateTradeParticipantsInRange(result.session)) {
      cancelTrade(io, player.userId, "range");
      emitTradeError(socket, "out_of_range");
      return;
    }

    for (const participant of getTradeParticipants(result.session)) {
      const state = getTradeStateForUser(result.session, participant.userId);
      if (state) io.to(participant.socketId).emit("trade:started", state);
    }
  });

  socket.on("trade:addItem", (payload: TradeOfferPayload) => {
    const player = connectedPlayers.get(socket.id);
    if (!player) return;

    const result = addTradeOfferItem(
      player.userId,
      Number(payload?.slotIndex),
      Number(payload?.quantity),
    );
    if (!result.ok || !result.session) {
      emitTradeError(socket, result.error);
      return;
    }

    emitTradeUpdate(io, result.session);
  });

  socket.on("trade:removeItem", (payload: TradeRemoveOfferPayload) => {
    const player = connectedPlayers.get(socket.id);
    if (!player) return;

    const result = removeTradeOfferItem(player.userId, Number(payload?.slotIndex));
    if (!result.ok || !result.session) {
      emitTradeError(socket, result.error);
      return;
    }

    emitTradeUpdate(io, result.session);
  });

  socket.on("trade:lock", (payload: { locked?: boolean }) => {
    const player = connectedPlayers.get(socket.id);
    if (!player) return;

    const result = setTradeLocked(player.userId, payload?.locked !== false);
    if (!result.ok || !result.session) {
      emitTradeError(socket, result.error);
      return;
    }

    emitTradeUpdate(io, result.session);
  });

  socket.on("trade:cancel", () => {
    const player = connectedPlayers.get(socket.id);
    if (!player) return;

    cancelTrade(io, player.userId, "cancelled");
  });

  socket.on("trade:confirm", async () => {
    const player = connectedPlayers.get(socket.id);
    if (!player) return;

    const activeResult = setTradeLocked(player.userId, true);
    if (!activeResult.ok || !activeResult.session) {
      emitTradeError(socket, activeResult.error);
      return;
    }

    if (!validateTradeParticipantsInRange(activeResult.session)) {
      cancelTrade(io, player.userId, "range");
      return;
    }

    const result = confirmTrade(player.userId);
    if (!result.ok || !result.session) {
      emitTradeError(socket, result.error);
      if (result.session) emitTradeUpdate(io, result.session);
      return;
    }

    if (!result.completed) {
      emitTradeUpdate(io, result.session);
      return;
    }

    await Promise.all([
      saveInventory(result.session.a.userId),
      saveInventory(result.session.b.userId),
    ]).catch(error => {
      console.error("[trade] failed to save completed trade", error);
    });

    for (const participant of getTradeParticipants(result.session)) {
      io.to(participant.socketId).emit("inventory:changed", getInventoryPayload(participant.userId));
      io.to(participant.socketId).emit("trade:completed");
    }
  });

  socket.on("herb:pick", (payload: HerbPickPayload) => {
    const player = connectedPlayers.get(socket.id);
    const herbId = payload?.id;
    if (!player || !herbId) return;

    const spawn = getHerbSpawnState(player.zoneId, herbId);
    if (
      !spawn ||
      !spawn.available ||
      spawn.tileX !== player.position.tileX ||
      spawn.tileY !== player.position.tileY
    ) {
      return;
    }

    const addResult = addItemToInventory(player.userId, spawn.itemId, 1);
    const item = getItemDefinition(spawn.itemId);
    if (!addResult.ok) {
      socket.emit("chat:error", { message: "Inventory is full." });
      return;
    }

    spawn.available = false;
    io.to(player.zoneId).emit("herb:state", { id: spawn.id, available: false });
    socket.emit("inventory:changed", getInventoryPayload(player.userId));
    socket.emit("herb:picked", { itemId: spawn.itemId, itemName: item?.name ?? spawn.itemId });
    markInventoryDirty(player.userId);

    setTimeout(() => {
      spawn.available = true;
      io.to(player.zoneId).emit("herb:state", { id: spawn.id, available: true });
    }, HERB_RESPAWN_MS);
  });

  socket.on("inventory:move", (payload: InventoryMovePayload) => {
    const player = connectedPlayers.get(socket.id);
    if (!player) return;

    const result = moveInventoryItem(
      player.userId,
      Number(payload?.fromSlotIndex),
      Number(payload?.toSlotIndex),
    );

    if (result.ok) markInventoryDirty(player.userId);
    emitInventoryActionResult(socket, player.userId, result.ok, result.error);
  });

  socket.on("inventory:split", (payload: InventorySplitPayload) => {
    const player = connectedPlayers.get(socket.id);
    if (!player) return;

    const result = splitInventoryStack(
      player.userId,
      Number(payload?.fromSlotIndex),
      Number(payload?.quantity),
    );

    if (result.ok) markInventoryDirty(player.userId);
    emitInventoryActionResult(socket, player.userId, result.ok, result.error);
  });

  socket.on("inventory:delete", (payload: InventoryDeletePayload) => {
    const player = connectedPlayers.get(socket.id);
    if (!player) return;

    const result = deleteInventoryItem(player.userId, Number(payload?.slotIndex));
    if (result.ok) markInventoryDirty(player.userId);
    emitInventoryActionResult(socket, player.userId, result.ok, result.error);
  });

  socket.on("equipment:equip", async (payload: EquipmentEquipPayload) => {
    const player = connectedPlayers.get(socket.id);
    if (!player) return;

    const result = equipInventoryItem(
      player.userId,
      Number(payload?.inventorySlotIndex),
    );

    if (result.ok) {
      await Promise.all([
        saveInventory(player.userId, result.inventory),
        saveEquipment(player.userId, result.equipment),
      ]).catch(error => {
        console.error(`[equipment] failed to save equipped item for ${player.userId}`, error);
        socket.emit("chat:error", { message: "Equipment could not be saved." });
      });
    }

    emitEquipmentActionResult(socket, player.userId, result.ok, result.error);
    if (result.ok) {
      socket.to(player.zoneId).emit("player:equipmentChanged", {
        socketId: socket.id,
        equipment: getEquipmentPayload(player.userId),
      });
    }
  });

  socket.on("equipment:unequip", async (payload: EquipmentUnequipPayload) => {
    const player = connectedPlayers.get(socket.id);
    if (!player) return;

    const result = unequipItem(player.userId, payload?.slot ?? "");

    if (result.ok) {
      await Promise.all([
        saveInventory(player.userId, result.inventory),
        saveEquipment(player.userId, result.equipment),
      ]).catch(error => {
        console.error(`[equipment] failed to save unequipped item for ${player.userId}`, error);
        socket.emit("chat:error", { message: "Equipment could not be saved." });
      });
    }

    emitEquipmentActionResult(socket, player.userId, result.ok, result.error);
    if (result.ok) {
      socket.to(player.zoneId).emit("player:equipmentChanged", {
        socketId: socket.id,
        equipment: getEquipmentPayload(player.userId),
      });
    }
  });

  // ─── Disconnect ────────────────────────────────────────────────────────────

  socket.on("disconnect", async () => {
    const player = connectedPlayers.get(socket.id);
    if (player) {
      cancelTrade(io, player.userId, "disconnect");
      flushSave(socket.id, player.userId, player.zoneId, player.position);
      await flushDirtyInventory(player.userId).catch(error => {
        console.error(`[inventory] failed to flush inventory for ${player.userId} on disconnect`, error);
      });
    }
    connectedPlayers.delete(socket.id);
    io.to(socket.data.zoneId as string).emit("player:left", { socketId: socket.id });
    console.log(`[disconnect] ${socket.id} (${username}) — ${connectedPlayers.size} online`);
  });
});

httpServer.listen(PORT, () => { console.log(`[server] listening on port ${PORT}`); });

let isShuttingDown = false;
async function shutdown(signal: NodeJS.Signals) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[server] received ${signal}, flushing dirty inventories...`);

  const forceExitTimer = setTimeout(() => {
    console.error("[server] shutdown timed out");
    process.exit(1);
  }, 5000);
  forceExitTimer.unref();

  try {
    await flushAllDirtyInventories();
  } catch (error) {
    console.error("[inventory] failed to flush all dirty inventories during shutdown", error);
  }

  httpServer.close(() => {
    clearTimeout(forceExitTimer);
    process.exit(0);
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
