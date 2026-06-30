import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import cors from "cors";
import { supabase } from "./lib/supabase";
import { isTileWalkable, normalizeZoneId, ZONES, type ZoneExit } from "./config/map";

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

async function handleZoneTransition(io: Server, socket: Socket, exit: ZoneExit) {
  const oldZoneId = socket.data.zoneId as string;
  const newZoneId = exit.toZoneId;
  const newPos: Position = { tileX: exit.toTileX, tileY: exit.toTileY, facing: "down" };

  const newZonePlayers = [...connectedPlayers.values()].filter(p => p.zoneId === newZoneId);

  const player = connectedPlayers.get(socket.id)!;
  player.position = newPos;
  player.zoneId   = newZoneId;
  player.lastMoveAt = 0;
  player.lastProcessedMoveSeq = 0;
  socket.data.position = newPos;
  socket.data.zoneId   = newZoneId;

  socket.leave(oldZoneId);
  await socket.join(newZoneId);

  io.to(oldZoneId).emit("player:left",   { socketId: socket.id });
  socket.to(newZoneId).emit("player:joined", { socketId: socket.id, username: player.username, position: newPos });
  socket.emit("zone:changed", { zoneId: newZoneId, position: newPos, initPlayers: newZonePlayers });

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
  const others = [...connectedPlayers.values()].filter(p => p.zoneId === zoneId);
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
  socket.to(zoneId).emit("player:joined", { socketId: socket.id, username, position: startPos });

  console.log(`[connect]    ${socket.id} (${username}) → ${zoneId} — ${connectedPlayers.size} online`);

  socket.emit("profile", { profile, position: startPos, zoneId });

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

  // ─── Disconnect ────────────────────────────────────────────────────────────

  socket.on("disconnect", () => {
    const player = connectedPlayers.get(socket.id);
    if (player) {
      flushSave(socket.id, player.userId, player.zoneId, player.position);
    }
    connectedPlayers.delete(socket.id);
    io.to(socket.data.zoneId as string).emit("player:left", { socketId: socket.id });
    console.log(`[disconnect] ${socket.id} (${username}) — ${connectedPlayers.size} online`);
  });
});

httpServer.listen(PORT, () => { console.log(`[server] listening on port ${PORT}`); });
