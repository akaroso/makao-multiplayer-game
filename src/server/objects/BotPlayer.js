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
      // Priorytet: najpierw atakujące karty (2, 3), później karty specjalne (a, k)
      playableCards.sort(this.sortByPriority);

      const bestCard = playableCards[0];

      // Logika dla wildcarda (np. as): bot wybiera kolor, który ma najwięcej w ręku
      if (bestCard.value === 'a') {
        const bestSuit = this.chooseBestSuit();
        console.log(`Bot ${this.name} chooses wildcard suit: ${bestSuit}`);
        return { card: bestCard, wildcardSuit: bestSuit };
      }

      return { card: bestCard, wildcardSuit: null };
    }

    return null;
  }

  chooseBestSuit() {
    const suitCount = { spades: 0, hearts: 0, diamonds: 0, clubs: 0 };

    // Liczymy ile bot ma kart w każdym kolorze
    for (let card of this.hand) {
      suitCount[card.suit]++;
    }

    // Wybieramy kolor, którego bot ma najwięcej
    let bestSuit = 'spades'; // Domyślnie
    let maxCount = 0;

    for (let suit in suitCount) {
      if (suitCount[suit] > maxCount) {
        maxCount = suitCount[suit];
        bestSuit = suit;
      }
    }

    return bestSuit;
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
