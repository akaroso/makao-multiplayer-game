import Http from 'http';
import Path from 'path';
import Helmet from 'helmet';
import Crypto from 'crypto';
import Express from 'express';
import SocketIO from 'socket.io';
import Compression from 'compression';

import Room from './objects/Room';
import Deck from './objects/Deck';
import Player from './objects/Player';
import BotPlayer from './objects/BotPlayer';

// Array to track active rooms.
let rooms = [];

// Server setup.
const app = Express();
const server = Http.Server(app);
const io = SocketIO(server);
const port = process.env.PORT || 3000;

// Fire up Helmet and Compression for better Express security and performance.
app.use(Helmet());
app.use(Compression());

// Add static file middleware (to serve static files).
app.use('/public', Express.static(Path.join(__dirname, '../public')));

// Request router.
app.get('/', function(request, response) {
  response.sendFile(Path.join(__dirname, '../public/index.html'));
})

// Tell server to start listening for connections.
server.listen(port, () => {
  console.log('\n🕺 server init complete, listening for connections on port ' + port + ' 🕺\n');

  // Start listening for events from client.
  setServerHandlers();
});

/**
 * Setup server event handlers.
 */
function setServerHandlers() {
  io.on('connection', (socket) => {
    socket.on('new game', onNewGame);
    socket.on('join request', onJoinRequest);
    socket.on('new player', onNewPlayer);
    socket.on('add bot', (roomCode) => onAddBot(socket, roomCode)); // zmiana tutajj
    socket.on('player ready', onPlayerReady);
    socket.on('game start', onGameStart);
    socket.on('card played', function(card, wildcardSuit = false) {
      //console.log(`Card played event received for card: ${card.name}, at ${new Date().toISOString()}`);

      const player = rooms[socket.player.roomCode].players.find(p => p.id === socket.id);
      //console.log(player);
      onCardPlayed.call(player, card, wildcardSuit);
      //console.log(`Card played event processed for card: ${card.name}, at ${new Date().toISOString()}`);
    });
    socket.on('draw card', function() {
      const player = rooms[socket.player.roomCode].players.find(p => p.id === socket.id);
      onDrawCard.call(player);
    });
    socket.on('player message', onPlayerMessage);
    socket.on('player quit', onPlayerQuit);
    socket.on('disconnect', onDisconnect);
  });
}

/**
 * Handle creating a new game.
 */
function onNewGame(roomCode) {
  // If no room code has been provided, generate a random one.
  if (!roomCode) {
    Crypto.randomBytes(2, (err, buf) => {
      // Generate a random room code.
      const roomCode = buf.toString('hex');

      // Add room to rooms array.
      rooms[roomCode] = new Room(roomCode);

      // Connect the user to the room.
      this.join(roomCode);

      // Send the room code back to the client.
      this.emit('new game', roomCode);

      this.roomCode = roomCode;
    });
  }
  else {
    const foundRoom = Object.keys(rooms).find(room => room === roomCode);

    if (foundRoom) {
      // Notify the user that the room already exists.
      this.emit('room error', 'ROOM ALREADY EXISTS');
    }
    else {
      // Add room to rooms array.
      rooms[roomCode] = new Room(roomCode);

      // Connect the user to the room.
      this.join(roomCode);

      // Send the room code back to the client.
      this.emit('new game', roomCode);

      this.roomCode = roomCode;
    }
  }
}

/**
 * Handle adding a bot to the game.
 */
function onAddBot(socket, roomCode) {
  if (rooms[roomCode]) {
    const botSocket = {
      emit: (event, data) => {
        console.log(`Bot emitting event ${event} with data:`, data);
        io.to(roomCode).emit(event, data);
      },
      id: `bot-${Date.now()}`
    };

    const bot = new BotPlayer(botSocket.id, 'Bot', roomCode, [], botSocket);
    bot.ready = true;
    rooms[roomCode].players.push(bot);
    io.in(roomCode).emit('new player', bot);

    if (checkAllPlayersReady(roomCode)) {
      io.in(roomCode).emit('start countdown');
      rooms[roomCode].countdownStarted = true;

      for (let player of getPlayersInRoom(roomCode)) {
        player.textureMap = [];
      }
    }
  }
}

/**
 * Handle joining an existing game.
 */
function onJoinRequest(roomCode) {
  // Check to see if the supplied room code is actively in use.
  const foundRoom = Object.keys(rooms).find(room => room === roomCode);

  // If room code is valid and the game hasn't started, connect the user.
  if (foundRoom) {
    const socketsInRoom = getSocketsInRoom(roomCode).length;

    // If there are less than 4 sockets connected to the room, connect.
    if (socketsInRoom < 4) {
      if (rooms[foundRoom].gameStarted === false) {
        // Connect the user to the room.
        this.join(roomCode);

        // Send the room code back to the client.
        this.emit('join game', roomCode);
      }
      else {
        // Notify the user that the room's game is in progress.
        this.emit('room error', 'GAME IS IN PROGRESS');
      }
    }
    else {
      // Notify the user that the room is full.
      this.emit('room error', 'ROOM IS FULL');
    }
  }
  else {
    // Notify the user that the room does not exist.
    this.emit('room error', 'GAME DOES NOT EXIST');
  }
}

/**
 * Notify others that a new player has connected.
 *
 * Send the client back a list of existing players in the room.
 */
function onNewPlayer(playerObj, roomCode) {
  const player = new Player(this.id, playerObj.name, roomCode, playerObj.textureMap);
  this.player = player;

  // Build up a list of all current players, send the data to the client.
  this.emit('get players', getPlayersInRoom(roomCode));

  // Add player to the room's players array.
  rooms[roomCode].players.push(this.player);

  // Broadcast new player to other new players.
  this.broadcast.to(roomCode).emit('new player', this.player);
}

/**
 * Notify others that a player is ready to smack down.
 *
 * If all players are ready, randomly pick a player to go first and notify all
 * players that the game has stared.
 */
function onPlayerReady() {
  const roomCode = this.player.roomCode;

  // The player is ready to smack down.
  this.player.ready = true;

  // Let everyone else know the player is ready.
  this.broadcast.to(roomCode).emit('show player ready', this.player);

  // Check to see if all players are ready.
  if (checkAllPlayersReady(roomCode)) {
    io.in(roomCode).emit('start countdown');

    rooms[roomCode].countdownStarted = true;

    // Clear the player's texture map to clean up JSON payload.
    for (let player of getPlayersInRoom(roomCode)) {
      player.textureMap = [];
    }
  }
}

/**
 * Start the game when each player's countdown timer is complete.
 */
function onGameStart() {
  const roomCode = this.player.roomCode;

  rooms[roomCode].startGameCounter++;

  if (rooms[roomCode].startGameCounter === rooms[roomCode].players.length) {
    rooms[roomCode].gameStarted = true;
    io.in(roomCode).emit('game started');
    rooms[roomCode].players = shufflePlayerOrder(roomCode);
    const firstPlayer = rooms[roomCode].players[0];
    io.in(roomCode).emit('show player turn', firstPlayer);
    rooms[roomCode].deck = new Deck();

    for (let i = 0; i <= 7; i++) {
      for (let player of rooms[roomCode].players) {
        dealCardsToPlayer(player);
      }
    }

    const firstCardInPlay = rooms[roomCode].deck.drawPile.shift();
    io.in(roomCode).emit('update card in play', firstCardInPlay);
    rooms[roomCode].deck.playPile.unshift(firstCardInPlay);
    io.in(roomCode).emit('show first card in play', firstCardInPlay);

    handleNextPlayerTurn(firstPlayer, roomCode);
  }
}

function handleNextPlayerTurn(player, roomCode) {
  console.log(`Handling turn for: ${player.name} (Bot: ${player.isBot})`);

  if (player.isBot) {
    // Reset currentPlayerId to allow bot to take a new turn
    rooms[roomCode].currentPlayerId = null;

    setTimeout(() => {
      const move = player.decideMove({
        currentSuit: rooms[roomCode].cardInPlay.suit,
        currentValue: rooms[roomCode].cardInPlay.value,
      });

      if (!move) {
        console.log(`Bot ${player.name} can't make a move, drawing a card...`);
        onDrawCard.call(player);
      } else {
        console.log(`Bot ${player.name} plays: ${move.name}`);
        if (move.value === 'a') {
          console.log('Bot plays an ace with wildcard!');
          onCardPlayed.call(player, move, 'clubs');
        } else {
          onCardPlayed.call(player, move);
        }
      }

      // After the move, reset bot's state to allow for the next turn
      rooms[roomCode].currentPlayerId = player.id;
    }, 500); // Simulate thinking time
  } else {
    rooms[roomCode].currentPlayerId = player.id;
    io.in(roomCode).emit('show player turn', player);
    io.to(player.id).emit('turn start');
  }
}



/**
 * Notify players that a turn has been made, move to next player.
 */
function onCardPlayed(card, wildcardSuit = false) {
  const roomCode = this.roomCode;
  const deck = rooms[roomCode].deck;

  // Prevent processing the same card twice by checking if it's already been played
  if (this.lastPlayedCard && this.lastPlayedCard.name === card.name && this.lastPlayedCard.suit === card.suit) {
      console.log('Duplicate card play detected, ignoring:', card.name);
      return;
  }

  // Store the card as the last played card
  this.lastPlayedCard = card;

  //console.log('On card played:', this.name);
  //console.log("==========================card :", card);
  //console.log("==========================wildcardSuit :", wildcardSuit);

  this.removeCardFromHand(card, deck);

  // Notify all clients how many cards a player has.
  io.in(roomCode).emit('update hand count', this, this.hand.length);

  // Check if the player's hand is empty, if so lower score and deal out more cards.
  if (this.checkHandEmpty()) {
    this.countdown--;

    // Check to see if the game is over.
    if (this.countdown === 0) {
      // Notify players that the game is over and who the winner is.
      io.in(roomCode).emit('game over', this);
      return; // Stop here.
    }

    // Notify everyone that a player's countdown score is being updated.
    io.in(roomCode).emit('update countdown score', this);

    dealCardsToPlayer(this, this.countdown);
  }

  // If a wildcard was played, notify the players that the suit has changed.
  if (wildcardSuit) {
    //console.log(wildcardSuit);
    const wildcard = { value: false, suit: wildcardSuit };
    //console.log('--------------wildcard:')
    //console.log(wildcard);
    io.in(roomCode).emit('update card in play', wildcard);
    rooms[roomCode].cardInPlay = wildcard;
  } else {
    io.in(roomCode).emit('update card in play', card);
    rooms[roomCode].cardInPlay = card;
  }

  io.in(roomCode).emit('show card played', this, card);

  if (rooms[roomCode].players.length > 2 && card.value === 'k') {
    rooms[roomCode].reverseDirection = !rooms[roomCode].reverseDirection;
    io.in(roomCode).emit('game message', 'YOU REVERSED THE DIRECTION OF PLAY');
    io.in(roomCode).emit(roomCode).emit('game message', `${this.name} REVERSED THE DIRECTION PLAY`);
  }

  if (card.value === '4') {
    const skippedPlayer = rooms[roomCode].getNextPlayer();
    io.in(roomCode).emit('game message', `YOU SKIPPED ${skippedPlayer.name}'S TURN`);
    io.to(skippedPlayer.id).emit('game message', `${this.name} SKIPPED YOUR TURN`);
  
    console.log(`Player ${skippedPlayer.name} skipped.`);
  
    // Get the next player (after skipped player) and pass the turn
    const nextPlayer = rooms[roomCode].getNextPlayer();
    console.log(`Next player after skip: ${nextPlayer.name}`);
    
    // Emit turn info and handle the next player's turn
    io.in(roomCode).emit('show player turn', nextPlayer);
    io.to(nextPlayer.id).emit('turn start');
  
    // Handle bot turn if next player is a bot
    return handleNextPlayerTurn(nextPlayer, roomCode);
  }
  
  const player = rooms[roomCode].getNextPlayer();

  if (card.name === 'k of spades') {
    const prevPlayer = rooms[roomCode].getPreviousPlayer();
    io.to(prevPlayer.id).emit('game message', 'PICKUP 5 CARDS');
    dealCardsToPlayer(prevPlayer, 5);
  }

  if (card.name === 'k of hearts') {
    io.to(player.id).emit('game message', 'PICKUP 5 CARDS');
    dealCardsToPlayer(player, 5);
  }

  if (card.value === '2' || card.value === '3') {
    const cardsToDraw = (card.value === '2') ? 2 : 3;
    io.to(player.id).emit('game message', `PICKUP ${cardsToDraw} CARDS`);
    dealCardsToPlayer(player, cardsToDraw);
  }

  io.in(roomCode).emit('show player turn', player);
  io.to(player.id).emit('turn start');
  console.log('nex player turn named:', player.name);

  return handleNextPlayerTurn(player, roomCode);
}

/**
 * Player has no playable cards, deal a new card and move on.
 */
function onDrawCard() {
  const roomCode = this.roomCode;
  console.log(`${this.name} is drawing a card...`);

  dealCardsToPlayer(this);
  io.in(roomCode).emit('show card draw', this);

  const cardDealt = this.getLastCardInHand();
  const isPlayable = checkCardPlayable(cardDealt, rooms[roomCode].cardInPlay, this);

  if (isPlayable) {
    console.log(`${this.name} drew a playable card: ${cardDealt.name}`);
    const player = rooms[roomCode].getNextPlayer();
    io.to(this.id).emit('play drawn card', cardDealt);
    return handleNextPlayerTurn(player, roomCode);
  } else {
    console.log(`${this.name} drew a non-playable card, passing turn.`);
    const player = rooms[roomCode].getNextPlayer();
    io.in(roomCode).emit('show player turn', player);
    io.to(player.id).emit('turn start');
    return handleNextPlayerTurn(player, roomCode);
  }
}


/**
 * When a player sends a message, send it to everyone.
 */
function onPlayerMessage(message) {
  const player = this.player;

  io.in(player.roomCode).emit('player message', message, player);
}

/**
 * When a player quits, notify everyone else in the room.
 */
function onPlayerQuit() {
  const player = this.player;

  this.broadcast.to(player.roomCode).emit('player quit', player);
}

/**
 * Handle user disconnection, notify others who left.
 */
function onDisconnect() {
  // Check to see if the socket has a player data object.
  if ('player' in this) {
    const roomCode = this.player.roomCode;
    const players = getPlayersInRoom(roomCode);

    // Check to see if the room is empty.
    if (players.length === 0) {
      // If the room is empty, remove it from the map.
      delete rooms[roomCode];

      return; // Stop here.
    }
    else {
      // Unready all the players.
      for (let player of players) {
        player.ready = false;
      }

      // Tell everyone the player has disconnected.
      io.in(roomCode).emit('player disconnect', this.player);

      // If someone leaves during the start game countdown, stop the timer and
      // reset the countdown-related variables.
      if (rooms[roomCode].countdownStarted) {
        rooms[roomCode].countdownStarted = false;
        rooms[roomCode].startGameCounter = 0;
      }

      if (rooms[roomCode].gameStarted && !rooms[roomCode].gameOver) {
        // If there's only one player remaining and the game has started,
        // game ogre.
        if (rooms[roomCode].players.length === 2) {
          let winner;

          for (let player of rooms[roomCode].players) {
            if (player.id !== this.id) {
              winner = player
            }
          }

          // Notify player that the game is over and that they win!
          io.in(roomCode).emit('game over', winner);

          return; // Stop here, I think.
        }

        // Put the player's hand back in the play pile so that cards go back into
        // circulation.
        const deck = rooms[roomCode].deck;

        for (let card of this.player.hand) {
          deck.addCardToPlayPile(card);
        }

        // Grab the player turn so we can check if player disconnected on their
        // turn.
        const playerTurn = rooms[roomCode].playerTurn;

        // If a player disconnected on their turn, move to the next player in
        // order.
        if (rooms[roomCode].players[playerTurn].id == this.id) {
          // Grab the next player to play.
          const player = rooms[roomCode].getNextPlayer();

          // Notify everyone who is now playing.
          io.in(roomCode).emit('show player turn', player);

          // Notify the player to start the turn.
          io.to(player.id).emit('turn start');
        }
      }

      // Remove player from room's player order array.
      rooms[roomCode].removePlayerByID(this.id);
    }
  }
  else {
    // Adding an extra check here to see if the socket disconnected without
    // creating a player object (drawing step).
    if (this.roomCode) {
      // If the room is empty after the socket disconnects, remove the room.
      if (getSocketsInRoom(this.roomCode).length === 0) {
        delete rooms[this.roomCode];
      }
    }
  }
}

/**
 * Check and return whether all players are ready to play.
 */
function checkAllPlayersReady(roomCode) {
  const players = getPlayersInRoom(roomCode);

  let ready = true;

  // Only continue if there is 2 or more players.
  if (players.length >= 2) {
    // See if any players are not ready.
    for (let player of players) {
      if (player.ready === false) {
        ready = false;
      }
    }
  }
  else {
    ready = false;
  }
  return ready;
}

/**
 * Shuffle player order using Fisher Yates implementation.
 */
function shufflePlayerOrder(roomCode) {
  const players = getPlayersInRoom(roomCode);

  for (let i = players.length - 1; i > 0; i--) {
    const randomIndex = Math.floor(Math.random() * (i + 1));
    const itemAtIndex = players[randomIndex];

    players[randomIndex] = players[i];
    players[i] = itemAtIndex;
  }

  return players;
}

/**
 * Return all sockets currently connected to a room.
 */
function getSocketsInRoom(roomCode) {
  const sockets = [];

  // Check to see if anyone is even in the room.
  if (io.sockets.adapter.rooms[roomCode] !== undefined) {
    // Loop over sockets connected to a room, return all players found.
    Object.keys(io.sockets.adapter.rooms[roomCode].sockets).forEach(socket => {
      sockets.push(socket);
    });
  }

  return sockets;
}

/**
 * Return all players currently connected to a room.
 */
function getPlayersInRoom(roomCode) {
  return rooms[roomCode] ? rooms[roomCode].players : [];
}

/**
 * Deal a number of cards to a player.
 */
function dealCardsToPlayer(player, numberOfCards = 1) {
  const deck = rooms[player.roomCode].deck;

  for (let i = 0; i < numberOfCards; i++) {
    const card = deck.drawPile.shift();
    if (card) {
      player.addCardToHand(card);
      io.to(player.id).emit('add card to hand', card);
      io.in(player.roomCode).emit('update hand count', player, player.hand.length);
    }
  }

  if (deck.drawPile.length === 0) {
    deck.shuffleDeck();
    io.in(player.roomCode).emit('shuffle deck');
  }
  //console.log('deal card to:', player.name);
  if (player.isBot)
  {
    //console.log('bot get the cart');
  }
}

/**
 * Check to see if a card is playable, otherwise return false.
 */
function checkCardPlayable(card, currentCardInPlay, player) {
  const isPlayable =
    card.suit == currentCardInPlay.suit ||
    card.value == currentCardInPlay.value ||
    card.value == 'q' ||
    (card.value == '2' && currentCardInPlay.value == '2') ||
    (card.value == '3' && currentCardInPlay.value == '3') ||
    (card.value == '4' && currentCardInPlay.value == '4') ||
    (card.value == 'j') ||
    (card.value == 'k' && (currentCardInPlay.value == 'k' || (currentCardInPlay.value == 'a' && (currentCardInPlay.suit == 'hearts' || currentCardInPlay.suit == 'spades')))) ||
    (card.value == 'a');

  return isPlayable;
}
