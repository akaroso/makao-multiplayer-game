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

// Tablica do śledzenia aktywnych pokojów.
let rooms = [];

// Konfiguracja serwera.
const app = Express();
const server = Http.Server(app);
const io = SocketIO(server);
const port = process.env.PORT || 3000;

// Odpalenie Helmet i Compression dla bezpieczeństwa i wydajności
app.use(Helmet());
app.use(Compression());

// Dodanie middleware do obsługi plików statycznych (do serwowania plików statycznych).
app.use('/public', Express.static(Path.join(__dirname, '../public')));

// Request router.
app.get('/', function(request, response) {
  response.sendFile(Path.join(__dirname, '../public/index.html'));
})

// Uruchom serwer i zacznij nasłuchiwać połączeń.
server.listen(port, () => {
  console.log('\n🕺 server init complete, listening for connections on port ' + port + ' 🕺\n');

  // Rozpocznij nasłuchiwanie wydarzeń z klienta.
  setServerHandlers();
});

/**
 * Ustawienie obsługi wydarzeń serwera.
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

      const player = rooms[socket.player.roomCode].players.find(p => p.id === socket.id);
      onCardPlayed.call(player, card, wildcardSuit);
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
 * Obsługa tworzenia nowej gry.
 */
function onNewGame(roomCode) {
  // Jeśli nie podano kodu pokoju, wygeneruj losowy.
  if (!roomCode) {
    Crypto.randomBytes(2, (err, buf) => {
      // Wygeneruj losowy kod pokoju.
      const roomCode = buf.toString('hex');

      // Dodaj pokój do tablicy rooms.
      rooms[roomCode] = new Room(roomCode);

      // Połącz użytkownika z pokojem.
      this.join(roomCode);

      // Wyślij kod pokoju z powrotem do klienta.
      this.emit('new game', roomCode);

      this.roomCode = roomCode;
    });
  }
  else {
    const foundRoom = Object.keys(rooms).find(room => room === roomCode);

    if (foundRoom) {
      // Powiadom użytkownika, że pokój już istnieje.
      this.emit('room error', 'ROOM ALREADY EXISTS');
    }
    else {
      // Dodaj pokój do tablicy rooms.
      rooms[roomCode] = new Room(roomCode);

      // Połącz użytkownika z pokojem.
      this.join(roomCode);

      // Wyślij kod pokoju z powrotem do klienta.
      this.emit('new game', roomCode);

      this.roomCode = roomCode;
    }
  }
}

/**
 * Obsługa dodawania bota do gry.
 */
function onAddBot(socket, roomCode) {
  if (rooms[roomCode]) {
    const botSocket = {
      emit: (event, data) => {
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
 * Obsługa dołączenia do istniejącej gry.
 */
function onJoinRequest(roomCode) {
  // Sprawdź, czy podany kod pokoju jest aktualnie w użyciu.
  const foundRoom = Object.keys(rooms).find(room => room === roomCode);

  // Jeśli kod pokoju jest prawidłowy i gra nie została rozpoczęta, połącz użytkownika.
  if (foundRoom) {
    const socketsInRoom = getSocketsInRoom(roomCode).length;

    // Jeśli w pokoju jest mniej niż 4 połączenia, połącz.
    if (socketsInRoom < 4) {
      if (rooms[foundRoom].gameStarted === false) {
        // Połącz użytkownika z pokojem.
        this.join(roomCode);

        // Wyślij kod pokoju z powrotem do klienta.
        this.emit('join game', roomCode);
      }
      else {
        // Powiadom użytkownika, że gra w pokoju jest w toku.
        this.emit('room error', 'GAME IS IN PROGRESS');
      }
    }
    else {
      // Powiadom użytkownika, że pokój jest pełny.
      this.emit('room error', 'ROOM IS FULL');
    }
  }
  else {
    // Powiadom użytkownika, że pokój nie istnieje.
    this.emit('room error', 'GAME DOES NOT EXIST');
  }
}

/**
 * Powiadom innych, że nowy gracz się połączył.
 *
 * Wyślij klientowi listę istniejących graczy w pokoju.
 */
function onNewPlayer(playerObj, roomCode) {
  const player = new Player(this.id, playerObj.name, roomCode, playerObj.textureMap);
  this.player = player;

  // Zbuduj listę wszystkich obecnych graczy i wyślij dane do klienta.
  this.emit('get players', getPlayersInRoom(roomCode));

  // Dodaj gracza do tablicy graczy w pokoju.
  rooms[roomCode].players.push(this.player);

  // Powiadom innych graczy o nowym graczu.
  this.broadcast.to(roomCode).emit('new player', this.player);
}

/**
 * Powiadom innych, że gracz jest gotowy do gry.
 *
 * Jeśli wszyscy gracze są gotowi, losowo wybierz pierwszego gracza i powiadom wszystkich, że gra się rozpoczęła.
 */
function onPlayerReady() {
  const roomCode = this.player.roomCode;

  // Gracz jest gotowy do gry.
  this.player.ready = true;

  // Powiadom wszystkich, że gracz jest gotowy.
  this.broadcast.to(roomCode).emit('show player ready', this.player);

  // Sprawdź, czy wszyscy gracze są gotowi.
  if (checkAllPlayersReady(roomCode)) {
    io.in(roomCode).emit('start countdown');

    rooms[roomCode].countdownStarted = true;

    // Wyczyść mapę tekstur gracza, aby oczyścić przesyłane dane JSON.
    for (let player of getPlayersInRoom(roomCode)) {
      player.textureMap = [];
    }
  }
}

/**
 * Rozpocznij grę, gdy timer odliczania każdego gracza się zakończy.
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
  if (player.isBot) {
    // Reset currentPlayerId to allow bot to take a new turn
    rooms[roomCode].currentPlayerId = null;

    setTimeout(() => {
      const move = player.decideMove({
        currentSuit: rooms[roomCode].cardInPlay.suit,
        currentValue: rooms[roomCode].cardInPlay.value,
      });

      if (!move) {
        onDrawCard.call(player);
      } else {
        if (move.card.value === 'a') {
          // Bot wybiera najlepszy kolor (suit) na podstawie kart w ręku
          const bestSuit = move.wildcardSuit;
          onCardPlayed.call(player, move.card, bestSuit);
        } else {
          onCardPlayed.call(player, move.card);
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
 * Powiadom graczy, że ruch został wykonany, przejdź do następnego gracza.
 */
function onCardPlayed(card, wildcardSuit = false) {
  const roomCode = this.roomCode;
  const deck = rooms[roomCode].deck;

  // Zapobiegaj przetwarzaniu tej samej karty dwukrotnie, sprawdzając, czy została już zagrana
  if (this.lastPlayedCard && this.lastPlayedCard.name === card.name && this.lastPlayedCard.suit === card.suit) {
      console.log('Duplicate card play detected, ignoring:', card.name);
      return;
  }

  // Zapisz kartę jako ostatnio zagraną kartę
  this.lastPlayedCard = card;

  this.removeCardFromHand(card, deck);

  // Powiadom wszystkich klientów, ile kart ma gracz.
  io.in(roomCode).emit('update hand count', this, this.hand.length);

  // Sprawdź, czy ręka gracza jest pusta, jeśli tak, obniż wynik i rozdaj więcej kart.
  if (this.checkHandEmpty()) {
    this.countdown--;

    // Sprawdź, czy gra się skończyła.
    if (this.countdown === 0) {
      // Powiadom graczy, że gra się zakończyła i kto wygrał.
      io.in(roomCode).emit('game over', this);
      return; // Stop here.
    }

    io.in(roomCode).emit('update countdown score', this);

    dealCardsToPlayer(this, this.countdown);
  }

  // Jeśli została zagrana karta zmieniająca kolor, powiadom graczy, że kolor się zmienił.
  if (wildcardSuit) {
    const wildcard = { value: false, suit: wildcardSuit };

    io.in(roomCode).emit('update card in play', wildcard);
    rooms[roomCode].cardInPlay = wildcard;
  } else {
    io.in(roomCode).emit('update card in play', card);
    rooms[roomCode].cardInPlay = card;
  }

  io.in(roomCode).emit('show card played', this, card);

  // Obsługa odwrócenia kierunku (3+ graczy)
  if (rooms[roomCode].players.length > 2 && card.value === 'k') {
    rooms[roomCode].reverseDirection = !rooms[roomCode].reverseDirection;
    io.in(roomCode).emit('game message', 'YOU REVERSED THE DIRECTION OF PLAY');
    io.in(roomCode).emit(roomCode).emit('game message', `${this.name} REVERSED THE DIRECTION PLAY`);
  }

  if (card.value === '4') {
    const skippedPlayer = rooms[roomCode].getNextPlayer();
    io.in(roomCode).emit('game message', `YOU SKIPPED ${skippedPlayer.name}'S TURN`);
    io.to(skippedPlayer.id).emit('game message', `${this.name} SKIPPED YOUR TURN`);
    
    // Pobierz następnego gracza (po pominiętym) i przekaż turę
    const nextPlayer = rooms[roomCode].getNextPlayer();
    
    // Emituj informacje o turze i obsłuż turę następnego gracza
    io.in(roomCode).emit('show player turn', nextPlayer);
    io.to(nextPlayer.id).emit('turn start');
  
    // Obsługa tury bota, jeśli następny gracz jest botem
    return handleNextPlayerTurn(nextPlayer, roomCode);
  }
  
  const player = rooms[roomCode].getNextPlayer();

  if (card.name === 'k of spades') {
    let prevPlayer = rooms[roomCode].getPreviousPlayer();
    // Upewnij się, że poprzedni gracz nie jest tym, który zagrał kartę (dla 2 graczy)
    if (prevPlayer.id === this.id) {
      prevPlayer = rooms[roomCode].getNextPlayer();
    }

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

  return handleNextPlayerTurn(player, roomCode);
}

/**
 * Gracz nie ma grywalnych kart, dobierz nową kartę i przejdź dalej.
 */
function onDrawCard() {
  const roomCode = this.roomCode;

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
 * Gdy gracz wyśle wiadomość, wyślij ją wszystkim.
 */
function onPlayerMessage(message) {
  const player = this.player;

  io.in(player.roomCode).emit('player message', message, player);
}

/**
 * Gdy gracz opuszcza grę, powiadom wszystkich innych w pokoju.
 */
function onPlayerQuit() {
  const player = this.player;

  this.broadcast.to(player.roomCode).emit('player quit', player);
}

/**
 * Obsługa rozłączenia użytkownika, powiadom innych, kto odszedł.
 */
function onDisconnect() {
  // Check to see if the socket has a player data object.
  if ('player' in this) {
    const roomCode = this.player.roomCode;
    const players = getPlayersInRoom(roomCode);

    // Sprawdź, czy pokój jest pusty.
    if (players.length === 0) {
      // Jeśli pokój jest pusty, usuń go z mapy.
      delete rooms[roomCode];

      return; // Stop here.
    }
    else {
      // Oznacz wszystkich graczy jako niegotowych.
      for (let player of players) {
        player.ready = false;
      }

      // Powiedz wszystkim, że gracz się rozłączył.
      io.in(roomCode).emit('player disconnect', this.player);

      // Jeśli ktoś opuści grę podczas odliczania do rozpoczęcia gry, zatrzymaj timer i
      // zresetuj zmienne związane z odliczaniem.
      if (rooms[roomCode].countdownStarted) {
        rooms[roomCode].countdownStarted = false;
        rooms[roomCode].startGameCounter = 0;
      }

      if (rooms[roomCode].gameStarted && !rooms[roomCode].gameOver) {
        // Jeśli w pokoju został tylko jeden gracz i gra się rozpoczęła,
        // gra się kończy.
        if (rooms[roomCode].players.length === 2) {
          let winner;

          for (let player of rooms[roomCode].players) {
            if (player.id !== this.id) {
              winner = player
            }
          }

          // Powiadom gracza, że gra się zakończyła i że wygrał!
          io.in(roomCode).emit('game over', winner);

          return; // Stop here
        }

        // Zwróć karty z ręki gracza z powrotem do stosu, aby karty wróciły do obiegu
        const deck = rooms[roomCode].deck;

        for (let card of this.player.hand) {
          deck.addCardToPlayPile(card);
        }

        // Pobierz turę gracza, aby sprawdzić, czy gracz rozłączył się podczas swojej tury
        const playerTurn = rooms[roomCode].playerTurn;

        // Jeśli gracz rozłączył się w swojej turze, przejdź do następnego gracza w kolejności
        if (rooms[roomCode].players[playerTurn].id == this.id) {
          // Pobierz następnego gracza do gry.
          const player = rooms[roomCode].getNextPlayer();

          // Powiadom wszystkich, kto teraz gra.
          io.in(roomCode).emit('show player turn', player);

          // Powiadom gracza, aby rozpoczął turę.
          io.to(player.id).emit('turn start');
        }
      }

      // Usuń gracza z tablicy graczy w pokoju.
      rooms[roomCode].removePlayerByID(this.id);
    }
  }
  else {
    // Dodatkowe sprawdzenie, by zobaczyć, czy socket rozłączyło się bez
    // utworzenia obiektu gracza (krok doboru).
    if (this.roomCode) {
      // Jeśli pokój jest pusty po rozłączeniu socketa, usuń pokój.
      if (getSocketsInRoom(this.roomCode).length === 0) {
        delete rooms[this.roomCode];
      }
    }
  }
}

/**
 * Sprawdź i zwróć, czy wszyscy gracze są gotowi do gry.
 */
function checkAllPlayersReady(roomCode) {
  const players = getPlayersInRoom(roomCode);

  let ready = true;

  // Kontynuuj tylko wtedy, gdy jest 2 lub więcej graczy.
  if (players.length >= 2) {
    // Sprawdź, czy któryś z graczy nie jest gotowy.
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
 * Przetasowanie kolejności graczy za pomocą algorytmu Fisher-Yates.
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
 * Zwraca wszystkie sockety aktualnie połączone z pokojem.
 */
function getSocketsInRoom(roomCode) {
  const sockets = [];

  // Sprawdź, czy ktoś w ogóle jest w pokoju.
  if (io.sockets.adapter.rooms[roomCode] !== undefined) {
    // Iteruj po socketach podłączonych do pokoju, zwróć wszystkich znalezionych graczy.
    Object.keys(io.sockets.adapter.rooms[roomCode].sockets).forEach(socket => {
      sockets.push(socket);
    });
  }

  return sockets;
}

/**
 * Zwraca wszystkich graczy aktualnie połączonych z pokojem.
 */
function getPlayersInRoom(roomCode) {
  return rooms[roomCode] ? rooms[roomCode].players : [];
}

/**
 * Rozdaj określoną liczbę kart graczowi.
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
}

/**
 * Sprawdź, czy karta może zostać zagrana, w przeciwnym razie zwróć false.
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
