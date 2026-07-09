import OpenAI from 'openai'
import { config } from '../config/index.js'
import { searchDocuments, indexDocument, getDocument } from './databaseService.js'
import { v4 as uuidv4 } from 'uuid'
import { generateImageWithReplicate, generateImageWithFallback } from './replicateService.js'

/*let openaiClient = null

function getOpenAI() {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: config.openai.apiKey })
  }
  return openaiClient
}*/

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


// ============================================================
// AI-Powered Project Mapping with Department Awareness
// ============================================================
export async function mapRequestToProject(requestText) {
  const projects = await searchDocuments(config.indices.projects, {
    query: { match_all: {} },
    size: 50,
  })

  if (projects.length === 0) return null

  if (projects.length === 1) {
    console.log(`✅ Only one project exists: "${projects[0].name}"`)
    return projects[0]
  }

  try {
     //const openai = getOpenAI()
    
    const departments = await searchDocuments(config.indices.departments, {
      query: { match_all: {} },
      size: 50,
    })
    const deptMap = {}
    departments.forEach(d => { deptMap[d.id] = d.name })

    const projectList = projects.map(p => {
      const deptName = deptMap[p.department_id] || 'Unassigned'
      let info = `PROJECT ID: ${p.id}\n`
      info += `Name: ${p.name}\n`
      info += `Department: ${deptName}\n`
      info += `Description: ${p.description || 'No description'}\n`
      info += `Output Type: ${p.output_type || 'image'}\n`
      
      if (p.reference_criteria) {
        info += `Style Guide: ${p.reference_criteria.substring(0, 200)}...\n`
      }
      
      if (p.system_prompt) {
        const promptSummary = p.system_prompt.substring(0, 150)
        info += `Guidelines: ${promptSummary}...\n`
      }
      
      return info
    }).join('\n---\n')

    const systemPrompt = `You are an intelligent project routing system. Your task is to analyze user requests and match them to the most appropriate project.

CRITICAL RULES:
1. Understand the user's INTENT and what they want to CREATE
2. Consider the project's PURPOSE, not just keywords
3. Pay attention to the DEPARTMENT context
4. If multiple projects could work, pick the BEST fit based on INTENT
5. Reply with ONLY the project ID - nothing else, no explanation

AVAILABLE PROJECTS:
${projectList}

USER REQUEST: "${requestText}"

Analyze what the user wants to create and which project best matches their intent. Reply with ONLY the project ID.`

    /*const resp = await openai.chat.completions.create({
      model: config.openai.model,*/
      const deepseek = getDeepSeek()
const resp = await deepseek.chat.completions.create({
  model: config.deepseek.model || 'deepseek-chat',
      max_tokens: 50,
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: `Project ID:`
        },
      ],
    })

    const projectId = resp.choices[0].message.content.trim()
    console.log(`🤖 AI suggested project ID: "${projectId}"`)
    
    const matchedProject = projects.find(p => p.id === projectId)
    
    if (matchedProject) {
      const deptName = deptMap[matchedProject.department_id] || 'Unknown Department'
      console.log(`✅ AI matched to: "${matchedProject.name}" (${deptName})`)
      return matchedProject
    }

    console.log(`⚠️ AI returned invalid ID, using fallback`)
    const fallbackMatch = await fallbackProjectMatch(requestText, projects, deptMap)
    if (fallbackMatch) return fallbackMatch
    
    return projects[0]

  } catch (err) {
    console.error('❌ AI mapping failed:', err.message)
    
    console.log('🔄 Falling back to intelligent matching...')
    const departments = await searchDocuments(config.indices.departments, {
      query: { match_all: {} },
      size: 50,
    })
    const deptMap = {}
    departments.forEach(d => { deptMap[d.id] = d.name })
    
    const fallbackMatch = await fallbackProjectMatch(requestText, projects, deptMap)
    if (fallbackMatch) return fallbackMatch
    
    console.log(`⚠️ No match found, using default: "${projects[0].name}"`)
    return projects[0]
  }
}

// ============================================================
// Intelligent Fallback Matching
// ============================================================
async function fallbackProjectMatch(requestText, projects, deptMap) {
  const lowerRequest = requestText.toLowerCase()
  
  const scored = projects.map(project => {
    let score = 0
    const keywords = (project.trigger_keywords || '').toLowerCase().split(/\s+/)
    const description = (project.description || '').toLowerCase()
    const name = (project.name || '').toLowerCase()
    const criteria = (project.reference_criteria || '').toLowerCase()
    
    for (const kw of keywords) {
      if (kw.length > 2 && lowerRequest.includes(kw)) {
        score += 3
      }
    }
    
    const descWords = description.split(/\s+/)
    for (const word of descWords) {
      if (word.length > 3 && lowerRequest.includes(word)) {
        score += 2
      }
    }
    
    const nameWords = name.split(/\s+/)
    for (const word of nameWords) {
      if (word.length > 3 && lowerRequest.includes(word)) {
        score += 2
      }
    }
    
    const criteriaWords = criteria.split(/\s+/)
    for (const word of criteriaWords) {
      if (word.length > 4 && lowerRequest.includes(word)) {
        score += 1
      }
    }
    
    return { project, score }
  })
  
  scored.sort((a, b) => b.score - a.score)
  const best = scored[0]
  
  if (best.score >= 3) {
    const deptName = deptMap[best.project.department_id] || 'Unknown'
    console.log(`✅ Fallback matched "${best.project.name}" (${deptName}) with score ${best.score}`)
    return best.project
  }
  
  return null
}

// ============================================================
// Helper: Build System Prompt
// ============================================================
function buildSystemPrompt(project) {
  let systemPrompt = project.system_prompt || ''
  
  if (project.attached_files && project.attached_files.length > 0) {
    systemPrompt += '\n\n=== REFERENCE DOCUMENTS ===\n'
    project.attached_files.forEach((file, index) => {
      if (!file.content) return
      
      systemPrompt += `\n--- Document ${index + 1}: ${file.name} (${file.type}) ---\n`
      
      if (file.type && (file.type.includes('text') || file.type.includes('json') || file.type.includes('javascript'))) {
        systemPrompt += `${file.content}\n`
      } else if (file.type && file.type.includes('image')) {
        systemPrompt += `[Image uploaded: ${file.name} - use as visual reference for style, composition, and quality]\n`
      } else if (file.content) {
        systemPrompt += `${file.content}\n`
      }
    })
    systemPrompt += '\n=== END REFERENCE DOCUMENTS ===\n'
  }
  
  if (project.reference_criteria) {
    systemPrompt += `\n=== VISUAL REFERENCE CRITERIA ===\n${project.reference_criteria}\n=== END VISUAL REFERENCE CRITERIA ===\n`
  }
  
  if (project.reference_images && project.reference_images.length > 0) {
    systemPrompt += '\n=== REFERENCE IMAGES ===\n'
    project.reference_images.forEach((img, i) => {
      systemPrompt += `${i+1}. ${img.name}`
      if (img.description) {
        systemPrompt += ` - ${img.description}`
      }
      if (img.style_analysis) {
        systemPrompt += `\n   Style: ${img.style_analysis}`
      }
      systemPrompt += '\n'
    })
    systemPrompt += '=== END REFERENCE IMAGES ===\n'
  }
  
  return systemPrompt
}

// ============================================================
// Generate Output
// This platform generates images only — every project, regardless
// of its stored output_type, produces an image.
// ============================================================
export async function generateOutput(userRequest, project) {
  return generateImageOutput(userRequest, project)
}

// ============================================================
// NEW: Detect which reference-image category a request belongs to
// ============================================================
async function detectImageCategory(userRequest, availableCategories) {
  if (availableCategories.length <= 1) {
    return availableCategories[0] || null
  }

  const deepseek = getDeepSeek()
  try {
    const resp = await deepseek.chat.completions.create({
      model: config.deepseek.model || 'deepseek-chat',
      max_tokens: 20,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: `Classify the user's request into exactly one of these categories: ${availableCategories.join(', ')}. Reply with ONLY the category name, nothing else.`,
        },
        { role: 'user', content: userRequest },
      ],
    })
    const category = resp.choices[0].message.content.trim().toLowerCase()
    if (availableCategories.includes(category)) {
      console.log(`🏷️ Detected category: "${category}"`)
      return category
    }
  } catch (err) {
    console.warn('⚠️ Category detection failed:', err.message)
  }

  // Fallback: simple keyword match
  const lower = userRequest.toLowerCase()
  const coldWords = ['iced', 'ice', 'cold', 'frozen', 'chilled']
  const hotWords = ['hot', 'warm', 'steaming']
  if (coldWords.some(w => lower.includes(w)) && availableCategories.includes('cold')) return 'cold'
  if (hotWords.some(w => lower.includes(w)) && availableCategories.includes('hot')) return 'hot'
  return availableCategories[0]
}

// ============================================================
// Generate Image Output with Dynamic Vision Analysis
// ============================================================
async function generateImageOutput(userRequest, project) {
  const deepseek = getDeepSeek() //const openai = getOpenAI()
  const systemPrompt = buildSystemPrompt(project)

  let referenceImageUrl = null
  let imageDescription = ''
  let matchedImages = []

  // Get reference images for the matching category and analyze them dynamically
  if (project.reference_images && project.reference_images.length > 0) {
    const categories = [...new Set(
      project.reference_images.map(img => (img.category || 'general').toLowerCase())
    )]

    const targetCategory = await detectImageCategory(userRequest, categories)

    matchedImages = targetCategory
      ? project.reference_images.filter(
          img => (img.category || 'general').toLowerCase() === targetCategory
        )
      : project.reference_images

    if (matchedImages.length === 0) {
      matchedImages = project.reference_images
    }

    // Use the first matched image as the actual img2img input
    referenceImageUrl = matchedImages[0].url

    try {
      console.log(`🖼️ Analyzing ${matchedImages.length} reference image(s) for category "${targetCategory}"...`)

      const descriptions = await Promise.all(
        matchedImages.map(img =>
          Promise.race([
            analyzeImageWithDeepSeek(img.url),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Analysis timeout')), 10000)
            ),
          ]).catch(err => {
            console.warn(`⚠️ Analysis failed for ${img.name}:`, err.message)
            return 'Reference image provided. Match its style, colors, and composition.'
          })
        )
      )

      imageDescription = descriptions
        .map((desc, i) => `Reference ${i + 1} (${matchedImages[i].name}): ${desc}`)
        .join('\n\n')

      console.log('📸 Combined reference understanding:', imageDescription.substring(0, 150) + '...')

    } catch (err) {
      console.warn('⚠️ Image analysis failed:', err.message)
      imageDescription = 'Reference images provided. Match their style, colors, and composition.'
    }
  }

  // Generate prompt using the dynamic analysis
  /*const promptResponse = await openai.chat.completions.create({
    model: config.openai.model,*/
    const promptResponse = await deepseek.chat.completions.create({
      model: config.deepseek.model || 'deepseek-chat',
    max_tokens: 600,
    messages: [
      {
        role: 'system',
        content: `You are an image prompt generator.

${systemPrompt}

${imageDescription ? `
REFERENCE IMAGE DESCRIPTION:
${imageDescription}

INSTRUCTIONS:
- Use the reference image description above as your PRIMARY guide
- If the user asks for changes, ONLY change what they ask for
- Keep everything else exactly as described in the reference
- If the user asks to remove something, remove it
- If they ask to change something, change ONLY that thing
` : ''}

Generate a single, detailed image prompt. No extra text.`
      },
      {
        role: 'user',
        content: `User Request: "${userRequest}"

${imageDescription ? `
Based on the reference image description above, create a prompt that:
1. Preserves the core elements (cup shape, text, design, etc.)
2. ONLY modifies what the user requested
3. Keeps everything else the same
` : `
Create a prompt based on the user's request.
`}`
      },
    ],
  })

  const imagePrompt = promptResponse.choices[0].message.content.trim()
  console.log('📝 Generated prompt:', imagePrompt)

  const modelName = project.image_model || process.env.REPLICATE_IMAGE_MODEL || 'flux-schnell'
  
  try {
    console.log(`🎨 Generating image with ${modelName}...`)
    
    const result = await generateImageWithReplicate(
      imagePrompt, 
      modelName,
      referenceImageUrl
    )
    
    if (!result.url || typeof result.url !== 'string' || result.url === '{}' || result.url.length < 10) {
      console.error('❌ Invalid image URL received:', result.url)
      throw new Error('Invalid image URL received from Replicate')
    }
    
    return {
      output_type: 'image',
      content: result.url,
      dalle_prompt: imagePrompt,
      model_used: modelName,
      used_reference: !!referenceImageUrl,
    }
  } catch (err) {
    console.error('❌ Replicate generation failed:', err.message)
    
    console.log('🔄 Trying fallback models...')
    try {
      const fallbackResult = await generateImageWithFallback(
        imagePrompt,
        ['flux-schnell', 'flux-dev', 'sdxl'],
        referenceImageUrl
      )
      
      if (!fallbackResult.url || typeof fallbackResult.url !== 'string' || fallbackResult.url === '{}') {
        throw new Error('Invalid fallback image URL')
      }
      
      return {
        output_type: 'image',
        content: fallbackResult.url,
        dalle_prompt: imagePrompt,
        model_used: fallbackResult.model,
        fallback: true,
        used_reference: !!referenceImageUrl,
      }
    } catch (fallbackErr) {
      console.error('❌ All models failed:', fallbackErr.message)
      throw new Error(`Image generation failed: ${fallbackErr.message}`)
    }
  }
}

// ============================================================
// Generate Text Output
// ============================================================
async function generateTextOutput(userRequest, project) {
  /*const openai = getOpenAI()
  const systemPrompt = buildSystemPrompt(project)

  const response = await openai.chat.completions.create({
    model: config.openai.model,*/
    const deepseek = getDeepSeek()
    const systemPrompt = buildSystemPrompt(project)
const response = await deepseek.chat.completions.create({
  model: config.deepseek.model || 'deepseek-chat',
    max_tokens: 1500,
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: userRequest,
      },
    ],
  })

  return {
    output_type: 'text',
    content: response.choices[0].message.content,
  }
}

async function analyzeImageWithDeepSeek(imageData) {
  const deepseek = getDeepSeek()
  
  try {
    const response = await deepseek.chat.completions.create({
      model: config.deepseek.visionModel || 'deepseek-vl',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Describe this image in detail...',
            },
            {
              type: 'image_url',
              image_url: { url: imageData },
            },
          ],
        },
      ],
    })
    return response.choices[0].message.content
  } catch (err) {
    console.warn('⚠️ Image analysis failed:', err.message)
    return 'Reference image for style guidance.'
  }
}

// ============================================================
// Iterate Output (revision)
// This platform generates images only — iteration always re-renders
// an image based on the accumulated feedback.
// ============================================================
export async function iterateOutput(originalRequest, feedback, previousContent, project) {
  return generateImageOutput(`${originalRequest}. Modifications requested: ${feedback}`, project)
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
// Get All Outputs (Admin Inbox — every request, every department)
// ============================================================
export async function getAllOutputs() {
  return searchDocuments(config.indices.outputs, {
    query: { match_all: {} },
    sort: [{ created_at: { order: 'desc' } }],
    size: 200,
  })
}

// ============================================================
// Get Outputs by Department
// ============================================================
export async function getOutputsByDepartment(departmentId) {
  return searchDocuments(config.indices.outputs, {
    query: { term: { department_id: departmentId } },
    sort: [{ created_at: { order: 'desc' } }],
    size: 100,
  })
}

// ============================================================
// Get Outputs by Project
// ============================================================
export async function getOutputsByProject(projectId) {
  return searchDocuments(config.indices.outputs, {
    query: { term: { project_id: projectId } },
    sort: [{ created_at: { order: 'desc' } }],
    size: 100,
  })
}