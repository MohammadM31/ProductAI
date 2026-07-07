import React, { useState, useEffect } from 'react'
import { X, Save, Trash2, FolderOpen, Image, FileText, Plus, Upload } from 'lucide-react'
import { adminApi } from '../../api/client'
import toast from 'react-hot-toast'

const EMPTY_PROJECT = {
  name: '',
  description: '',
  department_id: '',
  output_type: 'image',
  trigger_keywords: '',
  system_prompt: '',
  reference_criteria: '',
  reference_images: [],
  attached_files: [],
  image_model: 'flux-schnell',
}

export default function ProjectEditor({ project, departments, onSave, onDelete, onClose }) {
  const [form, setForm] = useState(EMPTY_PROJECT)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [uploadingFile, setUploadingFile] = useState(false)
  const isNew = !project?.id

  useEffect(() => {
    if (project) {
      setForm({
        name: project.name || '',
        description: project.description || '',
        department_id: project.department_id || '',
        output_type: project.output_type || 'image',
        trigger_keywords: project.trigger_keywords || '',
        system_prompt: project.system_prompt || '',
        reference_criteria: project.reference_criteria || '',
        reference_images: Array.isArray(project.reference_images) ? project.reference_images : [],
        attached_files: Array.isArray(project.attached_files) ? project.attached_files : [],
        image_model: project.image_model || 'flux-schnell',
      })
    }
  }, [project])

  const update = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const analyzeImage = async (imageBase64) => {
    try {
      const response = await adminApi.analyzeImage(imageBase64)
      return response.analysis || ''
    } catch (err) {
      console.error('Image analysis failed:', err)
      return ''
    }
  }

  const handleImageUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    
    setUploadingImage(true)
    try {
      const reader = new FileReader()
      reader.onloadend = async () => {
        const base64 = reader.result
        const analysis = await analyzeImage(base64)
        
        const newImage = {
          id: Date.now().toString(),
          name: file.name,
          url: base64,
          description: file.name,
          style_analysis: analysis,
        }
        
        setForm(f => ({
          ...f,
          reference_images: [...f.reference_images, newImage]
        }))
        toast.success('Reference image uploaded and analyzed')
      }
      reader.readAsDataURL(file)
    } catch (err) {
      toast.error('Failed to upload image')
    } finally {
      setUploadingImage(false)
    }
  }

  const removeImage = (imageId) => {
    setForm(f => ({
      ...f,
      reference_images: f.reference_images.filter(img => img.id !== imageId)
    }))
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    
    setUploadingFile(true)
    try {
      const reader = new FileReader()
      reader.onloadend = () => {
        const content = reader.result
        
        const newFile = {
          id: Date.now().toString(),
          name: file.name,
          type: file.type,
          content: content,
        }
        
        setForm(f => ({
          ...f,
          attached_files: [...f.attached_files, newFile]
        }))
        toast.success('File uploaded')
      }
      reader.readAsDataURL(file)
    } catch (err) {
      toast.error('Failed to upload file')
    } finally {
      setUploadingFile(false)
    }
  }

  const removeFile = (fileId) => {
    setForm(f => ({
      ...f,
      attached_files: f.attached_files.filter(file => file.id !== fileId)
    }))
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.department_id) {
      toast.error('Name and department are required')
      return
    }
    setSaving(true)
    try {
      let result
      if (isNew) {
        result = await adminApi.createProject(form)
        toast.success('Project created')
      } else {
        result = await adminApi.updateProject(project.id, form)
        toast.success('Project saved')
      }
      onSave(result.project)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Delete project "${project.name}"? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await adminApi.deleteProject(project.id)
      toast.success('Project deleted')
      onDelete(project.id)
    } catch (err) {
      toast.error('Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-stone-700 flex-shrink-0">
        <h2 className="text-base font-semibold text-white">
          {isNew ? 'New Project' : `Edit: ${project.name}`}
        </h2>
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-stone-700 text-stone-400 hover:text-stone-200 transition-colors">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-stone-400 mb-1.5">Project Name *</label>
            <input
              value={form.name}
              onChange={e => update('name', e.target.value)}
              className="input-field"
              placeholder="e.g. Menu Item Images"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-400 mb-1.5">Department *</label>
            <select
              value={form.department_id}
              onChange={e => update('department_id', e.target.value)}
              className="input-field"
            >
              <option value="">Select department…</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-400 mb-1.5">Output Type</label>
            <div className="flex gap-2">
              {[
                { val: 'image', icon: Image, label: 'Image' },
                { val: 'text', icon: FileText, label: 'Text' },
              ].map(({ val, icon: Icon, label }) => (
                <button
                  key={val}
                  onClick={() => update('output_type', val)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                    form.output_type === val
                      ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                      : 'border-stone-700 text-stone-400 hover:border-stone-500'
                  }`}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-stone-400 mb-1.5">
            Image Generation Model
            <span className="text-stone-600 font-normal ml-1">— Choose which AI model to use</span>
          </label>
          <select
            value={form.image_model || 'flux-schnell'}
            onChange={e => update('image_model', e.target.value)}
            className="input-field"
          >
            <option value="flux-schnell">FLUX-Schnell (Cheapest, $0.003/image)</option>
            <option value="flux-dev">FLUX-Dev (Good quality, $0.025/image)</option>
            <option value="flux-1.1-pro">FLUX-1.1-Pro (Best quality, $0.04/image)</option>
            <option value="sdxl">SDXL (Open source, ~$0.003-0.005/image)</option>
            <option value="ideogram-v3-turbo">Ideogram v3 Turbo (Good for text, ~$0.04/image)</option>
          </select>
          <p className="text-xs text-stone-500 mt-1">Different models have different costs and quality levels</p>
        </div>

        <div className="border border-stone-700 rounded-xl p-4 bg-stone-900/50">
          <label className="block text-xs font-medium text-stone-400 mb-3">
            Reference Images (Visual Examples)
            <span className="text-stone-600 font-normal ml-1">— Upload images that represent the style you want</span>
          </label>
          
          <div className="flex items-center gap-3 mb-3">
            <label className="cursor-pointer flex items-center gap-2 bg-stone-700 hover:bg-stone-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">
              <Upload size={14} />
              {uploadingImage ? 'Uploading...' : 'Upload Reference Image'}
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                disabled={uploadingImage}
                className="hidden"
              />
            </label>
            <p className="text-xs text-stone-500">PNG, JPG, WebP (max 5MB)</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {form.reference_images.map((img) => (
              <div key={img.id} className="relative group">
                <img
                  src={img.url}
                  alt={img.name}
                  className="w-full h-32 object-cover rounded-xl border border-stone-700"
                />
                <button
                  onClick={() => removeImage(img.id)}
                  className="absolute top-2 right-2 p-1 bg-red-500/80 hover:bg-red-500 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={12} />
                </button>
                <p className="text-xs text-stone-400 mt-1 truncate">{img.name}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="border border-stone-700 rounded-xl p-4 bg-stone-900/50">
          <label className="block text-xs font-medium text-stone-400 mb-3">
            Attached Files (Documents)
            <span className="text-stone-600 font-normal ml-1">— Upload PDF, Word, or text files with guidelines</span>
          </label>
          
          <div className="flex items-center gap-3 mb-3">
            <label className="cursor-pointer flex items-center gap-2 bg-stone-700 hover:bg-stone-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">
              <Plus size={14} />
              {uploadingFile ? 'Uploading...' : 'Upload File'}
              <input
                type="file"
                accept=".txt,.pdf,.doc,.docx,.json,.md"
                onChange={handleFileUpload}
                disabled={uploadingFile}
                className="hidden"
              />
            </label>
            <p className="text-xs text-stone-500">TXT, PDF, DOC, DOCX, JSON, MD</p>
          </div>

          <div className="space-y-2">
            {form.attached_files.map((file) => (
              <div key={file.id} className="flex items-center justify-between bg-stone-800 rounded-lg px-3 py-2">
                <span className="text-sm text-stone-300 truncate">{file.name}</span>
                <button
                  onClick={() => removeFile(file.id)}
                  className="p-1 hover:bg-stone-700 rounded text-stone-400 hover:text-red-400 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-stone-400 mb-1.5">
            Reference Criteria / Visual Requirements
            <span className="text-stone-600 font-normal ml-1">— Describe the style, composition, colors from the reference images</span>
          </label>
          <textarea
            value={form.reference_criteria}
            onChange={e => update('reference_criteria', e.target.value)}
            rows={4}
            className="input-field resize-none"
            placeholder="Example: Images should follow the brand guidelines...
- Warm, golden lighting like the reference photos
- Plating style: Minimalist with fresh herbs on top
- Color palette: Earth tones with green accents
- Composition: 70% food, 30% negative space
- Mood: Premium, inviting, rustic-elegant"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-stone-400 mb-1.5">Description</label>
          <textarea
            value={form.description}
            onChange={e => update('description', e.target.value)}
            rows={2}
            className="input-field resize-none"
            placeholder="Brief description of what this project handles…"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-stone-400 mb-1.5">
            Trigger Keywords
            <span className="text-stone-600 font-normal ml-1">— used to auto-match user requests</span>
          </label>
          <input
            value={form.trigger_keywords}
            onChange={e => update('trigger_keywords', e.target.value)}
            className="input-field"
            placeholder="menu food dish plate meal photo image…"
          />
          <p className="text-xs text-stone-600 mt-1">Space-separated keywords that signal this project.</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-stone-400 mb-1.5">
            System Prompt / Output Criteria
            <span className="text-stone-600 font-normal ml-1">— guidelines and brand rules for AI generation</span>
          </label>
          <textarea
            value={form.system_prompt}
            onChange={e => update('system_prompt', e.target.value)}
            rows={10}
            className="input-field resize-none font-mono text-xs leading-relaxed"
            placeholder="You are a professional…&#10;&#10;BRAND GUIDELINES:&#10;- Style: …"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 px-6 py-4 border-t border-stone-700 flex-shrink-0">
        {!isNew && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-2 text-rose-400 hover:text-rose-300 text-sm disabled:opacity-50 transition-colors"
          >
            <Trash2 size={14} />
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm text-stone-400 hover:text-stone-200 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-semibold text-sm px-5 py-2 rounded-xl transition-colors"
        >
          <Save size={14} />
          {saving ? 'Saving…' : isNew ? 'Create Project' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}