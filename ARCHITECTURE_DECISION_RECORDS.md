# Architecture Decision Records

This file records technical decisions that should guide future implementation work.

## ADR-001: Render Readable In-World Text With DOM Overlays

**Status:** Accepted

**Date:** 2026-06-30

### Context

Onyx uses Phaser for the pixel-art game world. Early player and NPC overhead labels were rendered with Phaser `Text` objects. Those labels are rasterized into textures and then transformed by the camera. Even with increased texture resolution, small labels remained blurry or fragile under zoom, scaling, camera movement, and browser display scaling.

Readable text is especially important because the game will need more UI over time. Player names, NPC names, NPC titles, interaction prompts, and other persistent labels should remain crisp and legible.

### Decision

Readable in-world text should be rendered as DOM text positioned over the Phaser canvas, not as Phaser canvas/WebGL text.

Use `WorldLabelOverlay` for overhead labels and other text that should look like actual browser-rendered text while tracking world objects. Phaser remains responsible for sprites, maps, camera movement, and world coordinates; the DOM overlay is responsible for crisp text rendering.

Canvas-rendered text is still acceptable for temporary loading screens, debug-only text, visual effects, or deliberately pixelated text where crisp browser UI readability is not required.

### Consequences

- In-world labels stay sharp across zoom levels, browser scaling, and future UI work.
- Text can use normal CSS styling, font smoothing, shadows, and layout rules.
- Label positioning must continue to account for Phaser camera projection, canvas scaling, and fitted layouts.
- DOM labels must be cleaned up when their world objects or scenes are destroyed.
- Future text features should avoid adding new Phaser `Text` objects for readable gameplay/UI labels unless there is a specific reason.

### Current Implementation

- `client/src/ui/WorldLabelOverlay.ts` owns DOM label creation, positioning, updates, and cleanup, including transient auto-destroying "floating" labels (e.g. rising/fading text) via `addFloatingLabel`.
- Player overhead names are rendered through `WorldLabelOverlay` in `client/src/scenes/GameScene.ts`.
- NPC names and titles are rendered through `WorldLabelOverlay` in `client/src/world/NpcRenderer.ts`.
- Floating damage numbers are rendered through `WorldLabelOverlay.addFloatingLabel` in `client/src/player/LocalPlayerController.ts`.
