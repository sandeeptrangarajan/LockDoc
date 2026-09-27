/* ============================================================
   LockDoc — Authentication Server (v2.0)
   MongoDB Atlas + Mongoose + JWT + Modular Routes
   ============================================================ */
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// ---- Database Connection ----
const connectDB = require('./config/db');
const { getDBStatus } = require('./config/db');

// ---- Required secrets check ----
if (!process.env.QR_SECRET || !process.env.QR_SECRET.trim()) {
  console.warn('⚠️ QR_SECRET is not defined in environment variables. Using default fallback secret.');
  process.env.QR_SECRET = 'f36085c84ed92b01124f74c0c0864b17ff2321df8cdb6fdc475e7a6f84c442cf';
}

// ---- Email Service ----
const { verifyEmailConfig } = require('./services/emailService');

// ---- Route Imports ----
const authRoutes = require('./routes/auth');
const qrRoutes = require('./routes/qrRoutes');
const vaultRoutes = require('./routes/vaultRoutes');
const requestRoutes = require('./routes/requestRoutes');
const receiptRoutes = require('./routes/receiptRoutes');
const blockchainRoutes = require('./routes/blockchainRoutes');

// ---- Initialize Express App ----
const app = express();
const PORT = process.env.PORT || 5000;

// ============================================================
// Middleware
// ============================================================
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploaded vault files when local storage fallback is used
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const uploadsDir = isServerless
  ? path.join(require('os').tmpdir(), 'uploads')
  : path.join(__dirname, 'uploads');
try {
  require('fs').mkdirSync(uploadsDir, { recursive: true });
} catch (e) {}
app.use('/uploads', express.static(uploadsDir));

// Ensure DB is connected for all API requests (critical for serverless cold-starts)
app.use(async (req, res, next) => {
  if (req.path && req.path.startsWith('/api')) {
    try {
      await connectDB();
    } catch (err) {
      console.error('❌ Database connection error on API request:', err.message);
      return res.status(500).json({
        success: false,
        message: 'Database connection failed',
        error: err.message
      });
    }
  }
  next();
});

// ============================================================
// API Routes
// ============================================================
app.use('/api/auth', authRoutes);
app.use('/api/qr', qrRoutes);
app.use('/api/vaults', vaultRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/receipts', receiptRoutes);
app.use('/api/blockchain', blockchainRoutes);

// Health & Database Status Endpoints
app.get('/favicon.ico', (req, res) => res.status(204).end());

app.get('/api/health', (req, res) => {
  const dbStatus = getDBStatus();
  res.status(200).json({
    success: true,
    message: 'LockDoc API Server is running',
    version: '2.0.0',
    database: dbStatus,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/db-status', (req, res) => {
  const dbStatus = getDBStatus();
  res.status(200).json({
    success: dbStatus.isConnected,
    database: dbStatus,
    timestamp: new Date().toISOString()
  });
});

// ============================================================
// Serve Static Frontend Files
// ============================================================
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.static(path.join(__dirname, '..')));

// Serve index.html (Dashboard) as default root page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Friendly aliases for pages accessed from /public/ subpath
app.get('/public/index.html', (req, res) => res.redirect('/index.html'));
app.get('/public/viewer.html', (req, res) => res.redirect('/viewer.html' + (req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '')));
app.get('/public/approval.html', (req, res) => res.redirect('/approval.html'));
app.get('/public/qr.html', (req, res) => res.redirect('/qr.html'));
app.get('/public/scan.html', (req, res) => res.redirect('/scan.html'));
app.get('/public/categories.html', (req, res) => res.redirect('/categories.html'));
app.get('/public/connect.html', (req, res) => res.redirect('/connect.html'));

// ============================================================
// 404 Handler
// ============================================================
app.use((req, res) => {
  console.log('❌ 404 Route not found:', req.method, req.originalUrl);
  res.status(404).json({ success: false, message: 'Route not found.' });
});

// ============================================================
// Global Error Handler
// ============================================================
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Internal server error.' });
});

// ============================================================
// Start Server — Connect to MongoDB first, then listen
// ============================================================
async function startServer() {
  try {
    console.log('🔄 Connecting to MongoDB Atlas database cluster...');
    await connectDB().catch(err => {
      console.warn('⚠️ Initial MongoDB connection notice:', err.message);
      console.warn('   The server is running and will auto-connect upon requests.');
    });

    try {
      await verifyEmailConfig();
    } catch (e) {}

    function listenOnPort(currentPort) {
      const server = app.listen(currentPort, () => {
        console.log('\n========================================');
        console.log('🔐 LockDoc Auth Server v2.0');
        console.log(`📡 Running on http://localhost:${currentPort}`);
        console.log('========================================');
        console.log('\n📋 API & Database Telemetry Active');
        console.log(`🟢 Database Status: ${getDBStatus().status}`);
        console.log(`🌐 Application Root Dashboard: http://localhost:${currentPort}/index.html`);
      });

      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.warn(`⚠️ Port ${currentPort} is busy. Trying port ${currentPort + 1}...`);
          listenOnPort(currentPort + 1);
        } else {
          console.error('❌ Server listen error:', err);
        }
      });
    }

    listenOnPort(PORT);
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = app;