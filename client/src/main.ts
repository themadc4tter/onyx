import Phaser from "phaser";
import { supabase } from "./lib/supabase";
import { AuthUI } from "./auth/AuthUI";
import { BootScene } from "./scenes/BootScene";
import { GameScene } from "./scenes/GameScene";

const GAME_WIDTH = 854;
const GAME_HEIGHT = 480;

function startGame() {
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game-root",
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    backgroundColor: "#1a1a2e",
    pixelArt: true,
    scene: [BootScene, GameScene],
  });
}

async function init() {
  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    startGame();
    return;
  }

  new AuthUI(() => startGame());
}

init();
