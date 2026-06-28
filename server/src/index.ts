import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { supabase } from "./lib/supabase";
import { isTileWalkable, SPAWN } from "./config/map";

const PORT = process.env.PORT ?? 3001;
const CLIENT_URL = process.env.CLIENT_URL ?? "http://localhost:5173";

const ZONE_ID = "town";

type Facing = "up" | "down" | "left" | "right";

interface Position {
  tileX: number;
  tileY: number;
  facing: Facing;
}

interface ConnectedPlayer {
  socketId: string;
  username: string;
  position: Position;
}

const connectedPlayers = new Map<string, ConnectedPlayer>();

const app = express();
app.use(cors({ origin: CLIENT_URL }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: CLIENT_URL },
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username")
    .eq("id", userId)
    .single();

  const username = profile?.username ?? userId;
  const startPos: Position = { tileX: SPAWN.x, tileY: SPAWN.y, facing: "down" };
  socket.data.position = startPos;

  // Snapshot current players before adding self, so newcomer doesn't see themselves
  const others = [...connectedPlayers.values()];
  socket.emit("players:init", others);

  connectedPlayers.set(socket.id, { socketId: socket.id, username, position: startPos });

  await socket.join(ZONE_ID);
  socket.to(ZONE_ID).emit("player:joined", { socketId: socket.id, username, position: startPos });

  console.log(`[connect]    ${socket.id} (${username}) — ${connectedPlayers.size} online`);

  socket.emit("profile", profile);

  socket.on("move", (payload: unknown) => {
    const { tileX, tileY, facing } = payload as Position;
    const current: Position = socket.data.position;

    const dx = Math.abs(tileX - current.tileX);
    const dy = Math.abs(tileY - current.tileY);
    const isOneStep = (dx === 1 && dy === 0) || (dx === 0 && dy === 1);

    if (!isOneStep || !isTileWalkable(tileX, tileY)) {
      socket.emit("move:ack", current);
      return;
    }

    const accepted: Position = { tileX, tileY, facing };
    socket.data.position = accepted;

    const player = connectedPlayers.get(socket.id);
    if (player) player.position = accepted;

    socket.emit("move:ack", accepted);
    socket.to(ZONE_ID).emit("player:moved", { socketId: socket.id, tileX, tileY, facing });
  });

  socket.on("disconnect", () => {
    connectedPlayers.delete(socket.id);
    io.to(ZONE_ID).emit("player:left", { socketId: socket.id });
    console.log(`[disconnect] ${socket.id} (${username}) — ${connectedPlayers.size} online`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[server] listening on port ${PORT}`);
});
