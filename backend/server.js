import 'express-async-errors'
import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { config } from './config/index.js'
import { initializeIndices } from './services/databaseService.js'
import { seedDemoData } from './services/authService.js'
import authRoutes from './routes/auth.js'
import requestRoutes from './routes/request.js'
import adminRoutes from './routes/admin.js'
import referenceImagesRoutes from './routes/referenceImages.js' // ADD THIS
import { errorHandler, notFound } from './middleware/errorHandler.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()

// Render (and most PaaS hosts) terminate TLS at a proxy and forward plain
// HTTP internally. Without this, req.protocol always reports "http" even
// on a live https:// deployment, which breaks any URL we build from it
// (e.g. the reference-image upload endpoint).
app.set('trust proxy', 1)

// ============================================================
// ✅ COMPLETE CORS FIX - Allow ALL origins for testing
// ============================================================
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  optionsSuccessStatus: 200
}))

app.use(express.json({ limit: '100mb' }))
app.use(express.urlencoded({ extended: true, limit: '100mb' }))

// Serve uploaded images statically
const uploadDir = path.join(__dirname, 'uploads')
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}
app.use('/uploads', express.static(uploadDir))

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'creative-request-platform', 
    version: '2.0.0', 
    timestamp: new Date().toISOString() 
  })
})

// Root route
app.get('/', (req, res) => {
  res.json({
    message: '🎨 ProductAI API is running!',
    version: '2.0.0',
    status: 'online',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      login: '/api/auth/login (POST)',
      me: '/api/auth/me (GET - requires auth)',
      textRequest: '/api/request/text (POST)',
      voiceRequest: '/api/request/voice (POST)',
      projects: '/api/admin/projects (GET)',
      departments: '/api/admin/departments (GET)',
      inbox: '/api/admin/outputs (GET)',
      referenceImages: '/api/reference-images/upload (POST - requires auth)'
    },
    docs: 'https://github.com/MohammadM31/ProductAI'
  })
})

// API Routes
app.use('/api/auth', authRoutes)
app.use('/api/request', requestRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/reference-images', referenceImagesRoutes) // ADD THIS

// Error handling (must be last)
app.use(notFound)
app.use(errorHandler)

async function start() {
  console.log('🚀 Starting Creative Request Platform Backend…')
  
  // Create uploads directories
  const uploadDirs = [
    path.join(__dirname, 'uploads', 'images'),
    path.join(__dirname, 'uploads', 'reference_images'), // ADD THIS
    path.join(__dirname, 'uploads', 'psd')
  ]
  
  for (const dir of uploadDirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
      console.log('📁 Created uploads directory:', dir)
    }
  }
  
  try {
    await Promise.race([
      initializeIndices(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('OpenSearch connection timeout')), 5000)
      )
    ]);
    await seedDemoData();
  } catch (err) {
    console.error('⚠️  OpenSearch unavailable:', err.message);
    console.log('ℹ️  Continuing startup without OpenSearch...');
  }

  const PORT = process.env.PORT || config.port || 10000
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT} [${config.nodeEnv}]`)
    console.log(`   Health: /health`)
    console.log(`   Root: /`)
    console.log(`   Reference Images: /api/reference-images`)
  })
}

start()