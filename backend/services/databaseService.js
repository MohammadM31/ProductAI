import { Client } from '@opensearch-project/opensearch'
import { config } from '../config/index.js'

let client = null

export function getClient() {
  if (!client) {
    const { host, port, username, password, useSsl, caCert } = config.opensearch
    const node = `${useSsl ? 'https' : 'http'}://${host}:${port}`
    client = new Client({
      node,
      auth: { username, password },
      ssl: useSsl ? { ca: caCert, rejectUnauthorized: false/*!!caCert*/ } : undefined,
      requestTimeout: 60000,
    })
  }
  return client
}

const USER_MAPPING = {
  mappings: {
    properties: {
      id: { type: 'keyword' },
      email: { type: 'keyword' },
      password_hash: { type: 'keyword' },
      name: { type: 'text', fields: { keyword: { type: 'keyword' } } },
      role: { type: 'keyword' },
      department_id: { type: 'keyword' },
      created_at: { type: 'date' },
    },
  },
  settings: { number_of_shards: 1, number_of_replicas: 0 },
}

const DEPARTMENT_MAPPING = {
  mappings: {
    properties: {
      id: { type: 'keyword' },
      name: { type: 'text', fields: { keyword: { type: 'keyword' } } },
      description: { type: 'text' },
      created_at: { type: 'date' },
    },
  },
  settings: { number_of_shards: 1, number_of_replicas: 0 },
}

const PROJECT_MAPPING = {
  mappings: {
    properties: {
      id: { type: 'keyword' },
      name: { type: 'text', fields: { keyword: { type: 'keyword' } } },
      description: { type: 'text' },
      department_id: { type: 'keyword' },
      output_type: { type: 'keyword' },
      trigger_keywords: { type: 'text' },
      system_prompt: { type: 'text' },
      reference_criteria: { type: 'text' },
      reference_images: {
        type: 'nested',
        properties: {
          id: { type: 'keyword' },
          name: { type: 'keyword' },
          url: { type: 'keyword' },
          description: { type: 'text' },
          style_analysis: { type: 'text' },
        }
      },
      attached_files: {
        type: 'nested',
        properties: {
          id: { type: 'keyword' },
          name: { type: 'keyword' },
          type: { type: 'keyword' },
          content: { type: 'text' },
        }
      },
      image_model: { type: 'keyword' },
      created_by: { type: 'keyword' },
      created_at: { type: 'date' },
      updated_at: { type: 'date' },
    },
  },
  settings: { number_of_shards: 1, number_of_replicas: 0 },
}

const CONVERSATION_MAPPING = {
  mappings: {
    properties: {
      id: { type: 'keyword' },
      session_id: { type: 'keyword' },
      project_id: { type: 'keyword' },
      role: { type: 'keyword' },
      content: { type: 'text' },
      timestamp: { type: 'date' },
    },
  },
  settings: { number_of_shards: 1, number_of_replicas: 0 },
}

// MODIFIED: Updated OUTPUT_MAPPING with requester fields
const OUTPUT_MAPPING = {
  mappings: {
    properties: {
      id: { type: 'keyword' },
      session_id: { type: 'keyword' },
      project_id: { type: 'keyword' },
      department_id: { type: 'keyword' },
      output_type: { type: 'keyword' },
      content: { type: 'text' },
      original_request: { type: 'text' },
      status: { type: 'keyword' },
      created_at: { type: 'date' },
      // NEW: Requester info fields
      requester_id: { type: 'keyword' },
      requester_name: { type: 'text', fields: { keyword: { type: 'keyword' } } },
      requester_email: { type: 'keyword' },
      confirmed_at: { type: 'date' },
      confirmed_by: { type: 'keyword' },
      confirmed_by_name: { type: 'text', fields: { keyword: { type: 'keyword' } } },
      confirmed_by_email: { type: 'keyword' },
    },
  },
  settings: { number_of_shards: 1, number_of_replicas: 0 },
}

export async function initializeIndices() {
  const os = getClient()
  const indices = [
    { name: config.indices.users, mapping: USER_MAPPING },
    { name: config.indices.departments, mapping: DEPARTMENT_MAPPING },
    { name: config.indices.projects, mapping: PROJECT_MAPPING },
    { name: config.indices.conversations, mapping: CONVERSATION_MAPPING },
    { name: config.indices.outputs, mapping: OUTPUT_MAPPING },
  ]

  for (const { name, mapping } of indices) {
    try {
      const exists = await os.indices.exists({ index: name })
      if (!exists.body) {
        await os.indices.create({ index: name, body: mapping })
        console.log(`✅ Created index: ${name}`)
      } else {
        console.log(`ℹ️  Index exists: ${name}`)
      }
    } catch (err) {
      console.error(`❌ Failed to init index ${name}:`, err.message)
    }
  }
}

export async function indexDocument(index, id, body) {
  const os = getClient()
  const response = await os.index({ index, id, body, refresh: 'wait_for' })
  return response.body
}

export async function getDocument(index, id) {
  const os = getClient()
  try {
    const response = await os.get({ index, id })
    return response.body._source
  } catch (err) {
    if (err.meta?.statusCode === 404) return null
    throw err
  }
}

export async function updateDocument(index, id, body) {
  const os = getClient()
  const response = await os.update({ index, id, body: { doc: body }, refresh: 'wait_for' })
  return response.body
}

export async function deleteDocument(index, id) {
  const os = getClient()
  const response = await os.delete({ index, id, refresh: 'wait_for' })
  return response.body
}

export async function searchDocuments(index, query, size = 50) {
  const os = getClient()
  const response = await os.search({ index, body: query, size })
  return response.body.hits.hits.map(h => ({ id: h._id, ...h._source }))
}