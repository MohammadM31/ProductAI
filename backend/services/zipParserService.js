import AdmZip from 'adm-zip'
import OpenAI from 'openai'
import { config } from '../config/index.js'
import { v4 as uuidv4 } from 'uuid'

export async function parseGuidelinesZip(zipBuffer) {
  const zip = new AdmZip(zipBuffer)
  const entries = zip.getEntries()
  
  // Build the directory tree with content
  const tree = buildDirectoryTreeWithContent(entries)
  
  // Use AI to understand and map the structure
  const mapped = await aiMapStructure(tree)
  
  // Extract and process all files
  const result = await extractAndProcessFiles(mapped, entries)
  
  return result
}

function buildDirectoryTreeWithContent(entries) {
  const tree = { children: {} }
  
  for (const entry of entries) {
    if (entry.isDirectory) continue
    
    const parts = entry.entryName.split('/').filter(p => p)
    let current = tree
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      
      if (i === parts.length - 1) {
        // File - store content info
        if (!current.files) current.files = []
        
        const isImage = /\.(png|jpg|jpeg|webp|gif)$/i.test(part)
        const isDoc = /\.(docx?|txt|pdf|md)$/i.test(part)
        
        current.files.push({
          name: part,
          fullPath: entry.entryName,
          isImage,
          isDoc,
          size: entry.getData().length,
          // Don't load content yet - we'll do that when needed
        })
      } else {
        // Directory
        if (!current.children) current.children = {}
        if (!current.children[part]) {
          current.children[part] = { children: {} }
        }
        current = current.children[part]
      }
    }
  }
  
  return tree
}

async function aiMapStructure(tree) {
  const openai = new OpenAI({ apiKey: config.openai.apiKey })
  
  const structureDescription = JSON.stringify(tree, null, 2)
  
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a content mapping specialist. Parse this directory structure and identify the project hierarchy.

        The structure represents:
        - Department (top level) → "marketing department"
        - Request Type (second level) → "instagram post" or "menu item"
        - Category (third level) → "hot drink" or "ice drink"
        - Files: guidelines (DOCX/TXT) and sample images (PNG/JPG)

        For each category (hot drink/ice drink), identify which files are:
        1. GUIDELINES → contains rules/instructions (DOCX files)
        2. SAMPLE IMAGES → visual references (PNG/JPG files)

        Return a JSON structure like this:
        {
          "department": "marketing department",
          "requestTypes": {
            "instagram post": {
              "categories": {
                "hot drink": {
                  "guidelines": ["Guidelines for instagram post for hot drink image generation.docx"],
                  "sampleImages": ["Sample instagram post for hot drink image generation 1.PNG", "Sample instagram post for hot drink image generation 2.PNG"]
                },
                "ice drink": {
                  "guidelines": ["Guidelines for instagram post for ice drink image generation.docx"],
                  "sampleImages": ["Sample instagram post for ice drink image generation 1.PNG", "Sample instagram post for ice drink image generation 2.PNG"]
                }
              }
            },
            "menu item": {
              "categories": {
                "hot drink": {
                  "guidelines": ["Guidelines for hot drink image generation.docx"],
                  "sampleImages": ["Sample Menu Item Post for hot drink image generation.png"]
                },
                "ice drink": {
                  "guidelines": ["Guidelines for ice drink image generation.docx"],
                  "sampleImages": ["Sample Menu Item Post for ice drink image generation.png"]
                }
              }
            }
          }
        }

        Parse this structure:\n${structureDescription}`
      }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1
  })
  
  return JSON.parse(response.choices[0].message.content)
}

async function extractAndProcessFiles(mappedStructure, entries) {
  // Create a map of fullPath to entry
  const entryMap = {}
  for (const entry of entries) {
    entryMap[entry.entryName] = entry
  }
  
  const result = {
    projects: []
  }
  
  const requestTypes = mappedStructure.requestTypes || {}
  
  for (const [requestTypeName, requestTypeData] of Object.entries(requestTypes)) {
    const categories = requestTypeData.categories || {}
    
    for (const [categoryName, categoryData] of Object.entries(categories)) {
      const project = {
        name: `${requestTypeName} - ${categoryName}`,
        description: `${requestTypeName} for ${categoryName}`,
        category: categoryName,
        requestType: requestTypeName,
        department: mappedStructure.department || 'marketing department',
        system_prompt: '',
        reference_criteria: '',
        reference_images: [],
        attached_files: []
      }
      
      // Process guidelines (DOCX files)
      const guidelinesFiles = categoryData.guidelines || []
      for (const fileName of guidelinesFiles) {
        const entry = findEntryByName(fileName, entries)
        if (entry) {
          const content = entry.getData().toString('utf-8')
          const textContent = extractTextFromDocx(content)
          
          // Determine if this is system_prompt or reference_criteria
          if (textContent.includes('font') || textContent.includes('layout') || textContent.includes('must be')) {
            project.system_prompt += `\n\n${textContent}`
          } else {
            project.reference_criteria += `\n\n${textContent}`
          }
          
          project.attached_files.push({
            id: uuidv4(),
            name: fileName,
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            content: textContent
          })
        }
      }
      
      // Process sample images
      const imageFiles = categoryData.sampleImages || []
      for (const fileName of imageFiles) {
        const entry = findEntryByName(fileName, entries)
        if (entry) {
          const base64Data = entry.getData().toString('base64')
          const mimeType = getMimeType(fileName)
          
          // Analyze image with AI to generate description
          const description = await analyzeImage(base64Data, mimeType, categoryName)
          
          project.reference_images.push({
            id: uuidv4(),
            name: fileName,
            url: `data:${mimeType};base64,${base64Data}`,
            description: description,
            category: categoryName
          })
        }
      }
      
      // Add some AI-generated context
      project.system_prompt = await enhanceSystemPrompt(project.system_prompt, project.name)
      project.reference_criteria = await enhanceReferenceCriteria(project.reference_criteria, project.name)
      
      result.projects.push(project)
    }
  }
  
  return result
}

function findEntryByName(fileName, entries) {
  // Find entry that ends with the filename
  for (const entry of entries) {
    if (entry.entryName.endsWith(fileName)) {
      return entry
    }
  }
  return null
}

function getMimeType(fileName) {
  const ext = fileName.split('.').pop().toLowerCase()
  const mimeTypes = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'webp': 'image/webp',
    'gif': 'image/gif'
  }
  return mimeTypes[ext] || 'image/png'
}

function extractTextFromDocx(content) {
  // For DOCX, we need to parse the XML
  // Simple approach: look for text in the document
  try {
    // This is simplified - in production use a proper DOCX parser
    const text = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    return text || content
  } catch (err) {
    return content
  }
}

async function analyzeImage(base64Data, mimeType, categoryName) {
  const openai = new OpenAI({ apiKey: config.openai.apiKey })
  
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-vision-preview',
      max_tokens: 150,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this image and describe what it shows. This is a sample for ${categoryName}. 
              Focus on: style, colors, composition, and what makes it suitable for this category.`
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Data}`
              }
            }
          ]
        }
      ]
    })
    
    return response.choices[0].message.content
  } catch (err) {
    console.error('Image analysis failed:', err.message)
    return `Sample image for ${categoryName}`
  }
}

async function enhanceSystemPrompt(prompt, projectName) {
  const openai = new OpenAI({ apiKey: config.openai.apiKey })
  
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a prompt engineer. Format and enhance this guidelines text into a clear, structured system prompt.
          Add context: "You are creating ${projectName}."
          Organize into clear sections.`
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    })
    
    return response.choices[0].message.content
  } catch (err) {
    return prompt
  }
}

async function enhanceReferenceCriteria(criteria, projectName) {
  const openai = new OpenAI({ apiKey: config.openai.apiKey })
  
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a creative director. Format and enhance these visual requirements into a clear reference criteria document.
          Focus on: visual style, composition, colors, and technical requirements.`
        },
        {
          role: 'user',
          content: criteria
        }
      ]
    })
    
    return response.choices[0].message.content
  } catch (err) {
    return criteria
  }
}