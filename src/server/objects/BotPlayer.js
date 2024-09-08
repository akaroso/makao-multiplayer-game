import Player from './Player';
const filePath = './public/assets/json/textureMap.json';
const loadedTextureMap = loadTextureMapFromFile(filePath);

export default class BotPlayer extends Player {
  constructor(id, name, roomCode, textureMap, socket) {
    super(id, name, roomCode, textureMap);
    this.textureMap = loadedTextureMap;
    this.isBot = true;
    this.socket = socket;
  }

  decideMove(gameState) {
    let playableCards = [];

    // Check which cards can be played
    for (let card of this.hand) {
      if (this.canPlayCard(card, gameState)) {
        playableCards.push(card);
      }
    }

    if (playableCards.length > 0) {
      // Sort cards by value priority (special cards first)
      playableCards.sort(this.sortByPriority);
      return playableCards[0];
    }

    return null;
  }

  canPlayCard(card, gameState) {
    // Card can be played if it matches the suit, value or special conditions
    const isPlayable =
      card.suit === gameState.currentSuit ||
      card.value === gameState.currentValue ||
      card.value === 'q' || // Dama na wszystko
      (card.value === 'a' && gameState.special !== 'ace') || // As zmienia kolor
      (card.value === 'k' && (card.suit === 'hearts' || card.suit === 'spades') && gameState.special !== 'king') || // Król bitny
      (card.value === '2' || card.value === '3') && (gameState.special === 'two' || gameState.special === 'three') || // Dwójka i trójka do obrony
      card.value === '4' && gameState.special === 'four' || // Czwórka do obrony
      card.value === 'j'; // Walet żąda karty

    return isPlayable;
  }

  makeMove(gameState) {
    const move = this.decideMove(gameState);
    if (move) {
      if (move.value === 'a') {
        // As zmienia kolor - wybieramy losowy kolor
        const suits = ['spades', 'hearts', 'diamonds', 'clubs'];
        const randomSuit = suits[Math.floor(Math.random() * suits.length)];
        this.socket.emit('bot card played', { card: move, wildcardSuit: randomSuit, botId: this.id, roomCode: this.roomCode });
      } else {
        this.socket.emit('bot card played', { card: move, botId: this.id, roomCode: this.roomCode });
      }
    } else {
      this.socket.emit('bot draw card', { botId: this.id, roomCode: this.roomCode });
    }
  }

  sortByPriority(cardA, cardB) {
    const priority = {
      '2': 6,
      '3': 5,
      '4': 4,
      'a': 3,
      'k': 2,
      'q': 1,
      'j': 0
    };

    return (priority[cardB.value] || -1) - (priority[cardA.value] || -1);
  }
}

function loadTextureMapFromFile(filePath) {
  const fs = require('fs');
  const data = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(data);
}
