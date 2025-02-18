const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const path = require('path');
const crypto = require('crypto');

// Import countries
const countries = require('./public/countries.js');

// Add cors middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

app.use(express.static('public'));

// Store active games
const games = new Map();

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('create-game', (settings) => {
    try {
      console.log('Creating game with settings:', settings);
      console.log('Request from socket:', socket.id);
      
      const gameCode = generateGameCode();
      
      // Generate the game board on the server
      const gameBoard = generateGameBoard(settings);
      
      const game = {
        code: gameCode,
        settings: settings,
        players: [socket.id],
        activePlayers: [socket.id],
        currentTurn: 0,
        board: Array(9).fill(null),
        gameState: [],
        gameBoard: gameBoard, // Store the generated board
        creator: socket.id    // Add creator tracking
      };
      
      games.set(gameCode, game);
      
      socket.join(gameCode);
      socket.emit('game-created', gameCode);
      socket.emit('game-start', {
        ...game,
        players: game.activePlayers,
        isCreator: true      // Tell the creator they're the creator
      });
      
      console.log('Game code sent to creator');
    } catch (error) {
      console.error('Error in create-game:', error);
      socket.emit('error', 'Failed to create game');
    }
  });

  socket.on('join-game', (code) => {
    console.log('Join game request:', code);
    console.log('From socket:', socket.id);
    
    const game = games.get(code);
    if (!game) {
      console.log('Game not found:', code);
      socket.emit('error', 'Game not found');
      return;
    }

    // Check if already an active player
    if (game.activePlayers.includes(socket.id)) {
      console.log('Player already active in game:', socket.id);
      return;
    }

    // If game is full (2 active players), emit error
    if (game.activePlayers.length >= 2) {
      console.log('Game is full:', code);
      socket.emit('error', 'Game is full');
      return;
    }

    // Add player to both lists and join the room
    if (!game.players.includes(socket.id)) {
      game.players.push(socket.id);
    }
    game.activePlayers.push(socket.id);
    socket.join(code);

    console.log('Player joined game:', socket.id);
    console.log('Players in game:', game.activePlayers);

    // Notify all players in the game
    io.to(code).emit('game-start', {
      ...game,
      players: game.activePlayers
    });
  });

  socket.on('make-move', ({ code, cell, guess, player, correct }) => {
    const game = games.get(code);
    if (!game) return;

    // Only allow active players to make moves
    const playerIndex = game.activePlayers.indexOf(socket.id);
    if (playerIndex !== game.currentTurn) return;

    // Update the game board state
    if (correct) {
      game.board[cell] = playerIndex + 1;
    }

    // Check for win or draw
    const hasWon = checkWin(game.board, playerIndex + 1);
    const isDraw = game.board.every(cell => cell !== null && cell !== undefined);

    // Handle move logic here
    io.to(code).emit('move-made', {
      player: playerIndex,
      cell,
      guess,
      correct,
      board: game.board,
      playerNumber: playerIndex + 1,
      nextTurn: (playerIndex + 1) % 2,
      hasWon: hasWon,
      isDraw: isDraw,
      gameOver: hasWon || isDraw
    });

    // Only switch turns if game isn't over
    if (!hasWon && !isDraw) {
      game.currentTurn = (game.currentTurn + 1) % 2;
    }
  });

  socket.on('request-new-game', (code) => {
    const game = games.get(code);
    if (!game) return;

    // Only allow the creator to start a new game
    if (game.creator !== socket.id) {
      socket.emit('error', 'Only the game creator can start a new game');
      return;
    }

    // Generate new game board with same settings
    const newGameBoard = generateGameBoard(game.settings);
    game.gameBoard = newGameBoard;
    game.board = Array(9).fill(null);
    game.currentTurn = 0;

    // Send new game state to all players
    io.to(code).emit('new-game', {
      ...game,
      players: game.activePlayers
    });
  });

  socket.on('leave-game', (code) => {
    const game = games.get(code);
    if (!game) return;

    // Remove player from game
    const playerIndex = game.activePlayers.indexOf(socket.id);
    if (playerIndex > -1) {
      game.activePlayers.splice(playerIndex, 1);
      socket.leave(code);
      
      // Notify other player if they exist
      if (game.activePlayers.length > 0) {
        io.to(code).emit('player-disconnected');
      }
      
      // Delete game if no players left
      if (game.activePlayers.length === 0) {
        games.delete(code);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    for (const [code, game] of games.entries()) {
      // Remove from active players if they were active
      const activeIndex = game.activePlayers.indexOf(socket.id);
      if (activeIndex > -1) {
        game.activePlayers.splice(activeIndex, 1);
        io.to(code).emit('player-disconnected');
        
        // If no active players left, delete the game
        if (game.activePlayers.length === 0) {
          games.delete(code);
        }
      }
      
      // Remove from players list
      const playerIndex = game.players.indexOf(socket.id);
      if (playerIndex > -1) {
        game.players.splice(playerIndex, 1);
      }
    }
  });

  socket.on('request-daily-challenge', () => {
    console.log('Daily challenge requested');
    const dailyBoard = getDailyChallenge();
    
    if (!dailyBoard || dailyBoard.length === 0) {
        console.error('Failed to generate daily challenge board');
        socket.emit('error', 'Failed to generate daily challenge');
        return;
    }
    
    console.log('Sending daily challenge with', dailyBoard.length, 'countries');
    console.log('First country in challenge:', dailyBoard[0].name);
    
    socket.emit('daily-challenge', { gameBoard: dailyBoard });
  });
});

function generateGameCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function generateGameBoard(settings) {
  const { difficulty, continent } = settings;
  
  // Filter countries based on settings
  let availableCountries = countries.filter(country => {
    const difficultyMatch = difficulty === 'all' || country.difficulty === difficulty;
    const continentMatch = continent === 'all' || country.continent === continent;
    return difficultyMatch && continentMatch;
  });

  if (availableCountries.length < 9) {
    throw new Error('Not enough countries for selected settings');
  }

  // Randomly select 9 countries
  const gameBoard = [];
  for (let i = 0; i < 9; i++) {
    const randomIndex = Math.floor(Math.random() * availableCountries.length);
    gameBoard.push(availableCountries[randomIndex]);
    availableCountries.splice(randomIndex, 1);
  }

  return gameBoard;
}

function getDailyChallenge() {
    const today = new Date().toDateString();
    const seed = crypto.createHash('md5').update(today).digest('hex');
    
    // Filter for medium and hard countries only
    const eligibleCountries = countries.filter(country => 
        country.difficulty === 'medium' || country.difficulty === 'hard'
    );
    
    console.log('Found', eligibleCountries.length, 'eligible countries');
    
    if (eligibleCountries.length < 9) {
        console.error('Not enough eligible countries for daily challenge');
        return [];
    }
    
    // Create a copy of eligible countries to avoid modifying the original array
    let availableCountries = [...eligibleCountries];
    const dailyCountries = [];
    
    // Use the seed to consistently select 9 countries for the day
    const seededRandom = seedRandom(seed);
    
    while (dailyCountries.length < 9 && availableCountries.length > 0) {
        const index = Math.floor(seededRandom() * availableCountries.length);
        dailyCountries.push(availableCountries[index]);
        availableCountries.splice(index, 1);
    }
    
    console.log('Generated daily challenge with', dailyCountries.length, 'countries');
    return dailyCountries;
}

function seedRandom(seed) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        hash = hash & hash;
    }
    
    return function() {
        hash = Math.sin(hash) * 10000;
        return hash - Math.floor(hash);
    };
}

function checkWin(board, player) {
  const winPatterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
    [0, 4, 8], [2, 4, 6] // Diagonals
  ];

  return winPatterns.some(pattern => 
    pattern.every(index => board[index] === player)
  );
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
