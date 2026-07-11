import 'dotenv/config'
import { readFileSync, existsSync } from 'fs'

let caCert = null

// Try to load CA certificate from file path
const certPath = process.env.OPENSEARCH_CA_CERT_PATH
if (certPath && existsSync(certPath)) {
  try {
    caCert = readFileSync(certPath)
    console.log('✅ Loaded OpenSearch CA certificate from:', certPath)
  } catch (err) {
    console.warn('⚠️ Failed to load CA certificate:', err.message)
  }
}

// Alternative: Load CA certificate from environment variable
if (!caCert && process.env.OPENSEARCH_CA_CERT) {
  try {
    caCert = process.env.OPENSEARCH_CA_CERT
    console.log('✅ Loaded OpenSearch CA certificate from environment variable')
  } catch (err) {
    console.warn('⚠️ Failed to load CA cert from env:', err.message)
  }
}

export const config = {
  port: parseInt(process.env.PORT || '10000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    visionModel: process.env.DEEPSEEK_VISION_MODEL || 'deepseek-vl',
    baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  },

  deepgram: {
    apiKey: process.env.DEEPGRAM_API_KEY || '',
  },

  replicate: {
    apiKey: process.env.REPLICATE_API_TOKEN || '',
    imageModel: process.env.REPLICATE_IMAGE_MODEL || 'flux-schnell',
  },

  opensearch: {
    host: process.env.OPENSEARCH_HOST || 'localhost',
    port: parseInt(process.env.OPENSEARCH_PORT || '9200', 10),
    username: process.env.OPENSEARCH_USERNAME || 'admin',
    password: process.env.OPENSEARCH_PASSWORD || 'admin',
    useSsl: process.env.OPENSEARCH_USE_SSL === 'true',
    caCert,
    rejectUnauthorized: process.env.OPENSEARCH_REJECT_UNAUTHORIZED !== 'false',
  },

  indices: {
    projects: 'projects',
    conversations: 'conversations',
    outputs: 'outputs',
    users: 'users',
    departments: 'departments',
    user_history: 'user_history',
  },

  jwtSecret: process.env.JWT_SECRET || 'change-me-in-production-secret-key',
}

// Log OpenSearch config (without password)
console.log('🔌 OpenSearch Configuration:', {
  host: config.opensearch.host,
  port: config.opensearch.port,
  username: config.opensearch.username,
  useSsl: config.opensearch.useSsl,
  hasCaCert: !!config.opensearch.caCert,
  rejectUnauthorized: config.opensearch.rejectUnauthorized,
})