import Phaser from 'phaser';
import SocketIO from 'socket.io-client';

/**
 * @class - It's da main menu scene!
 */
export default class MainMenuScene extends Phaser.Scene {

  constructor() {
    super({
      key: 'MainMenuScene',
    });
  }

  preload() {

  }

  create() {
    this.addTitleText();
    this.addRoomCodeInput();
    this.addNameInput();
    this.addCreateGameButton();
    this.addJoinButton();

    this.socket = new SocketIO();

    this.socket.on('connect', () => {
      this.addConnectionStatus();
    });

    this.socket.on('new game', (roomCode) => {
      this.socket.roomCode = roomCode;
      this.scene.start('PlayerSetupScene', this.socket);
    });

    this.socket.on('join game', () => {
      this.scene.start('PlayerSetupScene', this.socket);
    });

    this.socket.on('room error', (errorMessage) => {
      this.showErrorMessage(errorMessage);
    });
  }

  update() {

  }

  /**
   * Add title text to the scene.
   */
  addTitleText() {
    let titleText = this.add.dom(400, 100, 'div', 'font-size: 28px', 'CRAZY 8 SMACKDOWN');
    titleText.setClassName('title');

    let releaseBadge = this.add.dom(530, 130, 'div', 'font-size: 16px', 'ALPHA');
    releaseBadge.setClassName('badge');
  }

  /**
   * Add connection status text to the scene.
   */
  addConnectionStatus() {
    let statusText = this.add.dom(735, 570, 'div', 'font-size: 14px;', 'CONNECTED');
    statusText.setClassName('status');
  }

  /**
   * Add a player name input and label to the scene.
   */
  addNameInput() {
    let nameLabel = this.add.dom(270, 205, 'div', 'font-size: 18px;', 'NAME');
    nameLabel.setClassName('label');

    let nameInput = this.add.dom(400, 240, 'input');
    nameInput.setClassName('name-input');
    nameInput.node.maxLength = 12;
    nameInput.node.placeholder = 'ENTER YOUR NAME';
    nameInput.setInteractive();
  }

  /**
   * Add a room code input and label to the scene.
   */
  addRoomCodeInput() {
    let roomCodeLabel = this.add.dom(300, 285, 'div', 'font-size: 18px;', 'ROOM CODE');
    roomCodeLabel.setClassName('label');

    let roomCodeInput = this.add.dom(400, 320, 'input');
    roomCodeInput.setClassName('room-code-input');
    roomCodeInput.node.maxLength = 4;
    roomCodeInput.node.placeholder = 'ENTER 4 CHARACTER CODE';
    roomCodeInput.setInteractive();
  }

  /**
   * Add a create game button that creates a game session/token (GameScene).
   */
  addCreateGameButton() {
    let createGameButton = this.add.dom(310, 380, 'button', 'font-size: 16px;', 'CREATE GAME');
    createGameButton.setClassName('menu-button');
    createGameButton.addListener('click');

    createGameButton.on('click', () => {
      let playerName = document.querySelector('.name-input').value;
      let roomCode = document.querySelector('.room-code-input').value;

      if (playerName !== '') {
        this.socket.name = playerName.toUpperCase();

        // If the user provides a room code, lets just go with that one.
        if (roomCode !== '') {
          // Room codes must be 4 characters long.
          if (roomCode.length === 4) {
            // Room code cannot contain spaces.
            if (!roomCode.includes(' ')) {
              this.socket.emit('new game', roomCode);
            }
            else {
              this.showErrorMessage('ROOM CODE MUST NOT CONTAIN SPACES');
            }
          }
          else {
            this.showErrorMessage('ROOM CODE MUST CONTAIN 4 CHARACTERS');
          }
        }
        else {
          this.socket.emit('new game');
        }
      }
      else {
        this.showErrorMessage('NAME MUST NOT BE EMPTY');
      }
    });
  }

  /**
   * Add a play button that starts the player setup scene (PlayerSetupScene).
   */
  addJoinButton() {
    let joinButton = this.add.dom(490, 380, 'button', 'font-size: 16px;', 'JOIN');
    joinButton.setClassName('menu-button');
    joinButton.addListener('click');

    joinButton.on('click', () => {
      let playerName = document.querySelector('.name-input').value;
      let roomCode = document.querySelector('.room-code-input').value;

      if (playerName !== '' && roomCode !== '') {
        // Tell the server who we are and that we're joining an existing game.
        this.socket.name = playerName.toUpperCase();
        this.socket.roomCode = roomCode;

        this.socket.emit('join request', roomCode);
      }
      else {
        this.showErrorMessage('NAME & ROOM CODE MUST NOT BE EMPTY');
      }
    });
  }

  /**
   * Display error message to the use, fade it out after a few seconds.
   */
  showErrorMessage(errorMessage) {
    // Only display one error message at a time.
    if (!this.errorMessage) {
      this.errorMessage = this.add.dom(400, 440, 'div', 'font-size: 16px;', errorMessage);
      this.errorMessage.setClassName('error-message');

      this.tweens.add({
        targets: this.errorMessage,
        delay: 2000,
        alpha: 0,
        ease: 'linear',
        duration: 400,
        onComplete: () => {
          this.errorMessage.destroy();
          this.errorMessage = false;
        }
      });
    }
  }
}
