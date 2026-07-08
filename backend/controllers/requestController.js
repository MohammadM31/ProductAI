import { v4 as uuidv4 } from 'uuid'
import { transcribeAudio } from '../services/deepgramService.js'//import { transcribeAudio } from '../services/whisperService.js'
import {
  mapRequestToProject,
  generateOutput,
  iterateOutput,
  saveOutput,
} from '../services/aiService.js'
import { getProjectById } from '../services/projectService.js'
import {
  indexDocument,
  searchDocuments,
  updateDocument,
  getDocument,
} from '../services/databaseService.js'
import { config } from '../config/index.js'

export async function processVoice(req, res) {
  const audioFile = req.file
  if (!audioFile) {
    return res.status(400).json({ error: 'No audio file provided' })
  }

  const sessionId = req.body.session_id || uuidv4()

  const transcription = await transcribeAudio(audioFile.buffer, audioFile.mimetype)
  if (!transcription?.trim()) {
    return res.status(400).json({ error: 'Could not transcribe audio. Please try again.' })
  }

  return processRequest(res, transcription, sessionId, req.body.project_id, req.user)
}

export async function processText(req, res) {
  const { text, session_id, project_id } = req.body
  if (!text?.trim()) {
    return res.status(400).json({ error: 'No text provided' })
  }
  const sessionId = session_id || uuidv4()
  return processRequest(res, text, sessionId, project_id, req.user)
}

// ============================================================
// CHANGED: Process Request with Department Info
// ============================================================
async function processRequest(res, userText, sessionId, hintProjectId, user) {
  let project = null
  
  // Check if project hint provided
  if (hintProjectId) {
    project = await getProjectById(hintProjectId)
    if (project) {
      console.log(`📌 Using hinted project: "${project.name}"`)
    }
  }
  
  // If no hint or hint invalid, use AI mapping
  if (!project) {
    console.log(`🤖 Using AI to map request: "${userText}"`)
    project = await mapRequestToProject(userText)
  }

  if (!project) {
    return res.status(422).json({ 
      error: 'No matching project found. Please try rephrasing your request or contact your administrator.' 
    })
  }

  // ============================================================
  // NEW: Get Department Info for Response
  // ============================================================
  let departmentName = 'Unassigned'
  let department = null
  try {
    department = await getDocument(config.indices.departments, project.department_id)
    if (department) {
      departmentName = department.name
    }
  } catch (err) {
    console.warn('Could not fetch department:', err.message)
  }

  console.log(`📋 Routing to: "${project.name}"`)
  console.log(`   Department: ${departmentName}`)
  console.log(`   Output Type: ${project.output_type}`)

  // Generate the output
  const result = await generateOutput(userText, project)

  // Save the output with requester info
  const saved = await saveOutput({
    sessionId,
    projectId: project.id,
    departmentId: project.department_id,
    outputType: result.output_type,
    content: result.content,
    originalRequest: userText,
    requesterId: user?.id,
    requesterName: user?.name,
    requesterEmail: user?.email,
  })

  // ============================================================
  // CHANGED: Return with Department Info
  // ============================================================
  return res.json({
    session_id: sessionId,
    output_id: saved.id,
    project: { 
      id: project.id, 
      name: project.name, 
      output_type: project.output_type,
      department: departmentName,
      department_id: project.department_id
    },
    output_type: result.output_type,
    content: result.content,
    dalle_prompt: result.dalle_prompt,
    model_used: result.model_used,
  })
}

export async function iterateRequest(req, res) {
  const { output_id, feedback, session_id } = req.body
  if (!output_id || !feedback?.trim()) {
    return res.status(400).json({ error: 'output_id and feedback are required' })
  }

  const outputs = await searchDocuments(config.indices.outputs, {
    query: { term: { id: output_id } },
  })
  const existing = outputs[0]
  if (!existing) {
    return res.status(404).json({ error: 'Output not found' })
  }

  // Check if the user owns this output or is admin/dept_user
  const user = req.user
  if (user.role === 'requester' && existing.requester_id !== user.id) {
    return res.status(403).json({ error: 'You can only iterate on your own outputs' })
  }

  const project = await getProjectById(existing.project_id)
  if (!project) {
    return res.status(404).json({ error: 'Project not found' })
  }

  const result = await iterateOutput(
    existing.original_request,
    feedback,
    existing.content,
    project
  )

  const saved = await saveOutput({
    sessionId: session_id || existing.session_id,
    projectId: project.id,
    departmentId: project.department_id,
    outputType: result.output_type,
    content: result.content,
    originalRequest: `${existing.original_request} [Revision: ${feedback}]`,
    requesterId: existing.requester_id,
    requesterName: existing.requester_name,
    requesterEmail: existing.requester_email,
  })

  return res.json({
    output_id: saved.id,
    project: { 
      id: project.id, 
      name: project.name, 
      output_type: project.output_type 
    },
    output_type: result.output_type,
    content: result.content,
    dalle_prompt: result.dalle_prompt,
    model_used: result.model_used,
  })
}

export async function confirmOutput(req, res) {
  const { output_id } = req.body
  if (!output_id) return res.status(400).json({ error: 'output_id required' })

  const user = req.user
  console.log('✅ Confirming output:', output_id, 'by user:', user.id, user.email)

  let existing = null
  try {
    const outputs = await searchDocuments(config.indices.outputs, {
      query: { term: { id: output_id } },
    })
    existing = outputs[0]
    console.log('📄 Existing output:', existing)
  } catch (err) {
    console.error('Error checking existing output:', err.message)
  }

  if (!existing) {
    console.log('⚠️ Output not found, cannot update')
    return res.status(404).json({ error: 'Output not found' })
  }

  const updateData = {
    status: 'confirmed',
    confirmed_at: new Date().toISOString(),
    confirmed_by: user.id,
    confirmed_by_name: user.name,
    confirmed_by_email: user.email,
  }

  if (!existing.requester_id) {
    updateData.requester_id = user.id
    updateData.requester_name = user.name
    updateData.requester_email = user.email
    console.log('🔄 Setting requester info from confirming user:', user.email)
  } else {
    console.log('✅ Requester already set:', existing.requester_id, existing.requester_name)
  }

  await updateDocument(config.indices.outputs, output_id, updateData)
  
  const updated = await searchDocuments(config.indices.outputs, {
    query: { term: { id: output_id } },
  })
  console.log('📄 Updated output:', updated[0])

  return res.json({ message: 'Output confirmed and sent to department.' })
}

export async function previewProjectMapping(req, res) {
  const { text } = req.body
  if (!text?.trim()) {
    return res.status(400).json({ error: 'No text provided' })
  }

  const project = await mapRequestToProject(text)
  if (!project) {
    return res.status(404).json({ error: 'No matching project found' })
  }

  // Get department info
  let departmentName = 'Unassigned'
  try {
    const department = await getDocument(config.indices.departments, project.department_id)
    if (department) {
      departmentName = department.name
    }
  } catch (err) {
    // Department not found, continue
  }

  return res.json({
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      department: departmentName,
      department_id: project.department_id,
      system_prompt: project.system_prompt,
      reference_criteria: project.reference_criteria,
      reference_images: (project.reference_images || []).map(img => ({
        name: img.name,
        url: img.url,
        description: img.description,
      })),
      attached_files: (project.attached_files || []).map(file => ({
        name: file.name,
        type: file.type,
      })),
    }
  })
}

export async function getMyOutputs(req, res) {
  const user = req.user
  
  try {
    console.log('🔍 Getting outputs for user:', user.id, user.email, user.role)
    
    const allOutputs = await searchDocuments(config.indices.outputs, {
      query: { match_all: {} },
      sort: [{ created_at: { order: 'desc' } }],
      size: 100,
    })
    
    console.log(`📊 Total outputs in database: ${allOutputs.length}`)
    
    const myOutputs = allOutputs.filter(out => {
      const isMine = out.requester_id === user.id
      const isConfirmed = out.status === 'confirmed' || out.status === 'sent_to_dept'
      if (out.requester_id) {
        console.log(`  - Output ${out.id}: requester_id=${out.requester_id}, isMine=${isMine}, status=${out.status}`)
      }
      return isMine && isConfirmed
    })
    
    console.log(`📋 Found ${myOutputs.length} confirmed outputs for user ${user.email}`)
    
    return res.json({ outputs: myOutputs })
  } catch (err) {
    console.error('Error fetching user outputs:', err.message)
    return res.status(500).json({ error: 'Failed to fetch your outputs' })
  }
}

// Debug routes (keep as is)
export async function debugImageContent(req, res) {
  const { output_id } = req.params
  
  try {
    const outputs = await searchDocuments(config.indices.outputs, {
      query: { term: { id: output_id } },
    })
    const output = outputs[0]
    
    if (!output) {
      return res.status(404).json({ error: 'Output not found' })
    }
    
    return res.json({
      id: output.id,
      output_type: output.output_type,
      content: output.content,
      content_type: typeof output.content,
      content_preview: output.content?.substring(0, 100) + '...',
      status: output.status,
      requester_id: output.requester_id,
      requester_name: output.requester_name,
      created_at: output.created_at,
      full_output: output
    })
  } catch (err) {
    console.error('Debug error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}

export async function debugAllOutputs(req, res) {
  const user = req.user
  
  try {
    if (user.role !== 'admin' && user.role !== 'dept_user') {
      return res.status(403).json({ error: 'Not authorized' })
    }
    
    const outputs = await searchDocuments(config.indices.outputs, {
      query: { match_all: {} },
      sort: [{ created_at: { order: 'desc' } }],
      size: 50,
    })
    
    return res.json({ 
      total: outputs.length,
      current_user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      },
      outputs: outputs.map(o => ({
        id: o.id,
        requester_id: o.requester_id,
        requester_email: o.requester_email,
        requester_name: o.requester_name,
        output_type: o.output_type,
        content_preview: o.content?.substring(0, 80) + '...',
        status: o.status,
        created_at: o.created_at,
        original_request: o.original_request?.substring(0, 50) + '...'
      }))
    })
  } catch (err) {
    console.error('Debug error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}