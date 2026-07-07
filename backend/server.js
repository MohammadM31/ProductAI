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
import { errorHandler, notFound } from './middleware/errorHandler.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()

// ✅ COMPLETE CORS FIX - Allow all Render subdomains
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://frontend-1dmi.onrender.com',
  'https://productai-frontend.onrender.com',
  /\.onrender\.com$/, // Allow all Render subdomains
]

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true)
    
    // Check if origin is allowed
    const isAllowed = allowedOrigins.some(allowed => {
      if (typeof allowed === 'string') return origin === allowed
      if (allowed instanceof RegExp) return allowed.test(origin)
      return false
    })
    
    if (isAllowed) {
      callback(null, true)
    } else {
      console.log('🚫 CORS blocked:', origin)
      callback(new Error(`CORS: origin ${origin} not allowed`))
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  optionsSuccessStatus: 200 // For legacy browsers
}))

// Handle preflight requests explicitly
app.options('*', cors())

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

// Root route - Fixes "GET /" error
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
      inbox: '/api/admin/outputs (GET)'
    },
    docs: 'https://github.com/MohammadM31/ProductAI'
  })
})

// API Routes
app.use('/api/auth', authRoutes)
app.use('/api/request', requestRoutes)
app.use('/api/admin', adminRoutes)

// Error handling (must be last)
app.use(notFound)
app.use(errorHandler)

async function start() {
  console.log('🚀 Starting Creative Request Platform Backend…')
  
  // Create uploads directory
  const uploadDir = path.join(__dirname, 'uploads', 'images')
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true })
    console.log('📁 Created uploads directory:', uploadDir)
  }
  
  try {
    await initializeIndices()
    await seedDemoData()
  } catch (err) {
    console.error('⚠️  Startup warning (continuing anyway):', err.message)
  }

  const PORT = process.env.PORT || config.port || 10000
  app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT} [${config.nodeEnv}]`)
    console.log(`   Health: https://your-app.onrender.com/health`)
    console.log(`   Root: https://your-app.onrender.com/`)
  })
}

start()