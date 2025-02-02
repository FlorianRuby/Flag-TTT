let currentGame = [];
let activeCell = null;
let correctAnswers = 0;
let currentFilteredCountries = [];
let currentPlayer = 1; // Track current player (1 or 2)
let gameBoard = Array(9).fill(null); // Track board state
let selectedDifficulty = 'all';
let selectedContinent = 'all';
let socket;
let gameCode = null;
let isMultiplayerGame = false;
let myPlayerNumber = null;  // Store player's number (1 or 2)
let currentTurn = 1;       // Track whose turn it is (1 or 2)
let isDailyChallenge = false;
let remainingDailyGuesses = 15;
let dailyStats = {
    lastPlayed: null,
    completed: false
};

const countryAliases = {
  'uk': 'United Kingdom',
  'gb': 'United Kingdom',
  'us': 'United States',
  'usa': 'United States',
  'uae': 'United Arab Emirates',
  'drc': 'Democratic Republic of the Congo',
  'car': 'Central African Republic',
  'png': 'Papua New Guinea',
  'nz': 'New Zealand',
  'kr': 'South Korea',
  'kp': 'North Korea',
};

function updateAutocompleteSuggestions() {
  const difficulty = document.getElementById("difficulty").value;
  currentFilteredCountries = clientCountries.filter(country => {
    const difficultyMatch = difficulty === 'all' || country.difficulty === difficulty;
    const continentMatch = selectedContinent === 'all' || country.continent === selectedContinent;
    return difficultyMatch && continentMatch;
  });
}

function showSuggestions(input) {
  const suggestionsContainer = document.getElementById("country-suggestions");
  suggestionsContainer.innerHTML = "";

  if (!input) {
    suggestionsContainer.style.display = "none";
    return;
  }

  const inputLower = input.toLowerCase();
  const matches = [];

  // First check for exact matches
  for (const country of currentFilteredCountries) {
    if (matches.length >= 5) break;
    
    const countryName = country.name.toLowerCase();
    const countryCode = country.code.toLowerCase();
    
    // Check if input matches start of country name
    if (countryName.startsWith(inputLower)) {
      matches.push(country);
      continue;
    }
    
    // Check if input matches anywhere in country name
    if (countryName.includes(inputLower)) {
      matches.push(country);
      continue;
    }
    
    // Check country code
    if (countryCode.includes(inputLower)) {
      matches.push(country);
      continue;
    }
    
    // Check aliases
    for (const [alias, fullName] of Object.entries(countryAliases)) {
      if (alias.includes(inputLower) && fullName === country.name) {
        matches.push(country);
        break;
      }
    }
  }

  if (matches.length === 0) {
    suggestionsContainer.style.display = "none";
    return;
  }

  // Sort matches to prioritize matches that start with the input
  matches.sort((a, b) => {
    const aStartsWith = a.name.toLowerCase().startsWith(inputLower);
    const bStartsWith = b.name.toLowerCase().startsWith(inputLower);
    if (aStartsWith && !bStartsWith) return -1;
    if (!aStartsWith && bStartsWith) return 1;
    return a.name.localeCompare(b.name);
  });

  matches.slice(0, 5).forEach((country) => {
    const div = document.createElement("div");
    div.className = "autocomplete-item";
    div.textContent = country.name;
    div.onclick = () => {
      document.getElementById("guess").value = country.name;
      suggestionsContainer.style.display = "none";
    };
    suggestionsContainer.appendChild(div);
  });

  suggestionsContainer.style.display = "block";
}

function startSinglePlayerGame() {
  isDailyChallenge = false;  // Reset daily challenge flag
  selectedDifficulty = document.getElementById('start-difficulty').value;
  selectedContinent = document.getElementById('continent').value;
  
  // Hide start screen and show game screen
  document.getElementById('start-screen').style.display = 'none';
  document.getElementById('game-screen').style.display = 'block';
  
  // Show difficulty selector and hide guesses display
  document.getElementById('difficulty').style.display = 'block';
  document.getElementById('remaining-guesses').classList.remove('active');
  
  // Update difficulty dropdown to match selected difficulty if not 'all'
  if (selectedDifficulty !== 'all') {
    document.getElementById('difficulty').value = selectedDifficulty;
  }
  
  startNewGame();
}

function startNewGame() {
  const difficulty = document.getElementById("difficulty").value;
  selectedDifficulty = difficulty;
  
  if (isMultiplayerGame) {
    // Request new game from server
    socket.emit('request-new-game', gameCode);
    return;
  }
  
  // Single player logic
  currentGame = [];
  currentPlayer = 1;
  gameBoard = Array(9).fill(null);
  correctAnswers = 0;

  // Filter countries based on current settings
  const filteredCountries = clientCountries.filter(country => {
    const difficultyMatch = difficulty === 'all' || country.difficulty === difficulty;
    const continentMatch = selectedContinent === 'all' || country.continent === selectedContinent;
    return difficultyMatch && continentMatch;
  });

  // Create a copy of filtered countries to avoid duplicates
  let availableCountries = [...filteredCountries];
  
  // Clear the grid
  const grid = document.getElementById("grid");
  grid.innerHTML = "";
  
  if (availableCountries.length < 9) {
    showMessage("Not enough countries for selected difficulty!", "red");
    return;
  }

  // Generate board for single player
  for (let i = 0; i < 9; i++) {
    const randomIndex = Math.floor(Math.random() * availableCountries.length);
    const randomCountry = availableCountries[randomIndex];
    availableCountries.splice(randomIndex, 1);
    
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.style.backgroundImage = `url('flags/${randomCountry.code}.svg')`;
    cell.dataset.code = randomCountry.code;
    cell.dataset.name = randomCountry.name.toLowerCase();
    cell.dataset.index = i;
    cell.onclick = () => selectCell(cell);
    grid.appendChild(cell);
    currentGame.push(randomCountry);
  }
  
  document.getElementById("message").textContent = "";
  document.getElementById("guess").value = "";
  updateAutocompleteSuggestions();
  updateTurnMessage();
  
  // Hide remaining guesses display if it's not a daily challenge
  if (!isDailyChallenge) {
    const guessesDisplay = document.getElementById('remaining-guesses');
    guessesDisplay.classList.remove('active');
  }
}

function selectCell(cell) {
  // Don't allow selecting cells if it's not your turn in multiplayer
  if (isMultiplayerGame && currentTurn !== myPlayerNumber) {
    showMessage("It's not your turn!", "red");
    return;
  }
  
  // Don't allow selecting already claimed cells
  if (cell.classList.contains('player1') || cell.classList.contains('player2')) {
    return;
  }
  
  if (activeCell) activeCell.classList.remove("active");
  activeCell = cell;
  cell.classList.add("active");
  
  // Focus the input field after selecting a cell
  document.getElementById("guess").focus();
}

function checkGuess() {
  if (!activeCell) {
    showMessage("Please select a cell first!", "red");
    return;
  }

  const guess = document.getElementById("guess").value.trim().toLowerCase();
  if (!guess) {
    showMessage("Please enter a guess!", "red");
    return;
  }

  const expectedName = activeCell.dataset.name.toLowerCase();
  const isCorrect = guess === expectedName || 
                   (countryAliases[guess] && countryAliases[guess].toLowerCase() === expectedName);

  if (isDailyChallenge) {
    remainingDailyGuesses--;
    document.getElementById('remaining-guesses').textContent = `Remaining Guesses: ${remainingDailyGuesses}`;
  }

  if (isCorrect) {
    activeCell.classList.add('correct');
    correctAnswers++;
    
    if (correctAnswers === 9) {
      if (isDailyChallenge) {
        dailyStats.completed = true;
        localStorage.setItem('dailyStats', JSON.stringify(dailyStats));
        showMessage(`Congratulations! You've completed today's challenge with ${remainingDailyGuesses} guesses remaining!`, "green");
      } else {
        showMessage("Congratulations! You've won!", "green");
      }
      disableGame();
    }
  } else {
    showMessage("Wrong guess!", "red");
    if (isDailyChallenge && remainingDailyGuesses <= 0) {
      showMessage("Game Over! You've run out of guesses.", "red");
      disableGame();
    }
  }

  document.getElementById("guess").value = "";
  activeCell.classList.remove("active");
  activeCell = null;
}

function checkWin(player) {
  const winPatterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
    [0, 4, 8], [2, 4, 6] // Diagonals
  ];

  return winPatterns.some(pattern => 
    pattern.every(index => gameBoard[index] === player)
  );
}

function disableGame() {
  const cells = document.querySelectorAll('.cell');
  cells.forEach(cell => {
    cell.onclick = null;
    if (!cell.classList.contains('correct')) {
      cell.style.opacity = '0.5';
    }
  });
  document.getElementById("guess").disabled = true;
}

function updateTurnMessage() {
  if (isMultiplayerGame) {
    const isMyTurn = currentTurn === myPlayerNumber;
    if (isMyTurn) {
      showMessage("Your turn!", myPlayerNumber === 1 ? '#4a90e2' : '#e24a4a');
      document.getElementById("guess").disabled = false;
    } else {
      showMessage("Opponent's turn...", '#808080');
      document.getElementById("guess").disabled = true;
    }
  } else {
    showMessage(`Player ${currentPlayer}'s turn`, currentPlayer === 1 ? '#4a90e2' : '#e24a4a');
  }
}

function showMessage(text, color) {
  const messageEl = document.getElementById("message");
  messageEl.textContent = text;
  messageEl.style.color = color;
}

// Event Listeners
document.getElementById("guess").addEventListener("input", function (e) {
  showSuggestions(this.value);
});

document.addEventListener("click", function (e) {
  if (!e.target.closest(".autocomplete-container")) {
    document.getElementById("country-suggestions").style.display = "none";
  }
});

// Add these event listeners at the end of the file
window.startNewGame = startNewGame;
window.checkGuess = checkGuess;

// Initialize game
document.addEventListener('DOMContentLoaded', function() {
    // Don't auto-start the game
    document.getElementById("difficulty")?.addEventListener("change", startNewGame);
    
    // Only add opacity listener if element exists
    const opacityElement = document.getElementById('opacity');
    if (opacityElement) {
        opacityElement.addEventListener('input', updateOverlayOpacity);
        updateOverlayOpacity();
    }

    initializeSocket();
    initializeDailyStats();
});

// Add this function to handle opacity changes
function updateOverlayOpacity() {
  const opacity = document.getElementById('opacity').value;
  document.documentElement.style.setProperty('--overlay-opacity', opacity / 100);
  document.getElementById('opacity-value').textContent = `${opacity}%`;
}

// Add this function to show start screen
function showStartScreen() {
  // Clean up multiplayer state
  if (isMultiplayerGame && socket && gameCode) {
    socket.emit('leave-game', gameCode);
    gameCode = null;
    isMultiplayerGame = false;
    myPlayerNumber = null;
    currentTurn = 1;
  }
  
  // Reset game state
  currentGame = [];
  currentPlayer = 1;
  gameBoard = Array(9).fill(null);
  correctAnswers = 0;
  activeCell = null;
  
  // Switch screens
  document.getElementById('start-screen').style.display = 'block';
  document.getElementById('game-screen').style.display = 'none';
  
  // Clear game code display
  const gameCodeDisplay = document.getElementById('game-code-display');
  gameCodeDisplay.textContent = '';
  gameCodeDisplay.classList.remove('active');
  
  // Reset input field
  document.getElementById('game-code').value = '';
}

function initializeSocket() {
  try {
    console.log('Initializing socket connection...');
    socket = io('http://localhost:3000', {
      transports: ['websocket'],
      upgrade: false
    });

    socket.on('connect', () => {
      console.log('Connected to server with ID:', socket.id);
    });

    socket.on('connect_error', (error) => {
      console.error('Connection error details:', error);
      showMessage('Failed to connect to server', 'red');
    });

    socket.on('game-created', (code) => {
      console.log('Game created with code:', code);
      gameCode = code;
      document.getElementById('game-code').value = code;
      showMessage(`Game created! Share code: ${code}`, 'green');
      
      // Show game code in game screen
      const gameCodeDisplay = document.getElementById('game-code-display');
      gameCodeDisplay.textContent = `Game Code: ${code}`;
      gameCodeDisplay.classList.add('active');
      gameCodeDisplay.onclick = () => {
        navigator.clipboard.writeText(code)
          .then(() => showMessage('Game code copied to clipboard!', 'green'))
          .catch(() => showMessage('Failed to copy game code', 'red'));
      };
    });

    socket.on('game-start', (game) => {
      console.log('Game starting:', game);
      isMultiplayerGame = true;
      gameCode = game.code;
      selectedDifficulty = game.settings.difficulty;
      selectedContinent = game.settings.continent;
      
      // Set player number based on socket ID
      myPlayerNumber = game.players.indexOf(socket.id) + 1;
      currentTurn = 1; // First player always starts
      
      document.getElementById('start-screen').style.display = 'none';
      document.getElementById('game-screen').style.display = 'block';
      
      // Update difficulty dropdown to match game settings
      document.getElementById('difficulty').value = selectedDifficulty;
      
      // Use the server-generated game board
      currentGame = game.gameBoard;
      
      // Create the grid using the server's game board
      const grid = document.getElementById("grid");
      grid.innerHTML = "";
      
      currentGame.forEach((country, i) => {
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.style.backgroundImage = `url('flags/${country.code}.svg')`;
        cell.dataset.code = country.code;
        cell.dataset.name = country.name.toLowerCase();
        cell.dataset.index = i;
        cell.onclick = () => selectCell(cell);
        grid.appendChild(cell);
      });
      
      // Initialize autocomplete with game settings
      updateAutocompleteSuggestions();
      
      showMessage(`You are Player ${myPlayerNumber}`, myPlayerNumber === 1 ? '#4a90e2' : '#e24a4a');

      // Update turn message and input state
      updateTurnMessage();
    });

    socket.on('move-made', (move) => {
      const cells = document.querySelectorAll('.cell');
      const cell = cells[move.cell];
      
      if (move.correct) {
        // If it's our move
        if (move.player === myPlayerNumber - 1) {
          cell.classList.add(`player${myPlayerNumber}`);
          gameBoard[move.cell] = myPlayerNumber;
        } 
        // If it's opponent's move
        else {
          const opponentPlayer = myPlayerNumber === 1 ? 2 : 1;
          cell.classList.add(`player${opponentPlayer}`);
          gameBoard[move.cell] = opponentPlayer;
        }
      }
      
      // Always update both currentPlayer and currentTurn
      currentPlayer = currentTurn === 1 ? 2 : 1;
      currentTurn = currentTurn === 1 ? 2 : 1;
      updateTurnMessage();

      if (move.correct) {
        // Check for win after move is made
        const winningPlayer = move.player + 1;
        if (checkWin(winningPlayer)) {
          const winMessage = winningPlayer === myPlayerNumber ? 
            "You win!" : "Opponent wins!";
          showMessage(winMessage, "gold");
          disableGame();
        }
        // Check for draw
        else if (gameBoard.every(cell => cell !== null)) {
          showMessage("It's a draw!", "blue");
          disableGame();
        }
      }
    });

    socket.on('player-disconnected', () => {
      showMessage('Other player disconnected', 'red');
      disableGame();
    });

    socket.on('error', (message) => {
      showMessage(message, 'red');
    });

    // Add new handler for game-join-error
    socket.on('game-join-error', (message) => {
      showMessage(message, 'red');
    });

    // Add new handler for game-join-success
    socket.on('game-join-success', () => {
      showMessage('Successfully joined game!', 'green');
    });

    // Add this to the socket event handlers in initializeSocket()
    socket.on('new-game', (game) => {
      console.log('Starting new game:', game);
      
      // Reset game state
      gameBoard = Array(9).fill(null);
      currentGame = game.gameBoard;
      currentTurn = 1;  // First player always starts
      
      // Clear the grid and create new cells
      const grid = document.getElementById("grid");
      grid.innerHTML = "";
      
      currentGame.forEach((country, i) => {
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.style.backgroundImage = `url('flags/${country.code}.svg')`;
        cell.dataset.code = country.code;
        cell.dataset.name = country.name.toLowerCase();
        cell.dataset.index = i;
        cell.onclick = () => selectCell(cell);
        grid.appendChild(cell);
      });

      // Re-enable game if it was disabled
      const cells = document.querySelectorAll('.cell');
      cells.forEach(cell => {
        cell.onclick = () => selectCell(cell);
        cell.style.opacity = '1';
      });
      
      // Update messages and state
      document.getElementById("message").textContent = "";
      document.getElementById("guess").value = "";
      document.getElementById("guess").disabled = false;
      updateAutocompleteSuggestions();
      updateTurnMessage();
    });

    // Update the daily-challenge socket event handler in initializeSocket()
    socket.on('daily-challenge', (data) => {
        console.log('Received daily challenge:', data);
        
        if (!data.gameBoard || data.gameBoard.length === 0) {
            console.error('Received empty game board');
            showMessage('Error loading daily challenge', 'red');
            return;
        }
        
        // Clear the grid
        const grid = document.getElementById("grid");
        grid.innerHTML = "";
        
        // Reset game state
        currentGame = data.gameBoard;
        gameBoard = Array(9).fill(null);
        correctAnswers = 0;
        
        console.log('Creating cells for', data.gameBoard.length, 'countries');
        
        // Create cells for each country
        data.gameBoard.forEach((country, i) => {
            console.log(`Creating cell ${i} for country:`, country.name);
            const cell = document.createElement("div");
            cell.className = "cell";
            cell.style.backgroundImage = `url('flags/${country.code}.svg')`;
            cell.dataset.code = country.code;
            cell.dataset.name = country.name.toLowerCase();
            cell.dataset.index = i;
            cell.onclick = () => selectCell(cell);
            grid.appendChild(cell);
        });
        
        // Show remaining guesses
        const guessesDisplay = document.getElementById('remaining-guesses');
        guessesDisplay.textContent = `Remaining Guesses: ${remainingDailyGuesses}`;
        guessesDisplay.classList.add('active');
        
        // Enable input
        document.getElementById("guess").disabled = false;
        
        // Update autocomplete with all countries (since it's a challenge)
        updateAutocompleteSuggestions();
        
        showMessage('Daily Challenge started! You have 11 guesses.', 'green');
    });
  } catch (error) {
    console.error('Socket initialization error:', error);
    showMessage('Failed to initialize multiplayer', 'red');
  }
}

function createMultiplayerGame() {
  isDailyChallenge = false;  // Reset daily challenge flag
  if (!socket?.connected) {
    console.log('Socket not connected, attempting to connect...');
    socket = io('http://localhost:3000', {
      transports: ['websocket'],
      upgrade: false
    });
    
    socket.on('connect', () => {
      console.log('Connected, now creating game...');
      sendCreateGameRequest();
    });
    
    socket.on('connect_error', (error) => {
      console.error('Connection failed:', error);
      showMessage('Failed to connect to server', 'red');
    });
  } else {
    sendCreateGameRequest();
  }
}

function sendCreateGameRequest() {
  const settings = {
    difficulty: document.getElementById('start-difficulty').value,
    continent: document.getElementById('continent').value
  };
  
  console.log('Sending game settings:', settings);
  
  try {
    socket.emit('create-game', settings);
    showMessage('Creating game...', 'blue');
  } catch (error) {
    console.error('Error creating game:', error);
    showMessage('Failed to create game', 'red');
  }
}

function joinMultiplayerGame() {
  const code = document.getElementById('game-code').value.trim().toUpperCase();
  if (!code) {
    showMessage('Please enter a game code', 'red');
    return;
  }
  
  // Prevent joining if we're already in a game
  if (isMultiplayerGame) {
    showMessage('Already in a game!', 'red');
    return;
  }

  socket.emit('join-game', code);
}

function handleOpponentMove(move) {
  // Implementation depends on your game logic
}

// Make functions accessible globally
window.createMultiplayerGame = createMultiplayerGame;
window.joinMultiplayerGame = joinMultiplayerGame;
window.startSinglePlayerGame = startSinglePlayerGame;
window.startNewGame = startNewGame;
window.checkGuess = checkGuess;
window.showStartScreen = showStartScreen;

// Add this function to initialize daily stats
function initializeDailyStats() {
    const stored = localStorage.getItem('dailyStats');
    if (stored) {
        dailyStats = JSON.parse(stored);
        
        // Reset if it's a new day
        const today = new Date().toDateString();
        if (dailyStats.lastPlayed !== today) {
            dailyStats = {
                lastPlayed: null,
                completed: false
            };
        }
    }
}

// Modify the startDailyChallenge function
function startDailyChallenge() {
    // For testing: remove the daily limit check
    /*
    const today = new Date().toDateString();
    if (dailyStats.lastPlayed === today) {
        showMessage("You've already played today's challenge! Come back tomorrow.", "red");
        return;
    }
    */
    
    console.log('Starting daily challenge...');
    
    // Reset game state
    isDailyChallenge = true;
    remainingDailyGuesses = 11;
    correctAnswers = 0;
    gameBoard = Array(9).fill(null);
    
    // Update localStorage (commented out for testing)
    /*
    dailyStats.lastPlayed = today;
    localStorage.setItem('dailyStats', JSON.stringify(dailyStats));
    */
    
    // Hide start screen and show game screen
    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('game-screen').style.display = 'block';
    
    // Hide difficulty selector and new game button in daily challenge mode
    document.getElementById('difficulty').style.display = 'none';
    
    // Show remaining guesses counter
    const guessesDisplay = document.getElementById('remaining-guesses');
    guessesDisplay.textContent = `Remaining Guesses: ${remainingDailyGuesses}`;
    guessesDisplay.classList.add('active');
    
    // Request daily challenge from server
    if (!socket?.connected) {
        console.log('Socket not connected, attempting to connect...');
        socket = io('http://localhost:3000', {
            transports: ['websocket'],
            upgrade: false
        });
        
        socket.on('connect', () => {
            console.log('Connected, requesting daily challenge...');
            socket.emit('request-daily-challenge');
        });
    } else {
        console.log('Socket connected, requesting daily challenge...');
        socket.emit('request-daily-challenge');
    }
}

// Add this to make the daily challenge button work globally
window.startDailyChallenge = startDailyChallenge;
