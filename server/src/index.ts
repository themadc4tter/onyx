import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { supabase } from "./lib/supabase";
import { isTileWalkable, SPAWN } from "./config/map";

const PORT = process.env.PORT ?? 3001;
const CLIENT_URL = process.env.CLIENT_URL ?? "http://localhost:5173";

type Facing = "up" | "down" | "left" | "right";

interface Position {
  tileX: number;
  tileY: number;
  facing: Facing;
}

const app = express();
app.use(cors({ origin: CLIENT_URL }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: CLIENT_URL },
});

// Verify JWT before accepting any WebSocket connection
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token as string | undefined;

  if (!token) return next(new Error("no_token"));

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) return next(new Error("invalid_token"));

  socket.data.userId = user.id;
  next();
});

io.on("connection", async (socket) => {
  const userId = socket.data.userId as string;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username")
    .eq("id", userId)
    .single();

  // Initialise in-memory position for this session
  socket.data.position = { tileX: SPAWN.x, tileY: SPAWN.y, facing: "down" } satisfies Position;

  console.log(`[socket] connected: ${socket.id} (${profile?.username ?? userId})`);

  socket.emit("profile", profile);

  socket.on("move", (payload: unknown) => {
    const { tileX, tileY, facing } = payload as Position;

    const current: Position = socket.data.position;

    // Only allow moving one tile at a time (prevents teleporting)
    const dx = Math.abs(tileX - current.tileX);
    const dy = Math.abs(tileY - current.tileY);
    const isOneStep = (dx === 1 && dy === 0) || (dx === 0 && dy === 1);

    if (!isOneStep || !isTileWalkable(tileX, tileY)) {
      socket.emit("move:ack", current);
      return;
    }

    const accepted: Position = { tileX, tileY, facing };
    socket.data.position = accepted;
    socket.emit("move:ack", accepted);
  });

  socket.on("disconnect", () => {
    console.log(`[socket] disconnected: ${socket.id}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[server] listening on port ${PORT}`);
});
