// services/userHistoryService.js
import { searchDocuments, indexDocument, getDocument } from './databaseService.js'
import { config } from '../config/index.js'
import OpenAI from 'openai'

let deepseekClient = null

function getDeepSeek() {
  if (!deepseekClient) {
    deepseekClient = new OpenAI({
      apiKey: config.deepseek.apiKey,
      baseURL: config.deepseek.baseURL || 'https://api.deepseek.com',
    })
  }
  return deepseekClient
}

export async function trackUserRequest(userId, projectId, requestText) {
  try {
    // Extract keywords from request using simple method
    const keywords = extractKeywords(requestText)
    
    const historyEntry = {
      user_id: userId,
      project_id: projectId,
      request_text: requestText,
      keywords: keywords,  // ← Store extracted keywords
      timestamp: new Date().toISOString()
    }
    
    await indexDocument(config.indices.user_history, `${userId}_${Date.now()}`, historyEntry)
    console.log(`📝 Tracked user request for ${userId} with keywords:`, keywords)
  } catch (err) {
    console.error('Error tracking user request:', err.message)
  }
}

// Simple keyword extraction
function extractKeywords(text) {
  // Remove common words and extract meaningful terms
  const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'for', 'on', 'at', 'to', 'for', 'of', 'with', 'without']
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/)
  return words.filter(w => w.length > 3 && !stopWords.includes(w))
}

export async function getPersonalizedSuggestions(userId, limit = 4) {
  try {
    // Get user's request history
    const history = await searchDocuments(config.indices.user_history, {
      query: { term: { user_id: userId } },
      sort: [{ timestamp: { order: 'desc' } }],
      size: 50  // Get last 50 requests
    })
    
    if (history.length === 0) {
      return getDefaultSuggestions()
    }
    
    // Get all projects
    const projects = await searchDocuments(config.indices.projects, {
      query: { match_all: {} },
      size: 50,
    })
    
    // Use DeepSeek to analyze patterns
    const suggestions = await generateSuggestionsWithDeepSeek(history, projects, limit)
    
    return suggestions
  } catch (err) {
    console.error('Error getting personalized suggestions:', err.message)
    return getDefaultSuggestions()
  }
}

async function generateSuggestionsWithDeepSeek(history, projects, limit) {
  try {
    const deepseek = getDeepSeek()
    
    // Prepare history summary
    const historySummary = history.slice(0, 20).map((entry, i) => 
      `${i+1}. "${entry.request_text}" (Project: ${getProjectName(projects, entry.project_id)})`
    ).join('\n')
    
    // Get available project names
    const projectNames = projects.map(p => p.name).join(', ')
    
    // Build prompt for DeepSeek
    const prompt = `You are a personalization engine analyzing user request patterns.

USER'S REQUEST HISTORY (last 20 requests):
${historySummary}

AVAILABLE PROJECTS:
${projectNames}

ANALYZE THE USER'S PATTERNS AND GENERATE 4 SUGGESTIONS:

1. What does the user request most frequently? What patterns do you see?
2. What keywords or themes appear most often?
3. What would be the most helpful suggestions for this user?

Based on your analysis, generate EXACTLY 4 suggestions that would be most helpful. Each suggestion should be a complete, actionable request that the user can use.

Return your response as a JSON array:
[
  { "text": "specific request text", "reason": "why this suggestion matches the user's patterns" },
  { "text": "another request", "reason": "explanation" }
]

ONLY return the JSON array, no other text.`

    const response = await deepseek.chat.completions.create({
      model: config.deepseek.model || 'deepseek-chat',
      max_tokens: 500,
      temperature: 0.7,
      messages: [
        { role: 'system', content: 'You are a personalization engine that analyzes user request patterns and generates helpful suggestions.' },
        { role: 'user', content: prompt }
      ]
    })

    // Parse the response
    let suggestions = JSON.parse(response.choices[0].message.content)
    
    // Ensure we have the right format
    if (Array.isArray(suggestions)) {
      return suggestions.slice(0, limit).map(s => ({
        text: s.text,
        frequency: s.frequency || 1,
        project_name: s.project_name || null,
        reason: s.reason || null
      }))
    }
    
    return getFallbackSuggestions(history, projects)
    
  } catch (err) {
    console.warn('⚠️ DeepSeek suggestion generation failed, using fallback:', err.message)
    return getFallbackSuggestions(history, projects)
  }
}

function getProjectName(projects, projectId) {
  const project = projects.find(p => p.id === projectId)
  return project ? project.name : 'Unknown Project'
}

function getFallbackSuggestions(history, projects) {
  // Fallback: use most frequent project + variations
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
  
  const sorted = Object.entries(projectFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
  
  const suggestions = []
  for (const [projectId, count] of sorted) {
    const project = projects.find(p => p.id === projectId)
    const examples = requestExamples[projectId] || []
    const example = examples.length > 0 ? examples[0] : `Generate a ${project?.name || 'project'}`
    
    // Create variations
    suggestions.push({ 
      text: example, 
      frequency: count,
      project_name: project?.name || null
    })
    
    // Add a variation if possible
    if (examples.length > 1) {
      suggestions.push({ 
        text: examples[1], 
        frequency: count - 1,
        project_name: project?.name || null
      })
    }
  }
  
  return suggestions.slice(0, 4)
}

function getDefaultSuggestions() {
  return [
    { text: 'Create a menu image for grilled salmon with lemon butter' },
    { text: 'Make an Instagram post for our summer promotion' },
    { text: 'Generate a photo for the truffle pasta dish' },
    { text: 'Create a football pitch promotional image' },
  ].map(s => ({ ...s, frequency: 1 }))
}