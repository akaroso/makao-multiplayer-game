import Phaser from 'phaser';
import GameScene from './scenes/GameScene';
import MainMenuScene from './scenes/MainMenuScene';
import PlayerSetupScene from './scenes/PlayerSetupScene';

const config = {
  title:    'Makao multiplayer game',
  version:  '1.3',
  type:     Phaser.AUTO,
  parent:   'game',
  backgroundColor: '#F5F5F5',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: window.innerWidth,
    height: window.innerHeight
  },
  render: {
    pixelArt:   true,
    antialias:  true,
  },
  dom: {
    createContainer: true,
  },
  scene: [ MainMenuScene, PlayerSetupScene, GameScene ],
};

new Phaser.Game(config);
