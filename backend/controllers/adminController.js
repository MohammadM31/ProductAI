import {
  getAllProjects,
  getProjectsByDepartment,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  getAllDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
} from '../services/projectService.js'
import { getOutputsByProject, getOutputsByDepartment, getAllOutputs } from '../services/aiService.js'
import { getDocument, indexDocument, searchDocuments, updateDocument, deleteDocument } from '../services/databaseService.js'
import { config } from '../config/index.js'
import OpenAI from 'openai'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { parseGuidelinesZip } from '../services/zipParserService.js'
import multer from 'multer'

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 100 * 1024 * 1024,
    fieldSize: 100 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/zip' || file.originalname.endsWith('.zip')) {
      cb(null, true)
    } else {
      cb(new Error('Only ZIP files are allowed'))
    }
  }
})

export async function uploadGuidelinesZipHandler(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No ZIP file provided' })
    }

    console.log('📦 Processing ZIP file:', req.file.originalname)

    const result = await parseGuidelinesZip(req.file.buffer)

    console.log(`✅ Parsed ${result.projects.length} folder group(s) from ZIP`)

    const saveToDb = req.body.save_to_db === 'true'
    let createdProjects = []
    let updatedProjects = []

    if (saveToDb) {
      console.log('💾 Matching parsed content to departments/projects...')

      let allDepartments = await getAllDepartments()
      let allProjects = await getAllProjects()

      for (const parsed of result.projects) {
        let department = findByFuzzyName(allDepartments, parsed.department)
        if (!department) {
          const deptId = uuidv4()
          department = {
            id: deptId,
            name: parsed.department,
            description: `Department for ${parsed.department}`,
            created_at: new Date().toISOString(),
          }
          await indexDocument(config.indices.departments, deptId, department)
          allDepartments.push(department)
          console.log(`✅ Created department: "${department.name}"`)
        }

        const deptProjects = allProjects.filter(p => p.department_id === department.id)
        let project = findByFuzzyName(deptProjects, parsed.requestType)

        const categoryTag = (parsed.category || 'general').toLowerCase()
        const taggedImages = (parsed.reference_images || []).map(img => ({
          ...img,
          category: categoryTag,
        }))
        const taggedFiles = parsed.attached_files || []

        if (project) {
          const mergedReferenceImages = [...(project.reference_images || []), ...taggedImages]
          const mergedAttachedFiles = [...(project.attached_files || []), ...taggedFiles]
          const mergedCriteria = parsed.reference_criteria
            ? `${project.reference_criteria || ''}${project.reference_criteria ? '\n\n' : ''}${parsed.reference_criteria}`
            : project.reference_criteria

          const updated = await updateProject(project.id, {
            ...project,
            reference_images: mergedReferenceImages,
            attached_files: mergedAttachedFiles,
            reference_criteria: mergedCriteria,
            output_type: 'image',
          })

          updatedProjects.push(updated)
          const idx = allProjects.findIndex(p => p.id === project.id)
          allProjects[idx] = updated
          console.log(`🔄 Merged "${categoryTag}" content into existing project: "${project.name}" (${department.name})`)
        } else {
          const projectId = uuidv4()
          const now = new Date().toISOString()

          const newProject = {
            id: projectId,
            name: parsed.requestType || parsed.name || 'Unnamed Project',
            description: parsed.description || `${parsed.requestType} projects`,
            department_id: department.id,
            output_type: 'image',
            trigger_keywords: (parsed.requestType || '').toLowerCase(),
            system_prompt: parsed.system_prompt || '',
            reference_criteria: parsed.reference_criteria || '',
            reference_images: taggedImages,
            attached_files: taggedFiles,
            image_model: 'flux-schnell',
            created_by: req.user?.id || 'system',
            created_at: now,
            updated_at: now,
          }

          await indexDocument(config.indices.projects, projectId, newProject)
          allProjects.push(newProject)
          createdProjects.push(newProject)
          console.log(`✅ Created project: "${newProject.name}" (${department.name})`)
        }
      }

      console.log(`✅ ZIP import complete: ${createdProjects.length} created, ${updatedProjects.length} updated`)
    }

    return res.json({
      message: saveToDb
        ? `ZIP parsed: ${createdProjects.length} project(s) created, ${updatedProjects.length} project(s) updated`
        : 'ZIP parsed successfully (preview mode)',
      data: result,
      created: saveToDb ? createdProjects : [],
      updated: saveToDb ? updatedProjects : [],
    })

  } catch (err) {
    console.error('ZIP parsing error:', err)
    return res.status(500).json({ error: err.message })
  }
}

function normalizeName(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function findByFuzzyName(list, targetName) {
  const target = normalizeName(targetName)
  if (!target) return null

  let match = list.find(item => normalizeName(item.name) === target)
  if (match) return match

  match = list.find(item => {
    const itemName = normalizeName(item.name)
    return itemName.includes(target) || target.includes(itemName)
  })
  if (match) return match

  const targetWords = new Set(target.split(' ').filter(w => w.length > 2))
  let best = null
  let bestScore = 0
  for (const item of list) {
    const itemWords = normalizeName(item.name).split(' ').filter(w => w.length > 2)
    const overlap = itemWords.filter(w => targetWords.has(w)).length
    if (overlap > bestScore) {
      bestScore = overlap
      best = item
    }
  }
  return bestScore > 0 ? best : null
}

// ============================================================
// ULTRA LIGHT - listProjects returns minimal data for fast loading
// ============================================================
export async function listProjects(req, res) {
  try {
    console.log('🔍 listProjects called (ultra-light)')
    const { role, department_id, id: userId } = req.user
    console.log('📋 User info:', { role, department_id, userId })
    
    let projects = []
    
    if (role === 'admin') {
      projects = await getAllProjects()
      console.log(`📋 Admin found ${projects.length} total projects`)
    } else if (role === 'dept_user') {
      if (!department_id) {
        console.log('⚠️ Department user has no department_id')
        return res.status(400).json({ error: 'Department user has no department assigned' })
      }
      projects = await getProjectsByDepartment(department_id)
      console.log(`📋 Department user found ${projects.length} projects`)
    } else {
      projects = []
      console.log('📋 Requester sees no projects')
    }
    
    // ============================================================
    // ULTRA LIGHT - ONLY WHAT THE LIST NEEDS
    // ============================================================
    const ultraLight = projects.map(p => ({
      id: p.id,
      name: p.name || 'Unnamed',
      description: (p.description || '').substring(0, 100), // Truncate description
      department_id: p.department_id || '',
      output_type: p.output_type || 'image',
      image_model: p.image_model || 'flux-schnell',
      created_at: p.created_at,
      updated_at: p.updated_at,
      reference_count: Array.isArray(p.reference_images) ? p.reference_images.length : 0,
      attached_count: Array.isArray(p.attached_files) ? p.attached_files.length : 0,
      has_base64: Array.isArray(p.reference_images) && p.reference_images.some(img => 
        img.url && img.url.startsWith('data:image')
      ),
    }))
    
    const responseSize = JSON.stringify(ultraLight).length
    console.log(`📋 Returning ${ultraLight.length} ultra-light projects (${(responseSize / 1024).toFixed(2)} KB)`)
    
    // Add cache headers to prevent browser caching
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')
    
    return res.json({ projects: ultraLight })
  } catch (err) {
    console.error('❌ listProjects error:', err.message)
    console.error('❌ Stack:', err.stack)
    return res.status(500).json({ error: err.message })
  }
}

// ============================================================
// getProject - Returns FULL data for editing
// ============================================================
export async function getProject(req, res) {
  try {
    console.log('🔍 getProject called for:', req.params.id)
    const project = await getProjectById(req.params.id)
    if (!project) {
      console.log('⚠️ Project not found:', req.params.id)
      return res.status(404).json({ error: 'Project not found' })
    }
    
    const { role, department_id } = req.user
    if (role === 'dept_user' && project.department_id !== department_id) {
      console.log('⚠️ Access denied for department user')
      return res.status(403).json({ error: 'Access denied' })
    }
    
    const responseSize = JSON.stringify(project).length
    console.log(`📋 Returning full project (${(responseSize / 1024).toFixed(2)} KB)`)
    
    return res.json({ project })
  } catch (err) {
    console.error('❌ Get project error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}

export async function createProjectHandler(req, res) {
  try {
    const data = { ...req.body }
    const { role, department_id, id: userId } = req.user
    
    if (role === 'dept_user') {
      data.department_id = department_id
    }
    
    if (!data.reference_images || typeof data.reference_images !== 'object' || Array.isArray(data.reference_images) === false) {
      data.reference_images = []
    }
    if (!data.attached_files || typeof data.attached_files !== 'object' || Array.isArray(data.attached_files) === false) {
      data.attached_files = []
    }
    
    const project = await createProject(data, userId)
    return res.status(201).json({ project })
  } catch (err) {
    console.error('Create project error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}

export async function updateProjectHandler(req, res) {
  try {
    const data = { ...req.body }
    const { role, department_id } = req.user
    
    const existingProject = await getProjectById(req.params.id)
    if (!existingProject) {
      return res.status(404).json({ error: 'Project not found' })
    }
    
    if (role === 'dept_user' && existingProject.department_id !== department_id) {
      return res.status(403).json({ error: 'Access denied' })
    }
    
    if (role === 'dept_user' && data.department_id && data.department_id !== department_id) {
      delete data.department_id
    }
    
    if (data.reference_images !== undefined && !Array.isArray(data.reference_images)) {
      data.reference_images = []
    }
    if (data.attached_files !== undefined && !Array.isArray(data.attached_files)) {
      data.attached_files = []
    }
    
    const project = await updateProject(req.params.id, data)
    return res.json({ project })
  } catch (err) {
    console.error('Update project error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}

export async function deleteProjectHandler(req, res) {
  try {
    const { role, department_id } = req.user
    const projectId = req.params.id
    
    console.log('🗑️ Delete request for project:', projectId)
    
    const existingProject = await getProjectById(projectId)
    if (!existingProject) {
      return res.status(404).json({ error: 'Project not found' })
    }
    
    if (role === 'dept_user' && existingProject.department_id !== department_id) {
      return res.status(403).json({ error: 'Access denied' })
    }
    
    await deleteProject(projectId)
    console.log('✅ Project deleted:', projectId)
    
    // Also delete related outputs
    const outputs = await getOutputsByProject(projectId)
    for (const output of outputs) {
      await deleteDocument(config.indices.outputs, output.id)
    }
    console.log(`✅ Deleted ${outputs.length} associated outputs`)
    
    return res.json({ message: 'Project deleted successfully' })
  } catch (err) {
    console.error('Delete project error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}

// ============================================================
// Create Department with Credentials (STORES PLAIN PASSWORD)
// ============================================================
export async function createDepartmentHandler(req, res) {
  try {
    const { name, description, email, password } = req.body
    
    console.log('📝 Creating department:', { name, email, password: !!password })
    
    if (!name?.trim() || !email?.trim() || !password?.trim()) {
      return res.status(400).json({ 
        error: 'Department name, email, and password are required' 
      })
    }

    const existingUser = await searchDocuments(config.indices.users, {
      query: { term: { email: email.toLowerCase() } },
    })
    
    if (existingUser.length > 0) {
      return res.status(400).json({ error: 'Email already in use' })
    }

    const department = await createDepartment({ 
      name: name.trim(), 
      description: description?.trim() || `${name.trim()} Department` 
    })
    
    const hashedPassword = await bcrypt.hash(password, 10)
    const userId = `user-${department.id}`
    
    const user = {
      id: userId,
      email: email.toLowerCase(),
      password_hash: hashedPassword,
      plain_password: password,
      name: `${name.trim()} Department`,
      role: 'dept_user',
      department_id: department.id,
      created_at: new Date().toISOString(),
    }
    
    await indexDocument(config.indices.users, userId, user)
    
    console.log(`✅ Created department "${name}" with user ${email}`)
    
    return res.status(201).json({ 
      department,
      user: {
        email: user.email,
        name: user.name,
        role: user.role,
        department_id: user.department_id,
        plain_password: user.plain_password
      }
    })
  } catch (err) {
    console.error('Create department error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}

// ============================================================
// Update Department with Credentials (UPDATES PLAIN PASSWORD)
// ============================================================
export async function updateDepartmentHandler(req, res) {
  try {
    const { id } = req.params
    const { name, description, email, password } = req.body
    
    console.log('📝 Updating department:', { id, name, email, password: !!password })
    
    const department = await updateDepartment(id, { 
      name: name?.trim(), 
      description: description?.trim() 
    })
    
    let updatedUser = null
    if (email || password) {
      const users = await searchDocuments(config.indices.users, {
        query: { term: { department_id: id } },
      })
      
      if (users.length > 0) {
        const user = users[0]
        const updates = {}
        
        if (email && email.trim() && email !== user.email) {
          const existingUser = await searchDocuments(config.indices.users, {
            query: { term: { email: email.toLowerCase() } },
          })
          
          if (existingUser.length > 0 && existingUser[0].id !== user.id) {
            return res.status(400).json({ error: 'Email already in use' })
          }
          updates.email = email.toLowerCase()
          console.log('📧 Updating email to:', email)
        }
        
        if (password && password.trim()) {
          if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' })
          }
          updates.password_hash = await bcrypt.hash(password, 10)
          updates.plain_password = password
          console.log('🔑 Updating password')
        }
        
        if (Object.keys(updates).length > 0) {
          await updateDocument(config.indices.users, user.id, updates)
          console.log('✅ User credentials updated')
          
          const updatedUsers = await searchDocuments(config.indices.users, {
            query: { term: { department_id: id } },
          })
          if (updatedUsers.length > 0) {
            updatedUser = updatedUsers[0]
          }
        } else {
          updatedUser = user
        }
      } else if (email && password) {
        console.log('🆕 Creating new user for department')
        const hashedPassword = await bcrypt.hash(password, 10)
        const userId = `user-${id}`
        
        const newUser = {
          id: userId,
          email: email.toLowerCase(),
          password_hash: hashedPassword,
          plain_password: password,
          name: `${name?.trim() || 'Department'} User`,
          role: 'dept_user',
          department_id: id,
          created_at: new Date().toISOString(),
        }
        
        await indexDocument(config.indices.users, userId, newUser)
        updatedUser = newUser
        console.log('✅ New user created with credentials')
      }
    }
    
    return res.json({ 
      department,
      user: updatedUser ? {
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role,
        department_id: updatedUser.department_id,
        plain_password: updatedUser.plain_password
      } : null
    })
  } catch (err) {
    console.error('Update department error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}

// ============================================================
// Delete Department (with cleanup)
// ============================================================
export async function deleteDepartmentHandler(req, res) {
  try {
    const { id } = req.params
    
    console.log('🗑️ Deleting department:', id)
    
    const projects = await getProjectsByDepartment(id)
    
    for (const project of projects) {
      await deleteProject(project.id)
    }
    
    const users = await searchDocuments(config.indices.users, {
      query: { term: { department_id: id } },
    })
    
    for (const user of users) {
      await deleteDocument(config.indices.users, user.id)
    }
    
    await deleteDepartment(id)
    
    console.log(`✅ Deleted department ${id}`)
    
    return res.json({ message: 'Department deleted successfully' })
  } catch (err) {
    console.error('Delete department error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}

export async function listDepartmentUsers(req, res) {
  try {
    const users = await searchDocuments(config.indices.users, {
      query: { term: { role: 'dept_user' } },
      size: 100,
    })
    
    const departments = await getAllDepartments()
    const deptMap = {}
    departments.forEach(d => { deptMap[d.id] = d.name })
    
    const usersWithDepts = users.map(u => ({
      ...u,
      department_name: deptMap[u.department_id] || 'Unknown'
    }))
    
    return res.json({ users: usersWithDepts })
  } catch (err) {
    console.error('List department users error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}

export async function getDepartmentUser(req, res) {
  try {
    const { id } = req.params
    
    console.log('🔍 Getting user for department:', id)
    
    const department = await getDocument(config.indices.departments, id)
    if (!department) {
      console.log('⚠️ Department not found:', id)
      return res.status(404).json({ error: 'Department not found' })
    }
    
    const users = await searchDocuments(config.indices.users, {
      query: { term: { department_id: id } },
    })
    
    if (users.length === 0) {
      console.log('⚠️ No user found for department:', id)
      return res.json({ user: null })
    }
    
    const user = users[0]
    const { password_hash, ...userWithoutHash } = user
    
    console.log('✅ Found user:', user.email)
    console.log('   plain_password exists:', !!user.plain_password)
    
    return res.json({ user: userWithoutHash })
  } catch (err) {
    console.error('Get department user error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}

export async function listDepartments(req, res) {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' })
    }
    const departments = await getAllDepartments()
    console.log(`📋 Found ${departments.length} departments`)
    return res.json({ departments })
  } catch (err) {
    console.error('List departments error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}

export async function listOutputs(req, res) {
  try {
    const { role, department_id } = req.user
    const projectId = req.query.project_id
    
    console.log('📋 Listing outputs for role:', role, 'department:', department_id, 'projectId:', projectId)
    
    let outputs = []
    
    try {
      if (projectId) {
        outputs = await getOutputsByProject(projectId)
      } else if (role === 'admin') {
        outputs = await getAllOutputs()
      } else {
        if (!department_id) {
          return res.status(400).json({ error: 'Department user has no department assigned' })
        }
        outputs = await getOutputsByDepartment(department_id)
      }
    } catch (err) {
      console.error('Error fetching outputs:', err.message)
      outputs = []
    }
    
    if (!outputs || !Array.isArray(outputs)) {
      outputs = []
    }
    
    return res.json({ outputs })
  } catch (err) {
    console.error('List outputs error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}

export async function analyzeReferenceImage(req, res) {
  const { image } = req.body
  if (!image) {
    return res.status(400).json({ error: 'No image provided' })
  }

  try {
    const openai = new OpenAI({
      apiKey: config.openai.apiKey,
    })
    
    const response = await openai.chat.completions.create({
      model: config.openai.visionModel || 'gpt-4o',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this image and provide a detailed style description including:
              1. Overall aesthetic and mood
              2. Color palette (dominant colors)
              3. Lighting style
              4. Composition
              5. Level of detail
              6. Key visual elements that define the style
              
              Format as a concise style guide that can be used to generate similar images.`
            },
            {
              type: 'image_url',
              image_url: {
                url: image,
                detail: 'low'
              },
            },
          ],
        },
      ],
    })

    const analysis = response.choices[0].message.content
    return res.json({ analysis })
  } catch (err) {
    console.error('Image analysis failed:', err.message)
    return res.json({ 
      analysis: 'Reference image for style guidance. Use its colors, composition, and mood as inspiration.' 
    })
  }
}

export async function exportOutput(req, res) {
  const { id } = req.params
  const { format = 'json' } = req.query
  
  try {
    const output = await getDocument(config.indices.outputs, id)
    
    if (!output) {
      return res.status(404).json({ error: 'Output not found' })
    }
    
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Content-Disposition', `attachment; filename=output-${id}.json`)
      return res.json(output)
    } 
    else if (format === 'txt' || format === 'text') {
      res.setHeader('Content-Type', 'text/plain')
      res.setHeader('Content-Disposition', `attachment; filename=output-${id}.txt`)
      return res.send(output.content || 'No content')
    } 
    else if (format === 'png' || format === 'jpg' || format === 'jpeg' || format === 'webp') {
      if (output.output_type === 'image' && output.content) {
        if (output.content.startsWith('http')) {
          return res.redirect(output.content)
        }
        if (output.content.startsWith('data:image')) {
          const base64Data = output.content.replace(/^data:image\/\w+;base64,/, '')
          const imageBuffer = Buffer.from(base64Data, 'base64')
          res.setHeader('Content-Type', `image/${format}`)
          res.setHeader('Content-Disposition', `attachment; filename=output-${id}.${format}`)
          return res.send(imageBuffer)
        }
        return res.status(400).json({ error: 'Invalid image format' })
      }
      return res.status(400).json({ error: 'Output is not an image' })
    }
    else if (format === 'md') {
      const markdown = `# Output Export\n\n**Project ID:** ${output.project_id}\n**Type:** ${output.output_type}\n**Status:** ${output.status}\n**Created:** ${output.created_at}\n\n## Original Request\n${output.original_request}\n\n## Output Content\n${output.content}\n`
      res.setHeader('Content-Type', 'text/markdown')
      res.setHeader('Content-Disposition', `attachment; filename=output-${id}.md`)
      return res.send(markdown)
    }
    
    return res.status(400).json({ error: 'Invalid format. Supported formats: json, txt, md, png, jpg' })
    
  } catch (err) {
    console.error('Export error:', err.message)
    return res.status(500).json({ error: 'Failed to export output' })
  }
}