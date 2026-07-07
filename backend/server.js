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

const allowedOrigins = [
  config.frontendUrl,
  'http://localhost:3000',
  'http://localhost:5173',
  'https://frontend-1dmi.onrender.com',
  'https://*.onrender.com',
]

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.some(o => origin.startsWith(o))) {
      callback(null, true)
    } else {
      callback(new Error(`CORS: origin ${origin} not allowed`))
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}))

app.use(express.json({ limit: '100mb' }))
app.use(express.urlencoded({ extended: true, limit: '100mb' }))

// Serve uploaded images statically
const uploadDir = path.join(__dirname, 'uploads')
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}
app.use('/uploads', express.static(uploadDir))

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'creative-request-platform', version: '2.0.0', timestamp: new Date().toISOString() })
})

app.use('/api/auth', authRoutes)
app.use('/api/request', requestRoutes)
app.use('/api/admin', adminRoutes)

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

  app.listen(config.port, () => {
    console.log(`✅ Server running on port ${config.port} [${config.nodeEnv}]`)
    console.log(`   Health: http://localhost:${config.port}/health`)
    console.log(`   Uploads: http://localhost:${config.port}/uploads`)
  })
}

start()