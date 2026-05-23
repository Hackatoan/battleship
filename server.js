const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

function makeCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
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
  socket.on('create_room', () => {
    const code = makeCode();
    rooms[code] = { players: [socket.id], boards: {}, hits: {}, ready: new Set(), turn: null };
    socket.join(code);
    socket.emit('room_created', { code });
  });

  socket.on('join_room', ({ code }) => {
    const room = rooms[code.toUpperCase()];
    if (!room) return socket.emit('join_error', 'Room not found');
    if (room.players.length >= 2) return socket.emit('join_error', 'Room is full');
    room.players.push(socket.id);
    socket.join(code.toUpperCase());
    socket.emit('room_joined', { code: code.toUpperCase() });
    io.to(code.toUpperCase()).emit('opponent_joined');
  });

  socket.on('ships_placed', ({ code, board }) => {
    const room = rooms[code];
    if (!room) return;
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

  socket.on('attack', ({ code, row, col }) => {
    const room = rooms[code];
    if (!room || room.turn !== socket.id) return;
    const oppId = room.players.find(id => id !== socket.id);
    const board = room.boards[oppId];
    if (room.hits[oppId][row][col]) return;

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

    if (won) delete rooms[code];
  });

  socket.on('disconnect', () => {
    for (const [code, room] of Object.entries(rooms)) {
      if (room.players.includes(socket.id)) {
        io.to(code).emit('opponent_disconnected');
        delete rooms[code];
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3025;
server.listen(PORT, () => console.log(`Battleship running on port ${PORT}`));
