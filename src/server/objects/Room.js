/**
 * @class - Room class to manage players/score.
 */
export default class Room {

  constructor(roomCode) {
    this.roomCode = roomCode;

    this.startGameCounter = 0;
    this.gameOver = false;
    this.gameStarted = false;
    this.reverseDirection = false;
    this.cardInPlay = false;

    this.players = [];
    this.playerTurn = 0;
  }

  /**
   * Get the next player in the order of play.
   *
   * @return - The next player in the order of play.
   */
  getNextPlayer() {
    // Grab the size of the player order array so we can target the player last
    // in order.
    const playerLastOrder = this.players.length - 1;

    if (this.reverseDirection) {
      // If the player first in order has played, reset back to last player.
      // Otherwise move to next player in order.
      this.playerTurn === 0 ? this.playerTurn = playerLastOrder : this.playerTurn--;
    }
    else {
      // If the player last in order has played, reset back to first player.
      // Otherwise move to next player in order.
      this.playerTurn === playerLastOrder ? this.playerTurn = 0 : this.playerTurn++;
    }

    return this.players[this.playerTurn];
  }

  /**
   * Get the previous player in the order of play.
   *
   * @return - The previous player in the order of play.
   */
  getPreviousPlayer() {
    // Grab the size of the player order array so we can target the player first
    // in order.
    const playerFirstOrder = 0;
    const playerLastOrder = this.players.length - 1;

    if (this.reverseDirection) {
      // If the game direction is reversed, moving to the "previous" player
      // actually moves us forward in the normal order.
      // If the player last in order has played, reset back to first player.
      // Otherwise, move to the next player in order.
      this.playerTurn === playerLastOrder ? this.playerTurn = playerFirstOrder : this.playerTurn++;
    }
    else {
      // If the game direction is not reversed, moving to the "previous" player
      // means we move back in the normal order.
      // If the player first in order has played, reset to the last player.
      // Otherwise, move to the previous player in order.
      this.playerTurn === playerFirstOrder ? this.playerTurn = playerLastOrder : this.playerTurn--;
    }

    return this.players[this.playerTurn];
  }

  /**
   * Remove a player from the player order array.
   *
   * @param {string} id - socket id of the player to remove from the game.
   */
  removePlayerByID(id) {
    this.players = this.players.filter(player => player.id !== id);
  }
}
