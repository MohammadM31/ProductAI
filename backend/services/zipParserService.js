// backend/services/zipParserService.js
import AdmZip from 'adm-zip'
import { config } from '../config/index.js'
import { v4 as uuidv4 } from 'uuid'

export async function parseGuidelinesZip(zipBuffer) {
  const zip = new AdmZip(zipBuffer)
  const entries = zip.getEntries()
  
  // Build the directory tree with content
  const tree = buildDirectoryTreeWithContent(entries)
  
  // Extract and process files without AI
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

async function extractAndProcessFiles(tree, entries) {
  const result = { projects: [] }
  
  // Helper to recursively traverse the tree
  function traverse(node, path = []) {
    // If we have files and we're at a leaf node
    if (node.files && node.files.length > 0 && Object.keys(node.children).length === 0) {
      // Category and requestType are always counted from the bottom
      // (closest to the files). Department is always the top-level
      // folder, regardless of how many organizational folders sit
      // in between (e.g. "business/request types/business report/annual report/").
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
      
      // Process files in this folder
      for (const fileInfo of node.files) {
        const entry = entries.find(e => e.entryName === fileInfo.fullPath)
        if (!entry) continue
        
        if (fileInfo.isDoc) {
          try {
            const content = entry.getData().toString('utf-8')
            const textContent = extractTextFromDocx(content)
            
            if (textContent && textContent.length > 10) {
              // Store as attached file
              project.attached_files.push({
                id: uuidv4(),
                name: fileInfo.name,
                type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                content: textContent
              })

              // If the file name signals it's a style/brand guideline, also feed
              // it directly into reference_criteria so it's used as generation
              // guidance, not just kept as a passive attachment.
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
            const data = entry.getData()
            const base64Data = data.toString('base64')
            const mimeType = getMimeType(fileInfo.name)
            
            project.reference_images.push({
              id: uuidv4(),
              name: fileInfo.name,
              url: `data:${mimeType};base64,${base64Data}`,
              description: `Sample image for ${categoryName} - ${fileInfo.name}`,
              category: categoryName
            })
          } catch (err) {
            console.warn(`Failed to process image ${fileInfo.name}:`, err.message)
          }
        }
      }
      
      // Only add if there's content
      if (project.reference_images.length > 0 || project.attached_files.length > 0) {
        result.projects.push(project)
      }
    }
    
    // Recursively traverse children
    for (const [name, child] of Object.entries(node.children || {})) {
      traverse(child, [...path, name])
    }
  }
  
  traverse(tree)
  
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
    // Simple text extraction from DOCX
    const text = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    return text || 'No text content found'
  } catch (err) {
    return 'Could not extract text'
  }
}