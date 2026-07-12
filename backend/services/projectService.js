import { v4 as uuidv4 } from 'uuid'
import {
  indexDocument,
  getDocument,
  updateDocument,
  deleteDocument,
  searchDocuments,
} from './databaseService.js'
import { config } from '../config/index.js'
import { cache } from './cacheService.js'

export async function getAllProjects() {
  return searchDocuments(config.indices.projects, {
    query: { match_all: {} },
    sort: [{ created_at: { order: 'desc' } }],
  })
}

export async function getProjectsByDepartment(departmentId) {
  return searchDocuments(config.indices.projects, {
    query: { term: { department_id: departmentId } },
    sort: [{ created_at: { order: 'desc' } }],
  })
}

export async function getProjectById(id) {
  return getDocument(config.indices.projects, id)
}

export async function createProject(data, createdBy) {
  const id = uuidv4()
  const now = new Date().toISOString()
  
  // Ensure arrays are properly initialized
  const project = {
    id,
    name: data.name || '',
    description: data.description || '',
    department_id: data.department_id || '',
    output_type: data.output_type || 'image',
    trigger_keywords: data.trigger_keywords || '',
    system_prompt: data.system_prompt || '',
    reference_criteria: data.reference_criteria || '',
    reference_images: Array.isArray(data.reference_images) ? data.reference_images : [],
    attached_files: Array.isArray(data.attached_files) ? data.attached_files : [],
    image_model: data.image_model || 'flux-schnell',
    created_by: createdBy,
    created_at: now,
    updated_at: now,
  }
  
  await indexDocument(config.indices.projects, id, project)
  
  // Clear cache so new project is picked up
  cache.clearProjects()
  console.log(`✅ Created project: "${project.name}"`)
  
  return project
}

export async function updateProject(id, data) {
  const now = new Date().toISOString()
  
  // Ensure arrays are properly initialized
  const updateData = {
    name: data.name,
    description: data.description,
    department_id: data.department_id,
    output_type: data.output_type,
    trigger_keywords: data.trigger_keywords,
    system_prompt: data.system_prompt,
    reference_criteria: data.reference_criteria,
    reference_images: Array.isArray(data.reference_images) ? data.reference_images : [],
    attached_files: Array.isArray(data.attached_files) ? data.attached_files : [],
    image_model: data.image_model || 'flux-schnell',
    updated_at: now,
  }
  
  // Remove undefined values
  Object.keys(updateData).forEach(key => {
    if (updateData[key] === undefined) {
      delete updateData[key]
    }
  })
  
  await updateDocument(config.indices.projects, id, updateData)
  
  // Clear cache so updated project is picked up
  cache.clearProjects()
  console.log(`✅ Updated project: ${id}`)
  
  return getProjectById(id)
}

export async function deleteProject(id) {
  // Get project name for logging
  const project = await getProjectById(id)
  const name = project?.name || id
  
  await deleteDocument(config.indices.projects, id)
  
  // Clear cache so deleted project is removed
  cache.clearProjects()
  console.log(`🗑️ Deleted project: "${name}"`)
  
  return { success: true, id, name }
}

export async function getAllDepartments() {
  return searchDocuments(config.indices.departments, {
    query: { match_all: {} },
    sort: [{ created_at: { order: 'asc' } }],
  })
}

export async function createDepartment(data) {
  const id = uuidv4()
  const dept = { id, ...data, created_at: new Date().toISOString() }
  await indexDocument(config.indices.departments, id, dept)
  
  // Clear departments cache
  cache.clearDepartments()
  console.log(`✅ Created department: "${dept.name}"`)
  
  return dept
}

export async function updateDepartment(id, data) {
  const now = new Date().toISOString()
  const updateData = {
    name: data.name,
    description: data.description,
    updated_at: now,
  }
  
  // Remove undefined values
  Object.keys(updateData).forEach(key => {
    if (updateData[key] === undefined) {
      delete updateData[key]
    }
  })
  
  await updateDocument(config.indices.departments, id, updateData)
  
  // Clear departments cache
  cache.clearDepartments()
  console.log(`✅ Updated department: ${id}`)
  
  return getDocument(config.indices.departments, id)
}

export async function deleteDepartment(id) {
  // Get department name for logging
  const dept = await getDocument(config.indices.departments, id)
  const name = dept?.name || id
  
  await deleteDocument(config.indices.departments, id)
  
  // Clear departments cache
  cache.clearDepartments()
  console.log(`🗑️ Deleted department: "${name}"`)
  
  return { success: true, id, name }
}