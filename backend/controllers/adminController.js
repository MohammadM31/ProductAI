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
import { getOutputsByProject, getOutputsByDepartment } from '../services/aiService.js'
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
    fileSize: 100 * 1024 * 1024, // 100MB
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
    
    console.log(`✅ Parsed ${result.projects.length} projects from ZIP`)
    
    return res.json({
      message: 'ZIP parsed successfully',
      data: result
    })
    
  } catch (err) {
    console.error('ZIP parsing error:', err)
    return res.status(500).json({ error: err.message })
  }
}



export async function listProjects(req, res) {
  try {
    const { role, department_id, id: userId } = req.user
    console.log('📋 Listing projects for user:', { role, department_id, userId })
    
    let projects = []
    
    if (role === 'admin') {
      // Admin sees ALL projects
      projects = await getAllProjects()
      console.log(`📋 Admin found ${projects.length} total projects`)
    } else if (role === 'dept_user') {
      // Department user sees ONLY their department's projects
      if (!department_id) {
        console.log('⚠️ Department user has no department_id')
        return res.status(400).json({ error: 'Department user has no department assigned' })
      }
      projects = await getProjectsByDepartment(department_id)
      console.log(`📋 Department user found ${projects.length} projects for department ${department_id}`)
    } else {
      // Requester sees only their own projects (or none)
      projects = []
      console.log('📋 Requester sees no projects')
    }
    
    return res.json({ projects })
  } catch (err) {
    console.error('List projects error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}

export async function getProject(req, res) {
  try {
    const project = await getProjectById(req.params.id)
    if (!project) return res.status(404).json({ error: 'Project not found' })
    
    // Check if user has access to this project
    const { role, department_id } = req.user
    if (role === 'dept_user' && project.department_id !== department_id) {
      return res.status(403).json({ error: 'Access denied' })
    }
    
    return res.json({ project })
  } catch (err) {
    console.error('Get project error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}

export async function createProjectHandler(req, res) {
  try {
    const data = { ...req.body }
    const { role, department_id, id: userId } = req.user
    
    // If department user, force department_id to their department
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
    
    // Get existing project to check permissions
    const existingProject = await getProjectById(req.params.id)
    if (!existingProject) {
      return res.status(404).json({ error: 'Project not found' })
    }
    
    // Department users can only update their own department's projects
    if (role === 'dept_user' && existingProject.department_id !== department_id) {
      return res.status(403).json({ error: 'Access denied' })
    }
    
    // Department users cannot change department_id
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
    
    // Get existing project to check permissions
    const existingProject = await getProjectById(req.params.id)
    if (!existingProject) {
      return res.status(404).json({ error: 'Project not found' })
    }
    
    // Department users can only delete their own department's projects
    if (role === 'dept_user' && existingProject.department_id !== department_id) {
      return res.status(403).json({ error: 'Access denied' })
    }
    
    await deleteProject(req.params.id)
    return res.json({ message: 'Project deleted' })
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
    
    console.log('📝 Creating department:', { name, email })
    
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
    
    console.log('📝 Updating department:', { id, name })
    
    const department = await updateDepartment(id, { 
      name: name?.trim(), 
      description: description?.trim() 
    })
    
    if (email || password) {
      const users = await searchDocuments(config.indices.users, {
        query: { term: { department_id: id } },
      })
      
      if (users.length > 0) {
        const user = users[0]
        const updates = {}
        
        if (email && email !== user.email) {
          const existingUser = await searchDocuments(config.indices.users, {
            query: { term: { email: email.toLowerCase() } },
          })
          
          if (existingUser.length > 0 && existingUser[0].id !== user.id) {
            return res.status(400).json({ error: 'Email already in use' })
          }
          updates.email = email.toLowerCase()
        }
        
        if (password) {
          updates.password_hash = await bcrypt.hash(password, 10)
          updates.plain_password = password
          console.log('🔑 Updating password')
        }
        
        if (Object.keys(updates).length > 0) {
          await updateDocument(config.indices.users, user.id, updates)
          console.log('✅ User credentials updated')
        }
      }
    }
    
    return res.json({ department })
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

// ============================================================
// List all Department Users
// ============================================================
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

// ============================================================
// Get Department User (RETURNS PLAIN PASSWORD FOR ADMIN)
// ============================================================
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

// ============================================================
// List Departments
// ============================================================
export async function listDepartments(req, res) {
  try {
    // Only admin can list all departments
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

// ============================================================
// List Outputs (with department filtering)
// ============================================================
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
        outputs = await getOutputsByDepartment(undefined)
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

// ============================================================
// Analyze Reference Image
// ============================================================
export async function analyzeReferenceImage(req, res) {
  const { image } = req.body
  if (!image) {
    return res.status(400).json({ error: 'No image provided' })
  }

  try {
    const openai = new OpenAI({ apiKey: config.openai.apiKey })
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4-vision-preview',
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
    return res.status(500).json({ error: 'Failed to analyze image' })
  }
}

// ============================================================
// Export Output
// ============================================================
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