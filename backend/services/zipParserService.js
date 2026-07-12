// backend/services/zipParserService.js
import AdmZip from 'adm-zip'
import { config } from '../config/index.js'
import { v4 as uuidv4 } from 'uuid'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export async function parseGuidelinesZip(zipBuffer) {
  const zip = new AdmZip(zipBuffer)
  const entries = zip.getEntries()
  
  const tree = buildDirectoryTreeWithContent(entries)
  const result = await extractAndProcessFiles(tree, entries)
  
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
        if (!current.files) current.files = []
        
        const isImage = /\.(png|jpg|jpeg|webp|gif)$/i.test(part)
        const isDoc = /\.(docx?|txt|pdf|md)$/i.test(part)
        
        current.files.push({
          name: part,
          fullPath: entry.entryName,
          isImage,
          isDoc,
          size: entry.getData().length,
        })
      } else {
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

async function processImageToFile(entry, categoryName) {
  try {
    const data = entry.getData()
    const ext = entry.entryName.split('.').pop().toLowerCase()
    const filename = `${uuidv4()}.${ext}`
    
    const uploadDir = path.join(__dirname, '..', 'uploads', 'reference_images')
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }
    
    const filepath = path.join(uploadDir, filename)
    fs.writeFileSync(filepath, data)
    
    const publicUrl = `${process.env.PUBLIC_BASE_URL || 'http://localhost:5000'}/uploads/reference_images/${filename}`
    
    return {
      id: uuidv4(),
      name: entry.entryName.split('/').pop(),
      url: publicUrl,
      description: `Sample image for ${categoryName}`,
      category: categoryName,
      ref_type: 'product'
    }
  } catch (err) {
    console.warn(`Failed to process image ${entry.entryName}:`, err.message)
    return null
  }
}

async function extractAndProcessFiles(tree, entries) {
  const result = { projects: [] }
  
  // FIX: Add 'async' here
  async function traverse(node, path = []) {
    if (node.files && node.files.length > 0 && Object.keys(node.children).length === 0) {
      const categoryName = path[path.length - 1] || 'Uncategorized'
      const requestType = path[path.length - 2] || 'General'
      const department = path[0] || 'Marketing Department'
      
      const project = {
        name: `${requestType} - ${categoryName}`,
        description: `${requestType} for ${categoryName}`,
        category: categoryName,
        requestType: requestType,
        department: department,
        system_prompt: '',
        reference_criteria: '',
        reference_images: [],
        attached_files: []
      }
      
      for (const fileInfo of node.files) {
        const entry = entries.find(e => e.entryName === fileInfo.fullPath)
        if (!entry) continue
        
        if (fileInfo.isDoc) {
          try {
            const content = entry.getData().toString('utf-8')
            const textContent = extractTextFromDocx(content)
            
            if (textContent && textContent.length > 10) {
              project.attached_files.push({
                id: uuidv4(),
                name: fileInfo.name,
                type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                content: textContent
              })

              if (/guideline|guidance|style|brand/i.test(fileInfo.name)) {
                project.reference_criteria += (project.reference_criteria ? '\n\n' : '') +
                  `[From ${fileInfo.name}]\n${textContent}`
              }
            }
          } catch (err) {
            console.warn(`Failed to process ${fileInfo.name}:`, err.message)
          }
        }
        
        if (fileInfo.isImage) {
          try {
            const imageData = await processImageToFile(entry, categoryName)
            if (imageData) {
              project.reference_images.push(imageData)
            }
          } catch (err) {
            console.warn(`Failed to process image ${fileInfo.name}:`, err.message)
          }
        }
      }
      
      if (project.reference_images.length > 0 || project.attached_files.length > 0) {
        result.projects.push(project)
      }
    }
    
    for (const [name, child] of Object.entries(node.children || {})) {
      await traverse(child, [...path, name])  // Add 'await' here
    }
  }
  
  await traverse(tree)  // Add 'await' here
  
  return result
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
  try {
    const text = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    return text || 'No text content found'
  } catch (err) {
    return 'Could not extract text'
  }
}