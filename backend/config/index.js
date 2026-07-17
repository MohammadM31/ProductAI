// config/index.js
import 'dotenv/config'
import { readFileSync, existsSync } from 'fs'

let caCert = null

const certPath = process.env.OPENSEARCH_CA_CERT_PATH
if (certPath && existsSync(certPath)) {
  try {
    caCert = readFileSync(certPath)
    console.log('✅ Loaded OpenSearch CA certificate from:', certPath)
  } catch (err) {
    console.warn('⚠️ Failed to load CA certificate:', err.message)
  }
}

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
  publicBaseUrl: process.env.PUBLIC_BASE_URL || 'http://localhost:5000',

  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    visionModel: process.env.OPENAI_VISION_MODEL || 'gpt-4o',
    imageModel: process.env.OPENAI_IMAGE_MODEL || 'dall-e-3',
    audioModel: process.env.OPENAI_AUDIO_MODEL || 'whisper-1',
  },

  // ============================================================
  // NANO BANANA 2 CONFIG
  // ============================================================
  nanobanana: {
    apiKey: process.env.NANOBANANA_API_KEY || '',
    model: process.env.NANOBANANA_MODEL || 'nano-banana-2',
    baseUrl: process.env.NANOBANANA_BASE_URL || 'https://api.nanobanana.ai/v1',
    maxTokens: parseInt(process.env.NANOBANANA_MAX_TOKENS || '4096', 10),
  },

  // Replicate as fallback
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

console.log('🔌 OpenSearch Configuration:', {
  host: config.opensearch.host,
  port: config.opensearch.port,
  username: config.opensearch.username,
  useSsl: config.opensearch.useSsl,
  hasCaCert: !!config.opensearch.caCert,
  rejectUnauthorized: config.opensearch.rejectUnauthorized,
})

console.log('🖼️ Image Generation:', {
  provider: config.nanobanana.apiKey ? 'Nano Banana 2 (primary)' : 'Replicate (fallback)',
  hasNanobananaKey: !!config.nanobanana.apiKey,
  hasReplicateKey: !!config.replicate.apiKey,
})