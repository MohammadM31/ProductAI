// ProjectEditor.jsx - Complete file
import React, { useState, useEffect } from 'react'
import { X, Save, Trash2, Image, FileText, Upload, Plus, Eye, EyeOff } from 'lucide-react'
import { adminApi } from '../../api/client'
import toast from 'react-hot-toast'

export default function ProjectEditor({ project, departments, user, onSave, onDelete, onClose }) {
  const [form, setForm] = useState({
    name: '',
    description: '',
    department_id: '',
    output_type: 'image',
    image_model: 'flux-1.1-pro',
    trigger_keywords: '',
    system_prompt: '',
    reference_criteria: '',
    reference_images: [],
    attached_files: [],
  })
  
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [fileUploading, setFileUploading] = useState(false)

  const isAdmin = user?.role === 'admin'
  const isDeptUser = user?.role === 'dept_user'

  // Available image models
  const imageModels = [
    { value: 'flux-schnell', label: 'FLUX Schnell (Fast, $0.003/image)' },
    { value: 'flux-dev', label: 'FLUX Dev (Good quality, $0.015/image)' },
    { value: 'flux-1.1-pro', label: 'FLUX-1.1-Pro (Best quality, $0.04/image)' },
    { value: 'sdxl', label: 'SDXL (Stable Diffusion, $0.003/image)' },
    { value: 'recraft-v4', label: 'Recraft V4 (Design-first, $0.04/image)' },
    { value: 'recraft-v4-svg', label: 'Recraft V4 SVG (Vector output, $0.04/image)' },
  ]

  // Load project data if editing
  useEffect(() => {
    if (project) {
      setForm({
        name: project.name || '',
        description: project.description || '',
        department_id: project.department_id || '',
        output_type: project.output_type || 'image',
        image_model: project.image_model || 'flux-1.1-pro',
        trigger_keywords: project.trigger_keywords || '',
        system_prompt: project.system_prompt || '',
        reference_criteria: project.reference_criteria || '',
        reference_images: project.reference_images || [],
        attached_files: project.attached_files || [],
      })
    } else if (isDeptUser && user?.department_id) {
      // For department users creating a new project, auto-set their department
      setForm(prev => ({
        ...prev,
        department_id: user.department_id
      }))
    }
  }, [project, isDeptUser, user])

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    // Validation
    if (!form.name.trim()) {
      toast.error('Project name is required')
      return
    }
    
    // For department users, ensure they have a department
    if (isDeptUser && !user?.department_id) {
      toast.error('You are not assigned to a department')
      return
    }
    
    // For admin, require department selection
    if (isAdmin && !form.department_id) {
      toast.error('Please select a department')
      return
    }
    
    setLoading(true)
    try {
      const data = {
        ...form,
        // For department users, force their department ID
        department_id: isDeptUser ? user.department_id : form.department_id,
        reference_images: form.reference_images.map(img => ({
          ...img,
          id: img.id || `img-${Date.now()}-${Math.random()}`
        })),
        attached_files: form.attached_files.map(file => ({
          ...file,
          id: file.id || `file-${Date.now()}-${Math.random()}`
        })),
      }
      
      let result
      if (project?.id) {
        result = await adminApi.updateProject(project.id, data)
        toast.success('Project updated successfully!')
      } else {
        result = await adminApi.createProject(data)
        toast.success('Project created successfully!')
      }
      
      onSave(result.project || result)
    } catch (err) {
      console.error('Save error:', err)
      toast.error(err.response?.data?.error || 'Failed to save project')
    } finally {
      setLoading(false)
    }
  }

  // Handle image upload
  const handleImageUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file')
      return
    }
    
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB')
      return
    }
    
    setUploading(true)
    try {
      const reader = new FileReader()
      reader.onload = (event) => {
        const base64 = event.target.result
        const newImage = {
          id: `img-${Date.now()}-${Math.random()}`,
          name: file.name,
          url: base64,
          description: '',
          style_analysis: '',
        }
        setForm(prev => ({
          ...prev,
          reference_images: [...prev.reference_images, newImage]
        }))
        toast.success('Image uploaded!')
      }
      reader.readAsDataURL(file)
    } catch (err) {
      console.error('Upload error:', err)
      toast.error('Failed to upload image')
    } finally {
      setUploading(false)
    }
  }

  // Handle file upload
  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    
    setFileUploading(true)
    try {
      const reader = new FileReader()
      reader.onload = (event) => {
        const content = event.target.result
        const newFile = {
          id: `file-${Date.now()}-${Math.random()}`,
          name: file.name,
          type: file.type || 'text/plain',
          content: typeof content === 'string' ? content : 'Binary content',
        }
        setForm(prev => ({
          ...prev,
          attached_files: [...prev.attached_files, newFile]
        }))
        toast.success('File uploaded!')
      }
      reader.readAsText(file)
    } catch (err) {
      console.error('Upload error:', err)
      toast.error('Failed to upload file')
    } finally {
      setFileUploading(false)
    }
  }

  const removeImage = (index) => {
    setForm(prev => ({
      ...prev,
      reference_images: prev.reference_images.filter((_, i) => i !== index)
    }))
  }

  const removeFile = (index) => {
    setForm(prev => ({
      ...prev,
      attached_files: prev.attached_files.filter((_, i) => i !== index)
    }))
  }

  return (
    <div className="h-full overflow-y-auto p-6 bg-stone-950/50">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-white">
              {project?.id ? 'Edit Project' : 'New Project'}
            </h2>
            <p className="text-sm text-stone-400">
              {project?.id ? 'Update project settings and guidelines' : 'Create a new project for content generation'}
              {isDeptUser && (
                <span className="block text-xs text-amber-400 mt-1">
                  Projects will be created in your department: {user?.department_name || 'Your Department'}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-stone-800 rounded-lg text-stone-400 hover:text-stone-200 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Project Details */}
          <div className="bg-stone-800/50 border border-stone-700 rounded-xl p-6">
            <h3 className="text-sm font-medium text-white mb-4">Project Details</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-stone-400 mb-1.5">
                  Project Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-stone-900 border border-stone-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-stone-500 focus:outline-none focus:border-amber-500/50 transition-colors"
                  placeholder="e.g., Instagram Posts, Menu Item Images"
                  required
                />
              </div>

              {/* DEPARTMENT DROPDOWN - SHOW ONLY FOR ADMIN */}
              {isAdmin ? (
                <div>
                  <label className="block text-xs font-medium text-stone-400 mb-1.5">
                    Department <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={form.department_id}
                    onChange={(e) => setForm({ ...form, department_id: e.target.value })}
                    className="w-full bg-stone-900 border border-stone-700 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors"
                    required
                  >
                    <option value="">Select a department...</option>
                    {departments.map(dept => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                  {departments.length === 0 && (
                    <p className="text-xs text-amber-400 mt-1">
                      ⚠️ No departments available. Create one first in the Departments tab.
                    </p>
                  )}
                </div>
              ) : (
                /* For department users - show department info but disabled */
                <div>
                  <label className="block text-xs font-medium text-stone-400 mb-1.5">
                    Department
                  </label>
                  <div className="w-full bg-stone-900 border border-stone-700 rounded-lg px-4 py-2.5 text-sm text-stone-400">
                    {user?.department_name || user?.department_id || 'Your Department'}
                    <input
                      type="hidden"
                      value={form.department_id || user?.department_id || ''}
                    />
                  </div>
                  <p className="text-xs text-stone-500 mt-1">
                    Projects are automatically assigned to your department
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-stone-400 mb-1.5">
                  Description
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full bg-stone-900 border border-stone-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-stone-500 focus:outline-none focus:border-amber-500/50 transition-colors resize-none"
                  rows={2}
                  placeholder="Brief description of what this project handles..."
                />
              </div>
            </div>
          </div>

          {/* Image Model Selection */}
          <div className="bg-stone-800/50 border border-stone-700 rounded-xl p-6">
            <h3 className="text-sm font-medium text-white mb-4">Image Generation Model</h3>
            <div>
              <label className="block text-xs font-medium text-stone-400 mb-1.5">
                Choose which AI model to use
              </label>
              <select
                value={form.image_model}
                onChange={(e) => setForm({ ...form, image_model: e.target.value })}
                className="w-full bg-stone-900 border border-stone-700 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors"
              >
                {imageModels.map(model => (
                  <option key={model.value} value={model.value}>
                    {model.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-stone-500 mt-1">
                Different models have different costs and quality levels
              </p>
            </div>
          </div>

          {/* Reference Images */}
          <div className="bg-stone-800/50 border border-stone-700 rounded-xl p-6">
            <h3 className="text-sm font-medium text-white mb-4">Reference Images</h3>
            <div>
              <label className="block text-xs font-medium text-stone-400 mb-1.5">
                Upload Reference Image
              </label>
              <div className="flex items-center gap-2">
                <label className="cursor-pointer flex items-center gap-2 bg-stone-700 hover:bg-stone-600 text-white text-sm px-4 py-2 rounded-lg transition-colors">
                  <Upload size={16} />
                  {uploading ? 'Uploading...' : 'Upload Image'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    disabled={uploading}
                    className="hidden"
                  />
                </label>
                <span className="text-xs text-stone-500">PNG, JPG, WebP (max 5MB)</span>
              </div>

              {/* Display uploaded images */}
              {form.reference_images.length > 0 && (
                <div className="mt-4 grid grid-cols-3 gap-3">
                  {form.reference_images.map((img, index) => (
                    <div key={img.id || index} className="relative group">
                      <div className="aspect-square rounded-lg overflow-hidden bg-stone-900 border border-stone-700">
                        <img
                          src={img.url}
                          alt={img.name || 'Reference image'}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="absolute top-1 right-1 p-1 bg-red-500/80 hover:bg-red-500 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={12} />
                      </button>
                      <p className="text-xs text-stone-400 mt-1 truncate">{img.name}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Attached Files */}
          <div className="bg-stone-800/50 border border-stone-700 rounded-xl p-6">
            <h3 className="text-sm font-medium text-white mb-4">Attached Files</h3>
            <div>
              <label className="block text-xs font-medium text-stone-400 mb-1.5">
                Upload File
              </label>
              <div className="flex items-center gap-2">
                <label className="cursor-pointer flex items-center gap-2 bg-stone-700 hover:bg-stone-600 text-white text-sm px-4 py-2 rounded-lg transition-colors">
                  <Upload size={16} />
                  {fileUploading ? 'Uploading...' : 'Upload File'}
                  <input
                    type="file"
                    accept=".txt,.pdf,.doc,.docx,.json,.md"
                    onChange={handleFileUpload}
                    disabled={fileUploading}
                    className="hidden"
                  />
                </label>
                <span className="text-xs text-stone-500">TXT, PDF, DOC, DOCX, JSON, MD</span>
              </div>

              {/* Display uploaded files */}
              {form.attached_files.length > 0 && (
                <div className="mt-4 space-y-2">
                  {form.attached_files.map((file, index) => (
                    <div key={file.id || index} className="flex items-center justify-between bg-stone-900 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <FileText size={14} className="text-stone-400" />
                        <span className="text-sm text-white">{file.name}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        className="p-1 hover:bg-red-500/20 rounded text-stone-400 hover:text-red-400 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Reference Criteria */}
          <div className="bg-stone-800/50 border border-stone-700 rounded-xl p-6">
            <h3 className="text-sm font-medium text-white mb-4">Reference Criteria</h3>
            <div>
              <label className="block text-xs font-medium text-stone-400 mb-1.5">
                Visual Requirements
              </label>
              <textarea
                value={form.reference_criteria}
                onChange={(e) => setForm({ ...form, reference_criteria: e.target.value })}
                className="w-full bg-stone-900 border border-stone-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-stone-500 focus:outline-none focus:border-amber-500/50 transition-colors resize-none"
                rows={4}
                placeholder="Describe the style, composition, colors from the reference images..."
              />
              <p className="text-xs text-stone-500 mt-1">
                Example: Images should follow the brand guidelines with warm lighting...
              </p>
            </div>
          </div>

          {/* Trigger Keywords */}
          <div className="bg-stone-800/50 border border-stone-700 rounded-xl p-6">
            <h3 className="text-sm font-medium text-white mb-4">Trigger Keywords</h3>
            <div>
              <label className="block text-xs font-medium text-stone-400 mb-1.5">
                Keywords
              </label>
              <input
                type="text"
                value={form.trigger_keywords}
                onChange={(e) => setForm({ ...form, trigger_keywords: e.target.value })}
                className="w-full bg-stone-900 border border-stone-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-stone-500 focus:outline-none focus:border-amber-500/50 transition-colors"
                placeholder="menu item food dish meal plate recipe ingredient"
              />
              <p className="text-xs text-stone-500 mt-1">
                Space-separated keywords that signal this project
              </p>
            </div>
          </div>

          {/* System Prompt */}
          <div className="bg-stone-800/50 border border-stone-700 rounded-xl p-6">
            <h3 className="text-sm font-medium text-white mb-4">System Prompt</h3>
            <div>
              <label className="block text-xs font-medium text-stone-400 mb-1.5">
                Output Criteria
              </label>
              <textarea
                value={form.system_prompt}
                onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
                className="w-full bg-stone-900 border border-stone-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-stone-500 focus:outline-none focus:border-amber-500/50 transition-colors resize-none"
                rows={6}
                placeholder="Guidelines and brand rules for AI generation..."
              />
              <p className="text-xs text-stone-500 mt-1">
                Instructions for the AI on how to generate content for this project
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-stone-700">
            <div>
              {project?.id && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Delete this project? This cannot be undone.')) {
                      onDelete(project.id)
                    }
                  }}
                  className="flex items-center gap-2 text-rose-400 hover:text-rose-300 text-sm px-4 py-2 rounded-lg hover:bg-rose-500/10 transition-colors"
                >
                  <Trash2 size={16} />
                  Delete Project
                </button>
              )}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-stone-400 hover:text-stone-200 hover:bg-stone-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-stone-950 font-semibold text-sm px-6 py-2 rounded-lg transition-colors"
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-stone-950 border-t-transparent rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    {project?.id ? 'Update Project' : 'Create Project'}
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}