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
    for (let card of this.hand) {
      if (this.canPlayCard(card, gameState)) {
        return card;
      }
    }
    return null;
  }

  canPlayCard(card, gameState) {
    return card.suit === gameState.currentSuit || card.value === gameState.currentValue;
  }

  makeMove(gameState) {
    const move = this.decideMove(gameState);
    if (move) {
      //console.log(`Bot ${this.id} playing card:`, move);
      this.socket.emit('bot card played', { card: move, botId: this.id, roomCode: this.roomCode });


    } else {
      //console.log(`Bot ${this.id} drawing card`);

      this.socket.emit('bot draw card', { botId: this.id, roomCode: this.roomCode });
    }
  }
}

function loadTextureMapFromFile(filePath) {
  const fs = require('fs');
  const data = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(data);
}
