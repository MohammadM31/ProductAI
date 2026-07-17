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
  // NANO BANANA CONFIG
  // Nano Banana (Google's Gemini 2.5 Flash Image model) is served
  // through Replicate as "google/nano-banana" — there is no separate
  // api.nanobanana.ai service. It uses the same Replicate credentials.
  // ============================================================
  nanobanana: {
    model: process.env.NANOBANANA_MODEL || 'google/nano-banana',
  },

  // Replicate (primary image generation provider, incl. Nano Banana)
  replicate: {
    // Support both env var names — the deployed .env uses REPLICATE_API_KEY,
    // some docs/examples use REPLICATE_API_TOKEN. Previously only the
    // latter was read, so the key from .env was silently ignored and
    // every Replicate call (including Nano Banana) failed auth.
    apiKey: process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY || '',
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
  provider: config.replicate.apiKey ? 'Nano Banana via Replicate (primary)' : 'NOT CONFIGURED',
  nanobananaModel: config.nanobanana.model,
  hasReplicateKey: !!config.replicate.apiKey,
})