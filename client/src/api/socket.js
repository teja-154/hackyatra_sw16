import { io } from 'socket.io-client';

// Connect via relative path — Vite proxy handles it in dev
const socket = io('/', {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
});

socket.on('connect', () => {
  console.log('🔌 Socket connected:', socket.id);
});

socket.on('connect_error', (err) => {
  console.warn('Socket connection error:', err.message);
});

export default socket;
