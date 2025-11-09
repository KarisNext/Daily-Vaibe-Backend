// ============================================
// FILE: backend/server.js (Entry Point)
// ============================================
const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');

const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === 'production';

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: isProduction 
      ? ['https://vybeztribe.com', 'https://www.vybeztribe.com', process.env.FRONTEND_URL].filter(Boolean)
      : ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:3001'],
    credentials: true,
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling']
});

io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);
  
  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
  
  socket.on('join-room', (room) => {
    socket.join(room);
    console.log(`👤 Socket ${socket.id} joined room: ${room}`);
  });
});

app.set('io', io);

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n========================================');
  console.log('🎉 VybesTribe Backend Server Running');
  console.log('========================================');
  console.log(`Environment: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
  console.log(`Port: ${PORT}`);
  console.log(`HTTP: http://localhost:${PORT}`);
  console.log(`WebSocket: Enabled`);
  console.log('========================================\n');
});

module.exports = { server, io };