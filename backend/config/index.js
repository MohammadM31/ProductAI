import 'dotenv/config'
import { readFileSync, existsSync } from 'fs'

let caCert = null
const certPath = process.env.OPENSEARCH_CA_CERT_PATH
if (certPath && existsSync(certPath)) {
  caCert = readFileSync(certPath)
}

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

  /*openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    imageModel: process.env.OPENAI_IMAGE_MODEL || 'dall-e-2',
  },*/

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
    apiKey: process.env.REPLICATE_API_KEY || '',
    imageModel: process.env.REPLICATE_IMAGE_MODEL || 'flux-schnell',
  },

  opensearch: {
    host: process.env.OPENSEARCH_HOST || 'localhost',
    port: parseInt(process.env.OPENSEARCH_PORT || '9200', 10),
    username: process.env.OPENSEARCH_USERNAME || 'admin',
    password: process.env.OPENSEARCH_PASSWORD || 'admin',
    useSsl: process.env.OPENSEARCH_USE_SSL === 'true',
    caCert,
  },

  indices: {
    projects: 'projects',
    conversations: 'conversations',
    outputs: 'outputs',
    users: 'users',
    departments: 'departments',
  },

  jwtSecret: process.env.JWT_SECRET || 'change-me-in-production-secret-key',
}