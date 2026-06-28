# Project Onyx — Product Requirements Document

**Version:** 1.0  
**Date:** 2026-06-28  
**Status:** Draft

---

## 1. Overview

Project Onyx is a browser-based, persistent multiplayer 2D pixel game. The primary learning goal is to deploy and operate a live, always-on multiplayer game stack — covering real-time WebSocket communication, authentication, persistent world state, and cloud deployment on Render.

The game itself is intentionally minimal: players walk around a tiled world in the style of classic Pokémon games and see each other in real time. There are no win conditions, enemies, or objectives in v1. The game is the infrastructure.

---

## 2. Goals

| Goal | Type |
|------|------|
| Build and deploy a permanently running multiplayer game server | Primary |
| Players join a shared persistent world (no lobbies) | Primary |
| Players can create an account and log in | Primary |
| Players appear to each other in real time | Primary |
| Players re-enter the world at their last saved position | Primary |
| Learn how WebSockets, Phaser.js, and Supabase work together | Learning |

---

## 3. Non-Goals (v1)

- Combat, NPCs, or any game mechanics beyond walking
- Mobile support (desktop browser only for v1)
- Chat or social features
- Admin dashboard or moderation tools
- Inventory, items, or progression systems

---

## 4. Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | [Phaser.js](https://phaser.io/) | Purpose-built browser game framework; handles rendering, input, and tile maps |
| Backend | Node.js + Socket.io | Node is JavaScript on the server; Socket.io wraps WebSockets with reconnection logic |
| Language | TypeScript | Type safety across client and server; catches errors at compile time |
| Auth | Supabase Auth | Managed auth with username/password; no DIY token handling |
| Database | Supabase Postgres | Comes with Supabase; stores player profiles and world state |
| Deployment | Render | Hosts the Node.js server (always-on paid tier) + frontend static site |

### Concept explainer: Why WebSockets?

Normal HTTP works like a letter: the browser asks, the server replies, connection closes. WebSockets are more like a phone call: the connection stays open and both sides can send messages at any moment. This is essential for multiplayer games — the server needs to push other players' positions to you without you asking for them.

---

## 5. Architecture

```
Browser (Phaser.js)
    │
    │  HTTP (login/register)
    ▼
Supabase Auth ──────► Supabase Postgres
                            │
    │  WebSocket (Socket.io)│  (player state reads/writes)
    ▼                       │
Node.js Game Server ◄───────┘
  - Zone management
  - Position broadcast
  - Session tracking
```

**Flow at login:**
1. Player submits username/password to Supabase Auth → receives a JWT token
2. Browser opens a WebSocket to the game server, sending the JWT
3. Game server verifies the JWT with Supabase, loads the player's last position and zone from Postgres
4. Player is placed into the correct zone; their position is broadcast to other players in that zone

**Flow during play:**
1. Player moves → Phaser sends position update over WebSocket
2. Server validates the move (basic sanity check) and saves it to Postgres
3. Server broadcasts the new position to all other players in the same zone
4. Other players' Phaser clients receive the update and move that player's sprite

---

## 6. Feature Requirements

### 6.1 Authentication

- **Register:** username + password + email. Supabase handles hashing and storage.
- **Login:** username/password → JWT. JWT is stored in browser memory (not localStorage, for security).
- **Logout:** WebSocket disconnects, session ends. Position is saved before disconnect.
- **Protected access:** The game canvas is only reachable after a valid login. Any unauthenticated WebSocket connection is rejected.

### 6.2 World & Maps

- The world consists of **multiple zones** (e.g., a starting town, a forest, a cave).
- Each zone is a **fixed tile map** built with the Tiled map editor and loaded into Phaser.
- Zones are connected by transition points (walk off the edge of one map → appear at the edge of the next).
- All zones run simultaneously on the server. Players are only sent updates for their current zone.

### 6.3 Player Movement

- Movement via arrow keys or WASD.
- Tile-based movement (snap to grid, like Pokémon) — simpler to sync than free movement.
- Collision with map tiles (walls, water, objects) handled client-side first, validated server-side.
- Character sprite uses a walk animation (4-directional: up, down, left, right).

### 6.4 Multiplayer Presence

- Players in the same zone see each other's sprites moving in real time.
- Player username displayed above their sprite.
- When a player changes zones, they disappear from the old zone and appear in the new one.
- When a player disconnects, their sprite is immediately removed from other clients.

### 6.5 Persistent World State

- On every successful move, the server writes the player's position and zone to Postgres.
- On login, the server reads this row and places the player at their last known position.
- First-time login places the player at a designated spawn point in the starting zone.

---

## 7. Data Model

### `profiles` table (extends Supabase Auth `auth.users`)
```
id          uuid    PK, references auth.users.id
username    text    unique, not null
created_at  timestamp
```

### `player_state` table
```
user_id     uuid    PK, references profiles.id
zone_id     text    e.g. "town", "forest"
tile_x      int     tile column
tile_y      int     tile row
facing      text    "up" | "down" | "left" | "right"
updated_at  timestamp
```

---

## 8. Deployment Architecture (Render)

| Service | Type | Tier |
|---------|------|------|
| Game Server (`onyx-server`) | Web Service (Node.js) | Paid (always-on, no cold starts) |
| Frontend (`onyx-client`) | Static Site | Free |
| Database | Supabase (external) | Supabase free tier to start |

The frontend is a static build (HTML + JS bundle) served from Render's CDN. The game server runs continuously and holds WebSocket connections. The two communicate via WebSocket from the browser; the game server connects to Supabase over a standard Postgres connection string.

---

## 9. Phased Roadmap

### Phase 1 — Project Skeleton & Deployment Pipeline
**Goal:** Get a "hello world" deployed end-to-end. Establish CI/CD habits early.

- [ ] Initialize monorepo: `/client` (Phaser) and `/server` (Node.js)
- [ ] Set up Render: static site for client, web service for server
- [ ] Automated deploy on `git push` to `main`
- [ ] Server health-check endpoint (`GET /health → 200 OK`)
- [ ] Client loads in browser, connects to server WebSocket, logs "connected"

**What you'll learn:** Render deployment, environment variables, static vs. server hosting.

---

### Phase 2 — Auth & Protected Access
**Goal:** Players can register, log in, and be rejected if not authenticated.

- [ ] Supabase project setup (Auth + Postgres)
- [ ] Register page (username, email, password)
- [ ] Login page → receives JWT on success
- [ ] Game page requires valid JWT; redirect to login if missing
- [ ] WebSocket handshake: server verifies JWT via Supabase before accepting connection
- [ ] `profiles` table created; row inserted on first login
- [ ] Logout button disconnects WebSocket, clears token

**What you'll learn:** JWTs, Supabase Auth, protecting WebSocket connections.

---

### Phase 3 — Single-Zone World & Movement
**Goal:** One logged-in player can walk around a tile map in the browser.

- [ ] Build a starter tile map in Tiled (e.g., 20×20 town map)
- [ ] Load tile map in Phaser
- [ ] Player sprite with 4-directional walk animation
- [ ] Tile-based movement with collision
- [ ] Movement inputs sent to server over WebSocket
- [ ] Server echoes validated position back to client

**What you'll learn:** Phaser scenes, tile maps, sprite animations, client-server movement loop.

---

### Phase 4 — Real-Time Multiplayer
**Goal:** Two browser tabs can see each other's players moving.

- [ ] Server tracks all connected players per zone
- [ ] On player move: broadcast new position to all other players in the same zone
- [ ] Client renders other players as sprites with name labels
- [ ] On disconnect: remove player from other clients
- [ ] Stress-test: open 5 tabs, confirm all see each other

**What you'll learn:** Socket.io rooms, broadcasting, client-side interpolation of other players.

---

### Phase 5 — Persistence & Zones
**Goal:** Players log out and back in at the same spot. Multiple maps exist.

- [ ] `player_state` table in Supabase
- [ ] Server saves position to DB on every move (debounced)
- [ ] Server loads last position on login; new players spawn at default tile
- [ ] Build a second zone (e.g., a forest map)
- [ ] Zone transition tiles: walk to edge → teleport to next map
- [ ] Server moves player between Socket.io rooms on zone change

**What you'll learn:** Postgres writes from Node.js, zone/room management, persistent game state.

---

### Phase 6 — Polish & Hardening (v1 Complete)
**Goal:** The game is stable, looks intentional, and is ready to share.

- [ ] Error handling: disconnects, auth failures, invalid moves
- [ ] Loading screen while assets and connection initialize
- [ ] Pixelated rendering settings in Phaser (crisp pixel art)
- [ ] Basic character selection (pick a sprite color/style at registration)
- [ ] Rate limiting on movement updates (prevent spam/cheating)
- [ ] Review Render logs; confirm no memory leaks on the server

---

### Future (Post-v1)
Once the above is stable, the next logical additions would be:
- Emotes or simple chat
- Interactable objects (NPCs, signs)
- Multiple character classes or customization
- A tile map editor workflow for faster world-building

---

## 10. Open Questions

| Question | Decision |
|----------|--------------------|
| Supabase free tier limits (500MB DB, 50k MAU auth) — acceptable for v1? | Open — revisit before Phase 2 |
| Should the client and server live in the same GitHub repo (monorepo) or separate repos? | **Decided: monorepo** — `/client` and `/server` under one repo |
| Pixel art assets: use a free tileset (e.g., LPC, Kenney.nl) or create custom? | Open — revisit before Phase 3 |

## 11. Decided: Developer Workflow Conventions

| Topic | Decision |
|-------|----------|
| Language | TypeScript throughout — both `/client` and `/server` |
| Repo structure | Monorepo with `npm workspaces` (`/client`, `/server`) |
| Render setup | Code (build commands, `render.yaml`, env var list) provided here; Olivier connects the repo to Render and clicks Deploy |

---

## 12. Success Criteria for v1

The project is complete when:
1. A user can register and log in from any browser
2. The game loads and the player can walk around a tiled world
3. A second user logging in on a different device can see the first player moving in real time
4. Logging out and back in places the player at their last position
5. The server has been running uninterrupted for 48 hours on Render without manual restart
