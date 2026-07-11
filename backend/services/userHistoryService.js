import { searchDocuments, indexDocument, getDocument } from './databaseService.js'
import { config } from '../config/index.js'

export async function trackUserRequest(userId, projectId, requestText) {
  try {
    const historyEntry = {
      user_id: userId,
      project_id: projectId,
      request_text: requestText,
      timestamp: new Date().toISOString()
    }
    
    await indexDocument(config.indices.user_history, `${userId}_${Date.now()}`, historyEntry)
    console.log(`📝 Tracked user request for ${userId}`)
  } catch (err) {
    console.error('Error tracking user request:', err.message)
  }
}

export async function getPersonalizedSuggestions(userId, limit = 4) {
  try {
    // Get user's request history
    const history = await searchDocuments(config.indices.user_history, {
      query: { term: { user_id: userId } },
      sort: [{ timestamp: { order: 'desc' } }],
      size: 100
    })
    
    if (history.length === 0) return getDefaultSuggestions()
    
    // Count project frequencies
    const projectFrequency = {}
    const requestExamples = {}
    
    for (const entry of history) {
      const projectId = entry.project_id
      if (!projectFrequency[projectId]) {
        projectFrequency[projectId] = 0
        requestExamples[projectId] = []
      }
      projectFrequency[projectId]++
      if (requestExamples[projectId].length < 3) {
        requestExamples[projectId].push(entry.request_text)
      }
    }
    
    // Sort by frequency
    const sorted = Object.entries(projectFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
    
    // Get project details and build suggestions
    const suggestions = []
    for (const [projectId, count] of sorted) {
      const project = await getDocument(config.indices.projects, projectId)
      if (project) {
        // Use the most recent example or create one
        const examples = requestExamples[projectId] || []
        const example = examples.length > 0 ? examples[0] : `Generate a ${project.name}`
        suggestions.push({
          text: example,
          project_name: project.name,
          frequency: count,
          project_id: projectId
        })
      }
    }
    
    return suggestions
  } catch (err) {
    console.error('Error getting personalized suggestions:', err.message)
    return getDefaultSuggestions()
  }
}

function getDefaultSuggestions() {
  return [
    { text: 'Create a menu image for grilled salmon with lemon butter' },
    { text: 'Make an Instagram post for our summer promotion' },
    { text: 'Generate a photo for the truffle pasta dish' },
    { text: 'Create a football pitch promotional image' },
  ]
}