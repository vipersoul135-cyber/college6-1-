
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config({ path: path.join(__dirname, '.env') });

const connectDB = require('./config/db');

// Existing route imports
const authRoutes = require('./routes/authRoutes');
const studentRoutes = require('./routes/studentRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const reportRoutes = require('./routes/reportRoutes');
const studentRequestRoutes = require('./routes/studentRequestRoutes');

const app = express();

// Security middleware.
// The React build loads jsPDF, autoTable and xlsx from cdnjs, so that host
// must be allowed by the Content Security Policy.
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            'default-src': ["'self'"],
            'script-src': ["'self'", 'https://cdnjs.cloudflare.com'],
            'style-src': ["'self'", "'unsafe-inline'"],
            'img-src': ["'self'", 'data:', 'blob:'],
            'font-src': ["'self'", 'data:'],
            'connect-src': ["'self'"],
            'object-src': ["'none'"],
            'base-uri': ["'self'"],
            'form-action': ["'self'"]
        }
    }
}));

// CORS configuration
const allowedOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5000')
    .split(',')
    .map(origin => origin.trim());

app.use(
    cors({
        origin: (origin, callback) => {
            // Allow requests with no Origin header (curl, Postman, health checks)
            // or when opening HTML files directly from disk (file://) in development.
            if (!origin) {
                return callback(null, true);
            }

            if (allowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            // In development, log the blocked origin to help diagnose mismatches.
            if (process.env.NODE_ENV !== 'production') {
                console.warn(`CORS blocked origin: "${origin}". Add it to FRONTEND_ORIGIN in .env`);
            }

            return callback(new Error('Origin not allowed by CORS'));
        },
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true
    })
);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check
app.get('/api/health', (req, res) => {
    const mongoose = require('mongoose');

    const connected = mongoose.connection.readyState === 1;

    res.status(connected ? 200 : 503).json({
        status: connected ? 'OK' : 'DATABASE_DISCONNECTED',
        service: 'College Attendance Management API',
        database: connected ? 'Connected' : 'Disconnected',
        timestamp: new Date().toISOString()
    });
});

// Existing API routes
app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/student-requests', studentRequestRoutes);
app.use('/api/student-registration-requests', studentRequestRoutes);

// Serve the built React frontend so the whole app runs on one URL
const frontendDist = path.join(__dirname, '..', 'frontend-react', 'dist');
const frontendIndex = path.join(frontendDist, 'index.html');

if (fs.existsSync(frontendIndex)) {
    app.use(express.static(frontendDist));

    // React Router fallback: send index.html for any non-API GET request
    app.get('*', (req, res, next) => {
        if (req.path === '/api' || req.path.startsWith('/api/')) {
            return next();
        }
        res.sendFile(frontendIndex);
    });
} else {
    console.warn('React build not found. Run "npm run build" inside frontend-react before starting the backend.');
}

// 404 handler
app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        message: `Endpoint ${req.originalUrl} not found`
    });
});

// Central error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err.message);

    const statusCode = err.statusCode || 500;

    res.status(statusCode).json({
        success: false,
        message: err.message || 'Internal Server Error',
        stack: process.env.NODE_ENV === 'production'
            ? undefined
            : err.stack
    });
});

// Connect database first, then start server
const PORT = process.env.PORT || 5000;

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err.message);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

async function startServer() {
    try {
        await connectDB();
        console.log('');

        app.listen(PORT, () => {
            console.log(`Attendance Backend running on port ${PORT}`);
            console.log(`App: http://localhost:${PORT}`);
            console.log(`API Base: http://localhost:${PORT}/api`);
            console.log(`Health Check: http://localhost:${PORT}/api/health`);
            console.log(`Allowed CORS Origins: ${allowedOrigins.join(', ')}`);
            console.log('');
            console.log(`Environment: ${process.env.NODE_ENV}`);
        });
    } catch (error) {
        console.error('');
        console.error('===========================================');
        console.error('Server startup aborted: MongoDB is not available');
        console.error('===========================================');
        console.error(`Reason: ${error.message}`);
        console.error('');
        console.error('Fix the issue described above, then start the backend again.');
        console.error('Connection settings are read only from backend/.env.');
        console.error('');
        process.exit(1);
    }
}

startServer();

module.exports = app;
