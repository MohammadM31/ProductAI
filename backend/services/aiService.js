// services/aiService.js
import OpenAI from 'openai'
import { config } from '../config/index.js'
import { searchDocuments, indexDocument, getDocument } from './databaseService.js'
import { v4 as uuidv4 } from 'uuid'
import { generateImage } from './nanobananaService.js'
import { buildLayeredPsd } from './psdService.js'
import { cache } from './cacheService.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let openaiClient = null

function getOpenAI() {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: config.openai.apiKey,
    })
  }
  return openaiClient
}

// ============================================================
// FAST MAPPING - Keyword-based matching
// ============================================================
export async function fastMapRequest(requestText) {
  console.log('⚡ Using fast mapping for:', requestText.substring(0, 50) + '...')
  
  const projects = await cache.getProjects()
  if (projects.length === 0) return null
  if (projects.length === 1) return projects[0]
  
  const lowerRequest = requestText.toLowerCase()
  const words = lowerRequest.split(/\s+/).filter(w => w.length > 3)
  
  const scored = projects.map(project => {
    let score = 0
    const keywords = (project.trigger_keywords || '').toLowerCase().split(/\s+/)
    const name = (project.name || '').toLowerCase()
    const description = (project.description || '').toLowerCase()
    
    for (const word of words) {
      if (keywords.some(kw => kw.includes(word) || word.includes(kw))) {
        score += 3
      }
      if (name.includes(word)) {
        score += 2
      }
      if (description.includes(word)) {
        score += 1
      }
    }
    
    return { project, score }
  })
  
  scored.sort((a, b) => b.score - a.score)
  const best = scored[0]
  
  if (best.score >= 2) {
    const deptName = await getDepartmentName(best.project.department_id)
    console.log(`✅ Fast match found: "${best.project.name}" (${deptName}) score: ${best.score}`)
    return best.project
  }
  
  console.log('⚠️ No fast match found (score too low)')
  return null
}

// ============================================================
// AI MAPPING - OpenAI-based matching (fallback)
// ============================================================
async function aiMapRequest(requestText) {
  console.log('🧠 Using OpenAI for project mapping...')
  
  const projects = await cache.getProjects()
  if (projects.length === 0) return null
  if (projects.length === 1) return projects[0]
  
  const departments = await cache.getDepartments()
  const deptMap = {}
  departments.forEach(d => { deptMap[d.id] = d.name })
  
  const projectList = projects.map(p => {
    const deptName = deptMap[p.department_id] || 'Unassigned'
    return `ID: ${p.id}\nName: ${p.name}\nDepartment: ${deptName}\nDescription: ${p.description || 'No description'}\nKeywords: ${p.trigger_keywords || ''}\n---`
  }).join('\n')
  
  const systemPrompt = `You are a project router. Analyze the user request and pick the best matching project.

AVAILABLE PROJECTS:
${projectList}

USER REQUEST: "${requestText}"

Reply with ONLY the project ID. No explanation.`

  const openai = getOpenAI()
  const resp = await openai.chat.completions.create({
    model: config.openai.model || 'gpt-4o',
    max_tokens: 20,
    temperature: 0.1,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Project ID:' }
    ],
  })
  
  const projectId = resp.choices[0].message.content.trim()
  const matchedProject = projects.find(p => p.id === projectId)
  
  if (matchedProject) {
    const deptName = deptMap[matchedProject.department_id] || 'Unknown'
    console.log(`✅ OpenAI matched: "${matchedProject.name}" (${deptName})`)
    return matchedProject
  }
  
  console.log('⚠️ OpenAI returned invalid ID, using first project')
  return projects[0]
}

// ============================================================
// MAIN MAPPING FUNCTION
// ============================================================
export async function mapRequestToProject(requestText, timeout = 3000) {
  console.log('🤖 Mapping request:', requestText.substring(0, 50) + '...')
  
  const fastMatch = await fastMapRequest(requestText)
  if (fastMatch) {
    const deptName = await getDepartmentName(fastMatch.department_id)
    console.log(`✅ Fast mapping returned: "${fastMatch.name}" (${deptName})`)
    return fastMatch
  }
  
  try {
    console.log('⏳ Fast match not found, trying OpenAI mapping with timeout...')
    
    const result = await Promise.race([
      aiMapRequest(requestText),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('OpenAI mapping timeout')), timeout)
      )
    ])
    
    return result
  } catch (err) {
    console.warn('⚠️ OpenAI mapping timed out or failed, using fallback:', err.message)
    const fallback = await fastMapRequest(requestText)
    if (fallback) return fallback
    
    const projects = await cache.getProjects()
    if (projects.length > 0) {
      console.log(`📋 Ultimate fallback: using "${projects[0].name}"`)
      return projects[0]
    }
    
    return null
  }
}

// ============================================================
// Helper: Get Department Name
// ============================================================
async function getDepartmentName(departmentId) {
  if (!departmentId) return 'Unassigned'
  try {
    const departments = await cache.getDepartments()
    const found = departments.find(d => d.id === departmentId)
    return found ? found.name : 'Unknown'
  } catch {
    return 'Unknown'
  }
}

// ============================================================
// QUICK MAPPING FOR FALLBACK
// ============================================================
export async function quickMapRequest(requestText) {
  const projects = await cache.getProjects()
  
  if (projects.length === 0) return null
  if (projects.length === 1) return projects[0]
  
  const lowerRequest = requestText.toLowerCase()
  
  const scored = projects.map(project => {
    let score = 0
    const keywords = (project.trigger_keywords || '').toLowerCase().split(/\s+/)
    const name = (project.name || '').toLowerCase()
    
    for (const kw of keywords) {
      if (kw.length > 2 && lowerRequest.includes(kw)) {
        score += 3
      }
    }
    
    const nameWords = name.split(/\s+/)
    for (const word of nameWords) {
      if (word.length > 3 && lowerRequest.includes(word)) {
        score += 2
      }
    }
    
    return { project, score }
  })
  
  scored.sort((a, b) => b.score - a.score)
  
  if (scored[0].score >= 2) {
    return scored[0].project
  }
  
  return projects[0]
}

// ============================================================
// Generate Output
// ============================================================
export async function generateOutput(userRequest, project, previousImageUrl = null) {
  const outputType = project.output_type || 'image'
  
  if (outputType === 'image' || outputType === 'psd' || outputType === 'svg') {
    return generateImageOutput(userRequest, project, previousImageUrl)
  }
  return generateTextOutput(userRequest, project)
}

// ============================================================
// Convert base64 image to public URL
// ============================================================
async function convertBase64ToPublicUrl(base64Data, filename = null) {
  try {
    const matches = base64Data.match(/^data:image\/(\w+);base64,(.+)$/)
    if (!matches) return null
    
    const ext = matches[1] || 'png'
    const data = matches[2]
    const buffer = Buffer.from(data, 'base64')
    
    const uploadDir = path.join(__dirname, '..', 'uploads', 'reference_images')
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }
    
    const name = filename || `${uuidv4()}.${ext}`
    const filepath = path.join(uploadDir, name)
    fs.writeFileSync(filepath, buffer)
    
    const base = process.env.PUBLIC_BASE_URL
    if (!base && config.nodeEnv === 'production') {
      console.error(
        '❌ PUBLIC_BASE_URL is not set! This reference image will be saved with an ' +
        'unreachable "http://localhost:5000" URL, and the image generator will NOT be able to fetch it.'
      )
    }
    const publicUrl = `${(base || 'http://localhost:5000').replace(/\/$/, '')}/uploads/reference_images/${name}`
    return publicUrl
  } catch (err) {
    console.error('❌ Failed to convert base64 image:', err.message)
    return null
  }
}

// ============================================================
// Get the full public URL for an image
// ============================================================
function getFullImageUrl(url) {
  if (!url) return null
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }
  if (url.startsWith('/uploads/')) {
    const base = process.env.PUBLIC_BASE_URL || 'http://localhost:5000'
    return `${base.replace(/\/$/, '')}${url}`
  }
  if (url.startsWith('uploads/')) {
    const base = process.env.PUBLIC_BASE_URL || 'http://localhost:5000'
    return `${base.replace(/\/$/, '')}/${url}`
  }
  return url
}

// ============================================================
// Generate Image Output - Uses previous image as reference if available
// ============================================================
async function generateImageOutput(userRequest, project, previousImageUrl = null) {
  // Get reference image URL - PRIORITIZE previous generated image
  let referenceImageUrl = null
  
  // 1. Check if we have a previous generated image to use as reference
  if (previousImageUrl) {
    const fullUrl = getFullImageUrl(previousImageUrl)
    if (fullUrl && (fullUrl.startsWith('http://') || fullUrl.startsWith('https://'))) {
      referenceImageUrl = fullUrl
      console.log(`📸 Using previous generated image as reference: ${referenceImageUrl.substring(0, 80)}...`)
    }
  }
  
  // 2. If no previous image, fall back to project reference images
  if (!referenceImageUrl) {
    const allRefs = project.reference_images || []
    const productImages = allRefs.filter(img => img.ref_type !== 'style')
    
    if (productImages.length > 0 && productImages[0]?.url) {
      const imageUrl = productImages[0].url
      
      if (imageUrl.startsWith('data:image')) {
        console.log('🔄 Converting base64 reference image to public URL...')
        const publicUrl = await convertBase64ToPublicUrl(
          imageUrl, 
          productImages[0].name || `ref_${uuidv4()}.png`
        )
        if (publicUrl) {
          referenceImageUrl = publicUrl
          console.log(`✅ Saved reference image to public URL: ${referenceImageUrl}`)
        }
      } else if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
        referenceImageUrl = imageUrl
        console.log(`📸 Using project reference image: ${referenceImageUrl.substring(0, 80)}...`)
      }
    }
  }

  // 3. If still no reference, use prompt-only mode
  if (!referenceImageUrl) {
    console.log('⚠️ No reference image available, using prompt-only generation')
  }

  // Determine if this is an iteration (we have a previous image)
  const isIteration = !!previousImageUrl
  
  // Higher strength for iterations to preserve more of the original
  const strength = isIteration ? 0.85 : 0.70
  
  console.log(`🎯 Using strength: ${strength} (${isIteration ? 'iteration - high preservation' : 'first generation - moderate preservation'})`)

  // ============================================================
  // USE USER'S REQUEST EXACTLY AS-IS
  // ============================================================
  console.log('📝 Using user\'s request EXACTLY as-is:', userRequest)
  console.log(`   Reference image: ${referenceImageUrl || 'None (prompt-only)'}`)
  
  try {
    console.log(`🎨 Generating image with Nano Banana 2...`)
    
    const result = await generateImage(userRequest, {
      referenceImage: referenceImageUrl,
      width: 1024,
      height: 1024,
      enhancePrompt: false,
      strength: strength,
    }, true)
    
    if (!result.url || typeof result.url !== 'string') {
      console.error('❌ Invalid image URL received:', result.url)
      throw new Error('Invalid image URL received from Nano Banana 2')
    }

    return await finalizeImageOutput({
      project,
      imageUrl: result.url,
      imagePrompt: userRequest,
      modelName: 'nano-banana-2',
      isSvgModel: false,
      referenceImageUrl,
      fallback: false,
    })
  } catch (err) {
    console.error('❌ Nano Banana 2 generation failed:', err.message)
    
    console.log('🔄 Trying Replicate fallback...')
    try {
      const { generateImageWithFallback } = await import('./replicateService.js')
      const fallbackResult = await generateImageWithFallback(
        userRequest,
        ['flux-dev', 'sdxl'],
        referenceImageUrl
      )
      
      return await finalizeImageOutput({
        project,
        imageUrl: fallbackResult.url,
        imagePrompt: userRequest,
        modelName: fallbackResult.model || 'replicate-fallback',
        isSvgModel: false,
        referenceImageUrl,
        fallback: true,
      })
    } catch (fallbackErr) {
      console.error('❌ All models failed:', fallbackErr.message)
      throw new Error(`Image generation failed: ${fallbackErr.message}`)
    }
  }
}

// ============================================================
// Finalize an image result
// ============================================================
async function finalizeImageOutput({ project, imageUrl, imagePrompt, modelName, isSvgModel, referenceImageUrl, fallback }) {
  const base = {
    content: imageUrl,
    dalle_prompt: imagePrompt,
    model_used: modelName,
    used_reference: !!referenceImageUrl,
    ...(fallback ? { fallback: true } : {}),
  }

  if (isSvgModel) {
    return { output_type: 'svg', ...base }
  }

  if (project.output_type === 'psd') {
    try {
      const { psdUrl, layers } = await buildLayeredPsd(imageUrl, { name: project.name || 'output' })
      return {
        output_type: 'psd',
        ...base,
        content: psdUrl,
        preview_url: imageUrl,
        layers,
      }
    } catch (err) {
      console.error('❌ PSD layering failed, falling back to flat image:', err.message)
      return { output_type: 'image', ...base, psd_error: err.message }
    }
  }

  return { output_type: 'image', ...base }
}

// ============================================================
// Generate Text Output
// ============================================================
async function generateTextOutput(userRequest, project) {
  const openai = getOpenAI()
  const systemPrompt = project.system_prompt || ''

  try {
    const response = await openai.chat.completions.create({
      model: config.openai.model || 'gpt-4o',
      max_tokens: 1500,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userRequest },
      ],
    })

    return {
      output_type: 'text',
      content: response.choices[0].message.content,
    }
  } catch (apiError) {
    console.error('❌ Text generation API error:', apiError.message)
    if (apiError.status === 402) {
      return {
        output_type: 'text',
        content: `I understand you want to: "${userRequest}". However, the AI service is currently unavailable. Please try again later or contact your administrator.`,
      }
    }
    throw apiError
  }
}

// ============================================================
// Iterate Output - Uses previous image as reference
// ============================================================
export async function iterateOutput(originalRequest, feedback, previousContent, project, previousImageUrl = null) {
  const outputType = project.output_type || 'image'
  
  if (outputType === 'image' || outputType === 'psd' || outputType === 'svg') {
    // Use ONLY the feedback, and pass the previous image as reference
    console.log('🔄 Iterating with feedback only:', feedback)
    console.log(`   Using previous image as reference: ${previousImageUrl ? 'YES' : 'NO'}`)
    return generateImageOutput(feedback, project, previousImageUrl)
  }

  // For text outputs
  const openai = getOpenAI()
  const systemPrompt = project.system_prompt || ''

  const response = await openai.chat.completions.create({
    model: config.openai.model || 'gpt-4o',
    max_tokens: 1500,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'assistant', content: previousContent },
      {
        role: 'user',
        content: `Please revise based on this feedback: ${feedback}`,
      },
    ],
  })

  return {
    output_type: 'text',
    content: response.choices[0].message.content,
  }
}

// ============================================================
// Save Output
// ============================================================
export async function saveOutput({ sessionId, projectId, departmentId, outputType, content, originalRequest, requesterId, requesterName, requesterEmail }) {
  const id = uuidv4()
  const doc = {
    id,
    session_id: sessionId,
    project_id: projectId,
    department_id: departmentId,
    output_type: outputType,
    content: content || 'No content generated',
    original_request: originalRequest || '',
    status: 'pending_review',
    created_at: new Date().toISOString(),
    requester_id: requesterId || null,
    requester_name: requesterName || null,
    requester_email: requesterEmail || null,
  }
  console.log('💾 Saving output:', {
    id,
    requester_id: requesterId,
    requester_name: requesterName,
    requester_email: requesterEmail,
    status: 'pending_review'
  })
  await indexDocument(config.indices.outputs, id, doc)
  return doc
}

// ============================================================
// Get All Outputs
// ============================================================
export async function getAllOutputs() {
  return searchDocuments(config.indices.outputs, {
    query: { match_all: {} },
    sort: [{ created_at: { order: 'desc' } }],
    size: 500,
  })
}

export async function getOutputsByDepartment(departmentId) {
  return searchDocuments(config.indices.outputs, {
    query: { term: { department_id: departmentId } },
    sort: [{ created_at: { order: 'desc' } }],
    size: 100,
  })
}

export async function getOutputsByProject(projectId) {
  return searchDocuments(config.indices.outputs, {
    query: { term: { project_id: projectId } },
    sort: [{ created_at: { order: 'desc' } }],
    size: 100,
  })
}