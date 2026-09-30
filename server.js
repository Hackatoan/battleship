const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const db = require('./db');
const { verifyFirebaseToken } = require('./verifyFirebaseToken');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Leaderboard (nickname-based).
app.get('/api/leaderboard', async (_req, res) => {
  const players = await db.getLeaderboard(20);
  res.json({ game: db.GAME, players });
});

// Merge a previously-played anonymous nickname's stats into the signed-in
// account making this request. Rate-limited implicitly by requiring a fresh
// verified ID token per call (an attacker can't cheaply mint those).
app.post('/api/claim', async (req, res) => {
  const decoded = await verifyFirebaseToken(req.body && req.body.idToken);
  if (!decoded) return res.status(401).json({ error: 'sign in required' });
  const nickname = db.cleanName(req.body && req.body.nickname);
  if (!nickname) return res.status(400).json({ error: 'nickname required' });
  const result = await db.claimNickname(nickname, decoded.uid, decoded.name);
  res.status(result.ok ? 200 : 409).json(result);
});

const rooms = {};

// Hard cap on concurrent rooms. Without this, a single connection can call
// create_room in a loop and grow `rooms` without bound — each entry holds
// two 10x10 board/hit arrays, so this is a real memory-exhaustion DoS, not
// just theoretical. Comfortably above any real simultaneous-match count.
const MAX_ROOMS = 1000;

// Expected fleet: shipId -> number of cells that ship must occupy.
// Must match the SHIPS list in public/game.js.
const SHIP_SIZES = { 1: 5, 2: 4, 3: 3, 4: 3, 5: 2 };

function makeCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Reject anything the client sends as a "board" that isn't a well-formed
// 10x10 grid containing exactly the expected fleet. Without this check a
// client could submit a malformed shape (crashing the server the first time
// it's indexed during an attack) or an empty/invalid board (guaranteeing it
// can never be fully sunk, i.e. guaranteeing the sender can never lose).
function isValidBoard(board) {
  if (!Array.isArray(board) || board.length !== 10) return false;
  const counts = {};
  for (const row of board) {
    if (!Array.isArray(row) || row.length !== 10) return false;
    for (const cell of row) {
      if (cell === 0) continue;
      if (!Number.isInteger(cell) || !SHIP_SIZES[cell]) return false;
      counts[cell] = (counts[cell] || 0) + 1;
    }
  }
  return Object.keys(SHIP_SIZES).every(id => counts[id] === SHIP_SIZES[id]);
}

function checkSunk(board, shipId) {
  for (let r = 0; r < 10; r++)
    for (let c = 0; c < 10; c++)
      if (board[r][c] === shipId) return false;
  return true;
}

function checkWin(board) {
  for (let r = 0; r < 10; r++)
    for (let c = 0; c < 10; c++)
      if (typeof board[r][c] === 'number' && board[r][c] > 0) return false;
  return true;
}

io.on('connection', (socket) => {
  socket.on('create_room', async (payload = {}) => {
    if (Object.keys(rooms).length >= MAX_ROOMS) {
      return socket.emit('join_error', 'Server is full — try again shortly');
    }
    const code = makeCode();
    rooms[code] = { players: [socket.id], names: {}, uids: {}, boards: {}, hits: {}, ready: new Set(), turn: null };
    rooms[code].names[socket.id] = db.cleanName(payload && payload.name);
    socket.join(code);
    socket.emit('room_created', { code });
    // Verified asynchronously — the room is already created above so a
    // slow/failed verification never blocks or breaks creating it, it just
    // means this round won't be linked to an account.
    if (payload && payload.idToken) {
      const decoded = await verifyFirebaseToken(payload.idToken);
      if (decoded && rooms[code]) rooms[code].uids[socket.id] = decoded.uid;
    }
  });

  socket.on('join_room', async ({ code, name, idToken } = {}) => {
    if (typeof code !== 'string' || !code) return socket.emit('join_error', 'Room not found');
    const upperCode = code.toUpperCase();
    const room = rooms[upperCode];
    if (!room) return socket.emit('join_error', 'Room not found');
    if (room.players.length >= 2) return socket.emit('join_error', 'Room is full');
    room.players.push(socket.id);
    room.names[socket.id] = db.cleanName(name);
    socket.join(upperCode);
    socket.emit('room_joined', { code: upperCode });
    io.to(upperCode).emit('opponent_joined');
    // Verified asynchronously — see comment in create_room above.
    if (idToken) {
      const decoded = await verifyFirebaseToken(idToken);
      if (decoded && rooms[upperCode]) rooms[upperCode].uids[socket.id] = decoded.uid;
    }
  });

  socket.on('ships_placed', ({ code, board } = {}) => {
    const room = rooms[code];
    if (!room) return;
    if (!isValidBoard(board)) return;
    room.boards[socket.id] = board;
    room.hits[socket.id] = Array.from({ length: 10 }, () => Array(10).fill(false));
    room.ready.add(socket.id);
    if (room.ready.size === 2) {
      room.turn = room.players[0];
      io.to(code).emit('game_start', { firstTurn: room.turn });
    } else {
      socket.to(code).emit('opponent_ready');
      socket.emit('waiting_for_opponent');
    }
  });

  socket.on('attack', ({ code, row, col } = {}) => {
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row > 9 || col < 0 || col > 9) return;
    const room = rooms[code];
    if (!room || room.turn !== socket.id) return;
    const oppId = room.players.find(id => id !== socket.id);
    const board = room.boards[oppId];
    if (!board || !room.hits[oppId] || room.hits[oppId][row][col]) return;

    room.hits[oppId][row][col] = true;
    const cellVal = board[row][col];
    const hit = typeof cellVal === 'number' && cellVal > 0;
    let sunkShip = null;

    if (hit) {
      board[row][col] = 0;
      if (checkSunk(board, cellVal)) sunkShip = cellVal;
    }

    const won = hit && checkWin(board);
    const nextTurn = won ? null : (hit ? socket.id : oppId);
    if (!won) room.turn = nextTurn;

    io.to(code).emit('attack_result', {
      attacker: socket.id,
      row, col, hit, sunkShip, won, nextTurn
    });

    if (won) {
      const winnerName = room.names[socket.id];
      db.recordMatch(room.names[socket.id], room.names[oppId], winnerName, room.uids[socket.id], room.uids[oppId]);
      delete rooms[code];
    }
  });

  socket.on('disconnect', () => {
    // A socket can be a player in more than one room (e.g. it called
    // create_room several times without ever being joined). Sweep every
    // room, not just the first match, or the rest leak for the life of
    // the process — see MAX_ROOMS above for why that matters.
    for (const [code, room] of Object.entries(rooms)) {
      if (room.players.includes(socket.id)) {
        io.to(code).emit('opponent_disconnected');
        delete rooms[code];
      }
    }
  });
});

const PORT = process.env.PORT || 3025;
server.listen(PORT, () => console.log(`Battleship running on port ${PORT}`));
