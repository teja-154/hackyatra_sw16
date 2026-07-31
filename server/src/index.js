import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import config from './config/env.js';
import { connectDB } from './config/db.js';
import './config/cloudinary.js';
import { setupSocketManager } from './services/socketManager.js';
import { startSLAChecker, checkSLA } from './services/slaChecker.js';
import { startCCTVSimulator } from './services/cctvSimulator.js';

/* ── Routes ──────────────────────────────────────────── */
import complaintsRouter from './routes/complaints.js';
import incidentsRouter  from './routes/incidents.js';
import statusRouter     from './routes/status.js';
import authRouter       from './routes/auth.js';
import uploadRouter     from './routes/upload.js';
import teamsRouter      from './routes/teams.js';
import sensorsRouter    from './routes/sensors.js';
import statsRouter      from './routes/stats.js';

const app  = express();
const http = createServer(app);
const io   = new Server(http, {
  cors: {
    origin: config.clientUrl,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

/* ── Middleware ───────────────────────────────────────── */
app.use(cors({ origin: config.clientUrl, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

/* ── Make io accessible to routes via req.app ────────── */
app.set('io', io);

/* ── API Routes ──────────────────────────────────────── */
app.use('/api/complaints', complaintsRouter);
app.use('/api/incidents',  incidentsRouter);
app.use('/api/status',     statusRouter);
app.use('/api/auth',       authRouter);
app.use('/api/upload',     uploadRouter);
app.use('/api/teams',      teamsRouter);
app.use('/api/sensors',    sensorsRouter);
app.use('/api/stats',      statsRouter);

/* ── Test-only routes (never mounted in production) ─────── */
if (process.env.NODE_ENV === 'test') {
  app.post('/api/test/sla-check', async (req, res) => {
    await checkSLA();
    res.json({ success: true });
  });
}

/* ── Health check ────────────────────────────────────── */
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/* ── Socket.io ───────────────────────────────────────── */
setupSocketManager(io);

/* ── Start ───────────────────────────────────────────── */
async function start() {
  await connectDB();
  
  // Start background services
  startSLAChecker();
  // We'll leave startCCTVSimulator() commented out by default, to be enabled during the demo or seeding
  // startCCTVSimulator();

  http.listen(config.port, () => {
    console.log(`🚀 COC-Sync server running on http://localhost:${config.port}`);
  });
}

start();
