import Phaser from "phaser";

import MainMenuScene from "./scenes/MainMenuScene";
import GameScene from "./scenes/GameScene";

const config = {
  title:    "Crazy 8 Smackdown",
  version:  "0.0.1",
  width:    800,
  height:   600,
  type:     Phaser.AUTO,
  parent:   "game",
  input: {
    keyboard: true,
    mouse:    true,
    touch:    true,
    gamepad:  false,
  },
  render: {
    pixelArt:   true,
    antialias:  true,
  },
  backgroundColor: "#EFF7F6",
  scene: [ MainMenuScene, GameScene ],
};

const game = new Phaser.Game(config);

// window.addEventListener("load", () => {
//   new Game(config);
// });
