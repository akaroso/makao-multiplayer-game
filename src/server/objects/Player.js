/**
 * @class - Player class to manage player data.
 */
export default class Player {

  constructor(id, name, roomCode, textureMap) {
    this.id = id;
    this.name = name;
    this.roomCode = roomCode;
    this.textureMap = textureMap;

    this.hand = [];
    this.countdown = 8;
    this.ready = false;
  }

  /**
   * Remove a card from the player's hand, place it in play pile.
   *
   * @param {Card} card - The card to be removed.
   * @param {Deck} deck - The deck which contains the play pile to add to.
   */
  removeCardFromHand(card, deck) {
    let cardToRemoveIndex = this.hand.findIndex((cardObj) => cardObj.name === card.name);
    let cardToRemove = this.hand.splice(cardToRemoveIndex, 1);

    // Add the card to the play pile.
    deck.addCardToPlayPile(cardToRemove[0]);

    console.log(`${cardToRemove[0].name} was removed from ${this.name}`);
  }

  /**
   * Add a card to the player's hand.
   *
   * @param {Card} card - The card to be added to the player's hand.
   */
  addCardToHand(card) {
    this.hand.push(card);

    console.log(`${card.name} was added to ${this.name}`);
  }

  /**
   * Return if the player's hand is empty.
   *
   * @return {boolean} - Whether the hand is empty or not.
   */
  checkHandEmpty() {
    return this.hand.length === 0;
  }
}
