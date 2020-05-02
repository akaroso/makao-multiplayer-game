import Phaser from 'phaser';
import Card from '../objects/Card.js';
import Deck from '../objects/Deck.js';
import Player from '../objects/Player.js';
import Preload from '../utilities/Preload.js';

/**
 * @class - Game scene which contains the core game loop.
 */
export default class GameScene extends Phaser.Scene {

  constructor() {
    super({
      key: 'GameScene',
    });

    this.players = [];
    this.deck = new Deck();
    this.yourTurn = false;
    this.gameOver = false;
    this.gameStarted = false;
    this.currentCardInPlay = false;
  }

  /**
   * Basically need to load any assets here.
   *
   * @see Preload.js for preload functions.
   */
  preload() {
    Preload.loadCards(this);
    Preload.loadPlayers(this);
    Preload.loadSounds(this);
  }

  /**
   * Generate the deck, setup players and initialize the game.
   */
  create(socket) {
    this.socket = socket;

    // Create local player's Player object and add it to players array.
    this.player = new Player(this, 100, 500, this.socket.name);
    this.players.push(this.player);

    // NOTE: remove this at some point, will use more dynamic avatars.
    this.player.setPlayerTexture(1);

    // Notify other players that we are connected.
    this.socket.emit('new player', this.player.name, this.socket.roomCode);

    // Handle new player connections.
    this.socket.on('new player', (playerObj) => {
      this.players.push(new Player(this, this.calculatePlayerX(), 100, playerObj.name));

      // NOTE: remove this at some point, will use more dynamic avatars.
      this.players[this.players.length - 1].setPlayerTexture(this.players.length);
    });

    // Show all the other players.
    this.socket.on('get players', (playerObjs) => {
      for (let player of playerObjs) {
        // We only want to add other players.
        if (player.name !== this.player.name) {
          this.players.push(new Player(this, this.calculatePlayerX(), 100, player.name));

          // NOTE: remove this at some point, will use more dynamic avatars.
          this.players[this.players.length - 1].setPlayerTexture(this.players.length);
        }
      }
    });

    // Show that a player is ready.
    this.socket.on('show player ready', (playerObj) => {
      let player = this.getPlayerByName(playerObj.name);
      player.showPlayerReady();
    });

    // When a turn has been made, remove the 'Making Turn' text.
    this.socket.on('show card played', (playerObj, cardObj) => {
      let player = this.getPlayerByName(playerObj.name);
      let card = new Card(this, player.x, player.y, cardObj.suit, cardObj.value, cardObj.name);

      // Add the card to the play pile.
      this.deck.addCardToPlayPile(card);

      // Play a sound.
      this.sound.play(`card_slide_${Phaser.Math.RND.between(1, 3)}`);

      this.tweens.add({
        targets: card,
        x: 400,
        y: 300,
        ease: 'Linear',
        duration: 250
      });
    });

    // Display 'Making Turn' text to show who has to play.
    this.socket.on('show player turn', (playerObj) => {
      for (let player of this.players) {
        if (player.turnText) {
          player.turnText.destroy();
        }
      }

      if (this.player.name === playerObj.name) {
        // It's your turn!
        this.player.showPlayerTurn();
        this.yourTurn = true;
      }
      else {
        // It's someone elses turn!
        let player = this.getPlayerByName(playerObj.name);

        player.showPlayerTurn();
        this.yourTurn = false;
      }
    });

    // Check player hand for playable cards, otherwise draw a card and move on.
    this.socket.on('turn start', () => {
      let needToDrawCard = true;

      // Check for playable cards.
      for (let card of this.player.hand) {
        let isPlayable = this.checkCardPlayable(card);

        // If the card is playable, make it interactive.
        if (isPlayable) {
          this.makeCardInteractive(card);
          needToDrawCard = false;
        }
      }

      // If no cards are playable, the player needs to draw a card.
      if (needToDrawCard) {
        this.addDrawCardButton();
      }
    });

    // Flag that the game has started, remove player text.
    this.socket.on('game started', () => {
      this.gameStarted = true;

      // Ring the bell, the match has begun.
      let bellSound = this.sound.play('bell');

      // Remove the 'READY' text on each player.
      for (let player of this.players) {
        player.readyText.destroy();
        player.showPlayerCountdown();
      }
    });

    // Tween cards to the player.
    this.socket.on('add card to hand', (cardObj) => {
      this.dealCardToPlayer(cardObj);
    });

    // Update the current card in play.
    this.socket.on('update card in play', (cardObj) => {
      // If a card in play hasn't been set, we need to add the first one to the
      // scene.
      if (!this.currentCardInPlay) {
        let card = new Card(this, 400, 300, cardObj.suit, cardObj.value, cardObj.name);
        this.deck.addCardToPlayPile(card);
      }

      this.currentCardInPlay = cardObj;
    });

    // Update a player's countdown score.
    this.socket.on('update countdown score', (playerObj) => {
      let player = this.getPlayerByName(playerObj.name);

      player.lowerPlayerCountdown();
    });

    // Handle removing a player who has disconnected.
    this.socket.on('player quit', (playerObj) => {
      // Remove the player from the scene.
      this.getPlayerByName(playerObj.name).removePlayer();
      // Remove player from players array.
      this.players = this.players.filter((player) => player.name !== playerObj.name);
    });

    // TODO: only show this button when there are two or more players in room.
    this.addReadyButton();
    this.addRoomCodeButton();
  }

  update() {

  }

  /**
   * Tween the card(s) to the player's hand.
   *
   * @param {Card} card - The card to tween to our hand.
   */
  dealCardToPlayer(card) {
    let cardToTween = new Card(this, 400, 300, card.suit, card.value, card.name);

    // Add the card to the player's hand.
    this.player.addCardToHand(cardToTween);

    this.tweens.add({
      targets: cardToTween,
      x: this.calculateCardX(),
      y: 500,
      ease: 'Linear',
      duration: 250
    });
  }

  /**
   * Make a card playable by adding click/hover listeners.
   */
  makeCardInteractive(card) {
    card.setInteractive();

    card.on('pointerdown', () => {
      // Remove the turn text.
      this.player.turnText.destroy();

      // Remove tint.
      card.clearTint();

      // Remove the listeners on all cards.
      for (let card of this.player.hand) {
        card.removeAllListeners();
      }

      // Remove the card from the player's hand array.
      this.player.removeCardFromHand(card, this.deck);

      // Play a sound.
      this.sound.play(`card_slide_${Phaser.Math.RND.between(1, 3)}`);

      // Move the card to the play pile.
      this.tweens.add({
        targets: card,
        x: 400,
        y: 300,
        ease: 'Linear',
        duration: 250,
      });

      // Notify players that a card has been played.
      this.socket.emit('card played', card);
    });

    // When the user hovers the cursor over the card, set a tint and raise y.
    card.on('pointerover', () => {
      // Set a tint to show card is playable.
      card.setTint(0xe3e3e3);

      // Move card up slightly.
      this.tweens.add({
        targets: card,
        y: 450,
        ease: 'Linear',
        duration: 250,
      });
    });

    // When the user's cursor leaves the card, remove the tint and lower y.
    card.on('pointerout', () => {
      // Remove tint.
      card.clearTint();

      // Move the card back into hand.
      this.tweens.add({
        targets: card,
        y: 500,
        ease: 'Linear',
        duration: 250,
      });
    });
  }

  /**
   * Constructs a wildcard dialog box.
   */
  buildWildCardDialog() {
    // initialize container object to hold all the dialogue text.
    this.wildCardDialogContainer = this.add.container(0, 0);
    this.wildCardDialogContainer.visible = false;

    // Add a background for the message box.
    let wildCardDialogBackground = this.add.graphics();
    wildCardDialogBackground.fillStyle(0xbdbdbd, 0.8);
    wildCardDialogBackground.fillRoundedRect(200, 250, 400, 150, 4);

    this.wildCardDialogContainer.add(wildCardDialogBackground);

    // Show message text in the center of the screen.
    let wildCardText = this.add.text((this.sys.game.config.width / 2), (this.sys.game.config.height / 2) - 20, 'Wild card played, choose a new suit:');
    wildCardText.setOrigin(0.5);

    this.wildCardDialogContainer.add(wildCardText);

    const suits = [ 'hearts', 'diamonds', 'spades', 'clubs' ];
    let offset = 10;

    for (let suit of suits) {
      let wildCardOption = this.add.text(this.sys.game.config.width / 2, (this.sys.game.config.height / 2) + offset, suit);
      wildCardOption.setOrigin(0.5);
      wildCardOption.setInteractive();

      wildCardOption.on('pointerdown', () => {
        this.currentSuitInPlay = suit;
        this.wildCardDialogContainer.visible = false;
      });

      wildCardOption.on('pointerover', () => {
        wildCardOption.setTint(0xe3e3e3);
      });

      wildCardOption.on('pointerout', () => {
        wildCardOption.clearTint();
      });

      this.wildCardDialogContainer.add(wildCardOption);

      offset += 20;
    }
  }

  /**
   * Return an x position to place a player.
   */
  calculatePlayerX() {
    if (this.players.length === 1) {
      return 100;
    }
    else if (this.players.length === 2) {
      return 400;
    }
    else {
      return 700;
    }
  }

  /**
   * Return an x position to place a card in player's hand.
   */
  calculateCardX() {
    let startingX = 170;
    let handSize = this.player.hand.length;
    let offset = handSize * 50;

    return startingX + offset;
  }

  /**
   * Check to see if a card is playable, otherwise return false.
   */
   checkCardPlayable(card) {
     let isPlayable =
       // Check if card matches the current suit in play.
       card.suit == this.currentCardInPlay.suit ||
       // Check if card matches the current value in play.
       card.value == this.currentCardInPlay.value ||
       // Check if the card is wild (wildcard = countdown score).
       card.value == this.player.countdown;

     return isPlayable;
   }

  /**
   * Return a player by their name property.
   */
  getPlayerByName(playerName) {
    return this.players.find((player) => player.name === playerName);
  }

  /**
   * Add room code button to the scene.
   */
  addRoomCodeButton() {
    this.roomCodeButton = this.add.dom(710, 550, 'button', 'font-size: 16px;', `CLICK TO COPY \n CODE ${this.socket.roomCode.toUpperCase()}`);
    this.roomCodeButton.setClassName('game-button');
    this.roomCodeButton.setInteractive();

    this.roomCodeButton.on('pointerdown', () => {
      // Copy room code to the clipboard.
      navigator.clipboard.writeText(this.socket.roomCode);
    });
  }

  /**
   * Add a ready button to the scene.
   *
   * TODO: only show button when more than one player present in the room.
   */
  addReadyButton() {
    this.readyButton = this.add.dom(710, 490, 'button', 'font-size: 16px;', 'READY');
    this.readyButton.setClassName('game-button');
    this.readyButton.setInteractive();

    this.readyButton.on('pointerdown', () => {
     this.socket.emit('player ready');
     this.player.showPlayerReady();
     // TODO: toggle ready/unready.
     this.readyButton.destroy();
    });
  }

  /**
   * Add draw card button to the scene.
   */
  addDrawCardButton() {
    this.drawCardButton = this.add.dom(710, 490, 'button', 'font-size: 16px;', 'DRAW CARD');
    this.drawCardButton.setClassName('game-button');
    this.drawCardButton.setInteractive();

    this.drawCardButton.on('pointerdown', () => {
      this.socket.emit('draw card');
      this.drawCardButton.destroy();
    });
  }
}
