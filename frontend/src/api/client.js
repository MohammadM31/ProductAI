import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 120000,
})

api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('auth_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

api.interceptors.response.use(
  response => response,
  error => {
    console.error('API Error:', error.response?.status, error.response?.data)
    return Promise.reject(error)
  }
)

export const authApi = {
  login: (email, password) =>
    api.post('/api/auth/login', { email, password }).then(r => r.data),
  me: () => api.get('/api/auth/me').then(r => r.data),
}

export const requestApi = {
  sendVoice: (formData) =>
    api.post('/api/request/voice', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data),

  sendText: (text, sessionId, projectId) =>
    api.post('/api/request/text', { text, session_id: sessionId, project_id: projectId }, {
      timeout: 120000
    }).then(r => r.data),

  iterate: (outputId, feedback, sessionId) =>
    api.post('/api/request/iterate', { output_id: outputId, feedback, session_id: sessionId }, {
      timeout: 120000
    }).then(r => r.data),

  confirm: (outputId) =>
    api.post('/api/request/confirm', { output_id: outputId }).then(r => r.data),

  mapRequest: (text) =>
    api.post('/api/request/preview-project', { text }).then(r => r.data),

  getMyOutputs: () =>
    api.get('/api/request/my-outputs').then(r => r.data),
  getSuggestions: () =>
    api.get('/api/request/suggestions').then(r => r.data),

}

export const adminApi = {
  listProjects: () => api.get('/api/admin/projects').then(r => r.data),
  getProject: (id) => api.get(`/api/admin/projects/${id}`).then(r => r.data),
  createProject: (data) => api.post('/api/admin/projects', data).then(r => r.data),
  updateProject: (id, data) => api.put(`/api/admin/projects/${id}`, data).then(r => r.data),
  deleteProject: (id) => api.delete(`/api/admin/projects/${id}`).then(r => r.data),

  listDepartments: () => api.get('/api/admin/departments').then(r => r.data),
  createDepartment: (data) => api.post('/api/admin/departments', data).then(r => r.data),
  updateDepartment: (id, data) => api.put(`/api/admin/departments/${id}`, data).then(r => r.data),
  deleteDepartment: (id) => api.delete(`/api/admin/departments/${id}`).then(r => r.data),
  getDepartmentUser: (id) => api.get(`/api/admin/departments/${id}/user`).then(r => r.data),

  listOutputs: (projectId) =>
    api.get('/api/admin/outputs', { params: projectId ? { project_id: projectId } : {} }).then(r => r.data),
  
  analyzeImage: (imageBase64) =>
    api.post('/api/admin/analyze-image', { image: imageBase64 }).then(r => r.data),

  exportOutput: (outputId, format) =>
    api.get(`/api/admin/outputs/${outputId}/export`, { params: { format } }).then(r => r.data),

  uploadGuidelinesZip: (formData) =>
    api.post('/api/admin/upload-guidelines-zip', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    }).then(r => r.data),
    uploadReferenceImage: (formData) =>
      api.post('/api/reference-images/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data),
}

export default api