const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');

const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === 'production';

const server = http.createServer(app);

const allowedOrigins = isProduction 
  ? [
      'https://vybeztribe.com',
      'https://www.vybeztribe.com',
      process.env.CORS_ORIGIN,
      process.env.FRONTEND_URL
    ].filter(Boolean)
  : [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:5001',
      'http://127.0.0.1:3000'
    ];

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

io.on('connection', (socket) => {
  console.log(`📌 Client connected: ${socket.id}`);
  
  socket.on('disconnect', () => {
    console.log(`📌 Client disconnected: ${socket.id}`);
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
