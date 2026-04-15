const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { saveTransfer, getHistory } = require('./db');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/history', async (req, res) => {
  try {
    const history = await getHistory();
    res.json({ success: true, history });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/history', async (req, res) => {
  try {
    const { filename, filesize, filetype } = req.body;
    if (!filename || !filesize) return res.status(400).json({ success: false, message: 'Missing fields' });
    const id = await saveTransfer(filename, filesize, filetype || 'unknown');
    res.json({ success: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

const frontendDist = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendDist));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow any origin for development
    methods: ["GET", "POST"],
  },
});

const rooms = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('create-room', ({ pin }) => {
    socket.join(pin);
    rooms.set(pin, { senderId: socket.id });
    console.log(`Room created: ${pin} by ${socket.id}`);
  });

  socket.on('join-room', ({ pin }, callback) => {
    const room = rooms.get(pin);
    if (room) {
      socket.join(pin);
      socket.to(room.senderId).emit('receiver-joined', { receiverId: socket.id });
      console.log(`User ${socket.id} joined room ${pin}`);
      if (callback) callback({ success: true });
    } else {
      if (callback) callback({ success: false, message: 'Invalid PIN' });
      socket.emit('error', 'Room not found or invalid PIN');
    }
  });

  socket.on('file-metadata', ({ pin, metadata }) => {
    const room = rooms.get(pin);
    if (room) room.metadata = metadata;
    socket.to(pin).emit('file-metadata', metadata);
  });

  socket.on('file-chunk', ({ pin, chunk }) => {
    socket.to(pin).emit('file-chunk', chunk);
  });

  socket.on('transfer-complete', ({ pin }) => {
    socket.to(pin).emit('transfer-complete');
    try {
      const room = rooms.get(pin);
      if (room && room.metadata) {
        saveTransfer(room.metadata.name, room.metadata.size, room.metadata.type || 'unknown');
      }
    } catch (e) {
      console.error('Failed saving to DB:', e);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    for (const [pin, room] of rooms.entries()) {
      if (room.senderId === socket.id) {
        io.to(pin).emit('sender-disconnected');
        rooms.delete(pin);
      }
    }
  });
});

app.use((req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
