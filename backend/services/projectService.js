import { v4 as uuidv4 } from 'uuid'
import {
  indexDocument,
  getDocument,
  updateDocument,
  deleteDocument,
  searchDocuments,
} from './databaseService.js'
import { config } from '../config/index.js'

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
  
  // Ensure arrays are properly initialized - FIXED
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
  return project
}

export async function updateProject(id, data) {
  const now = new Date().toISOString()
  
  // Ensure arrays are properly initialized - FIXED
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
  return getProjectById(id)
}

export async function deleteProject(id) {
  return deleteDocument(config.indices.projects, id)
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
  return getDocument(config.indices.departments, id)
}

export async function deleteDepartment(id) {
  return deleteDocument(config.indices.departments, id)
}