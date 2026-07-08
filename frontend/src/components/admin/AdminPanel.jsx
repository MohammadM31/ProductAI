import React, { useEffect, useState } from 'react'
import { Plus, FolderOpen, Inbox, Image, FileText, Building2, ChevronRight, Users, Edit2, Trash2, Eye, EyeOff, Copy, Check, FileArchive, Loader2, Upload } from 'lucide-react'
import { adminApi } from '../../api/client'
import { useApp } from '../../context/AppContext'
import ProjectEditor from './ProjectEditor'
import DeptInbox from './DeptInbox'
import toast from 'react-hot-toast'

export default function AdminPanel() {
  const { state, dispatch } = useApp()
  const { adminTab, user } = state

  const [projects, setProjects] = useState([])
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [showEditor, setShowEditor] = useState(false)

  const [showDepartmentModal, setShowDepartmentModal] = useState(false)
  const [editingDepartment, setEditingDepartment] = useState(null)
  const [showPassword, setShowPassword] = useState(false)
  const [deptForm, setDeptForm] = useState({
    name: '',
    description: '',
    email: '',
    password: '',
  })
  const [submitting, setSubmitting] = useState(false)

  const [expandedDept, setExpandedDept] = useState(null)
  const [deptUsers, setDeptUsers] = useState({})
  const [loadingUsers, setLoadingUsers] = useState({})
  const [copiedItem, setCopiedItem] = useState(null)
  const [showDeptPassword, setShowDeptPassword] = useState({})
  const [zipUploading, setZipUploading] = useState(false)
const [zipUploadResult, setZipUploadResult] = useState(null)

  const isAdmin = user?.role === 'admin'

  const handleZipUpload = async (e) => {
    const file = e.target.files[0]
    if (!file || !file.name.endsWith('.zip')) {
      toast.error('Please upload a ZIP file')
      return
    }
    
    setZipUploading(true)
    setZipUploadResult(null)
    
    try {
      const formData = new FormData()
      formData.append('zip', file)
      formData.append('save_to_db', 'true')
      
      const result = await adminApi.uploadGuidelinesZip(formData)
      setZipUploadResult(result)
      toast.success(`Parsed ${result.data.projects.length} projects!`)
    } catch (err) {
      console.error('Upload error:', err)
      toast.error(err.response?.data?.error || 'Failed to parse ZIP')
    } finally {
      setZipUploading(false)
    }
  }


  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      // Always load projects (works for both admin and department users)
      const pData = await adminApi.listProjects()
      console.log('📋 Projects loaded:', pData.projects)
      setProjects(pData.projects || [])
      
      // ONLY load departments if user is admin
      if (isAdmin) {
        try {
          const dData = await adminApi.listDepartments()
          console.log('📋 Departments loaded:', dData.departments)
          setDepartments(dData.departments || [])
        } catch (err) {
          console.error('Failed to load departments:', err)
          setDepartments([])
        }
      } else {
        // For department users, create a virtual department from their user info
        if (user?.department_id) {
          // Try to find the department name from projects
          const deptProjects = (pData.projects || []).filter(p => p.department_id === user.department_id)
          const deptName = deptProjects.length > 0 
            ? deptProjects[0].department_name || 'My Department' 
            : user.department_name || 'My Department'
          
          setDepartments([{
            id: user.department_id,
            name: user.department_name || deptName || 'My Department',
            description: 'Your department projects',
            created_at: new Date().toISOString()
          }])
        } else {
          setDepartments([])
        }
      }
    } catch (err) {
      console.error('Failed to load data:', err)
      toast.error('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const loadDepartmentUser = async (deptId) => {
    if (deptUsers[deptId]) return
    
    setLoadingUsers(prev => ({ ...prev, [deptId]: true }))
    try {
      const data = await adminApi.getDepartmentUser(deptId)
      if (data.user) {
        setDeptUsers(prev => ({ ...prev, [deptId]: data.user }))
      } else {
        setDeptUsers(prev => ({ ...prev, [deptId]: null }))
      }
    } catch (err) {
      console.error('Failed to load department credentials:', err)
      setDeptUsers(prev => ({ ...prev, [deptId]: null }))
    } finally {
      setLoadingUsers(prev => ({ ...prev, [deptId]: false }))
    }
  }

  const toggleExpandDepartment = (deptId) => {
    if (expandedDept === deptId) {
      setExpandedDept(null)
    } else {
      setExpandedDept(deptId)
      if (isAdmin) {
        loadDepartmentUser(deptId)
      }
    }
  }

  const copyToClipboard = (text, type) => {
    navigator.clipboard.writeText(text)
    setCopiedItem(type)
    toast.success(`${type} copied to clipboard!`)
    setTimeout(() => setCopiedItem(null), 2000)
  }

  const openCreateDepartment = () => {
    setEditingDepartment(null)
    setDeptForm({ name: '', description: '', email: '', password: '' })
    setShowDepartmentModal(true)
  }

  const openEditDepartment = (dept) => {
    setEditingDepartment(dept)
    setDeptForm({
      name: dept.name || '',
      description: dept.description || '',
      email: '',
      password: '',
    })
    setShowDepartmentModal(true)
  }

  const handleSaveDepartment = async () => {
    if (!deptForm.name.trim()) {
      toast.error('Department name is required')
      return
    }

    setSubmitting(true)
    try {
      if (editingDepartment) {
        const updateData = {
          name: deptForm.name.trim(),
          description: deptForm.description.trim() || `${deptForm.name.trim()} Department`,
        }
        if (deptForm.email.trim()) updateData.email = deptForm.email.trim()
        if (deptForm.password.trim()) updateData.password = deptForm.password.trim()
        
        await adminApi.updateDepartment(editingDepartment.id, updateData)
        toast.success('Department updated!')
        
        // Reload data
        await loadData()
        setDeptUsers(prev => {
          const newState = { ...prev }
          delete newState[editingDepartment.id]
          return newState
        })
      } else {
        if (!deptForm.email.trim() || !deptForm.password.trim()) {
          toast.error('Email and password are required for new departments')
          setSubmitting(false)
          return
        }
        
        const result = await adminApi.createDepartment({
          name: deptForm.name.trim(),
          description: deptForm.description.trim() || `${deptForm.name.trim()} Department`,
          email: deptForm.email.trim(),
          password: deptForm.password.trim(),
        })
        
        toast.success(`Department "${result.department.name}" created!`)
        
        // Reload data
        await loadData()
      }
      
      setShowDepartmentModal(false)
      setDeptForm({ name: '', description: '', email: '', password: '' })
      setEditingDepartment(null)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Operation failed')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteDepartment = async (dept) => {
    if (!confirm(`Delete department "${dept.name}"? This will also delete all its projects and user accounts. This cannot be undone!`)) return
    
    try {
      await adminApi.deleteDepartment(dept.id)
      toast.success(`Department "${dept.name}" deleted`)
      
      // Reload data
      await loadData()
      setDeptUsers(prev => {
        const newState = { ...prev }
        delete newState[dept.id]
        return newState
      })
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete department')
    }
  }

  const openNew = () => {
    setEditing(null)
    setShowEditor(true)
  }

  const openEdit = (project) => {
    setEditing(project)
    setShowEditor(true)
  }

  const handleSave = (saved) => {
    setProjects(prev => {
      const exists = prev.find(p => p.id === saved.id)
      if (exists) return prev.map(p => p.id === saved.id ? saved : p)
      return [saved, ...prev]
    })
    setShowEditor(false)
    loadData()
  }

  const handleDelete = (id) => {
    setProjects(prev => prev.filter(p => p.id !== id))
    setShowEditor(false)
    loadData()
  }

  // Group projects by department
  const grouped = departments.map(dept => ({
    dept,
    projects: projects.filter(p => p.department_id === dept.id),
  }))

  // Show projects that don't belong to any department
  const orphanProjects = projects.filter(p => !p.department_id || !departments.find(d => d.id === p.department_id))

  return (
    <div className="flex h-full">
      <aside className="w-60 flex-shrink-0 bg-stone-900 border-r border-stone-700 flex flex-col">
        <div className="px-4 py-4 border-b border-stone-700">
          <p className="text-xs text-stone-500 uppercase tracking-widest font-medium">Admin Panel</p>
          <p className="text-sm text-stone-300 mt-0.5">{user?.name}</p>
          <p className="text-xs text-stone-500 capitalize">{user?.role?.replace('_', ' ')}</p>
        </div>

        <nav className="p-2 space-y-1 flex-1">
          <button
            onClick={() => { dispatch({ type: 'SET_ADMIN_TAB', payload: 'projects' }); setShowEditor(false) }}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-colors ${
              adminTab === 'projects' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800'
            }`}
          >
            <FolderOpen size={15} /> Projects
          </button>
          <button
            onClick={() => { dispatch({ type: 'SET_ADMIN_TAB', payload: 'inbox' }); setShowEditor(false) }}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-colors ${
              adminTab === 'inbox' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800'
            }`}
          >
            <Inbox size={15} /> Dept Inbox
          </button>
          
          {isAdmin && (
            <button
              onClick={() => dispatch({ type: 'SET_ADMIN_TAB', payload: 'departments' })}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                adminTab === 'departments' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800'
              }`}
            >
              <Building2 size={15} /> Departments
            </button>
          )}
        </nav>
      </aside>

      <div className="flex-1 flex overflow-hidden">
        {adminTab === 'projects' && (
          <div className="flex flex-1 overflow-hidden">
            <div className="w-72 flex-shrink-0 flex flex-col border-r border-stone-700 overflow-y-auto">
              <div className="px-4 py-4 border-b border-stone-700 flex items-center justify-between flex-shrink-0">
                <h2 className="text-sm font-semibold text-white">Projects</h2>
                <button
                  onClick={openNew}
                  className="flex items-center gap-1.5 text-xs bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Plus size={12} /> New
                </button>
              </div>

                    <div className="px-4 py-3 border-b border-stone-700 bg-stone-800/30">
              <div className="flex items-center gap-2">
                <label className="cursor-pointer flex items-center gap-1.5 text-xs bg-stone-700 hover:bg-stone-600 text-white font-medium px-3 py-1.5 rounded-lg transition-colors">
                  <FileArchive size={12} />
                  {zipUploading ? 'Uploading...' : 'Upload ZIP'}
                  <input
                    type="file"
                    accept=".zip"
                    onChange={handleZipUpload}
                    disabled={zipUploading}
                    className="hidden"
                  />
                </label>
                {zipUploading && <Loader2 size={14} className="animate-spin text-amber-400" />}
                {zipUploadResult && (
                  <span className="text-xs text-emerald-400">
                    ✓ {zipUploadResult.data.projects.length} projects parsed
                  </span>
                )}
              </div>
            </div>

              {loading ? (
                <div className="flex-1 flex items-center justify-center text-stone-500 text-sm">Loading…</div>
              ) : (
                <div className="flex-1 overflow-y-auto py-2">
                  {grouped.map(({ dept, projects: dProjects }) => (
                    <div key={dept.id}>
                      <div className="flex items-center gap-2 px-4 py-2 mt-2">
                        <Building2 size={12} className="text-stone-500" />
                        <span className="text-xs font-semibold text-stone-400 uppercase tracking-wide">{dept.name}</span>
                        <span className="text-xs text-stone-600">({dProjects.length})</span>
                      </div>
                      {dProjects.length === 0 ? (
                        <p className="text-xs text-stone-600 px-6 pb-2">No projects yet</p>
                      ) : (
                        dProjects.map(project => (
                          <button
                            key={project.id}
                            onClick={() => openEdit(project)}
                            className={`w-full text-left px-4 py-2.5 hover:bg-stone-800 transition-colors flex items-center gap-3 ${
                              editing?.id === project.id && showEditor ? 'bg-stone-800' : ''
                            }`}
                          >
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                              project.output_type === 'image' ? 'bg-amber-500/10' : 'bg-blue-500/10'
                            }`}>
                              {project.output_type === 'image'
                                ? <Image size={13} className="text-amber-400" />
                                : <FileText size={13} className="text-amber-400" />
                              }
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-stone-200 truncate">{project.name}</p>
                              <p className="text-xs text-stone-500 truncate">{project.description}</p>
                            </div>
                            <ChevronRight size={14} className="text-stone-600 flex-shrink-0" />
                          </button>
                        ))
                      )}
                    </div>
                  ))}
                  
                  {orphanProjects.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 px-4 py-2 mt-2">
                        <span className="text-xs font-semibold text-rose-400 uppercase tracking-wide">⚠️ Unassigned</span>
                        <span className="text-xs text-stone-600">({orphanProjects.length})</span>
                      </div>
                      {orphanProjects.map(project => (
                        <button
                          key={project.id}
                          onClick={() => openEdit(project)}
                          className={`w-full text-left px-4 py-2.5 hover:bg-stone-800 transition-colors flex items-center gap-3 ${
                            editing?.id === project.id && showEditor ? 'bg-stone-800' : ''
                          }`}
                        >
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            project.output_type === 'image' ? 'bg-amber-500/10' : 'bg-blue-500/10'
                          }`}>
                            {project.output_type === 'image'
                              ? <Image size={13} className="text-amber-400" />
                              : <FileText size={13} className="text-blue-400" />
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-stone-200 truncate">{project.name}</p>
                            <p className="text-xs text-stone-500 truncate">{project.description}</p>
                          </div>
                          <ChevronRight size={14} className="text-stone-600 flex-shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-hidden">
              {showEditor ? (
                <ProjectEditor
                  project={editing}
                  departments={departments}
                  onSave={handleSave}
                  onDelete={handleDelete}
                  onClose={() => setShowEditor(false)}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center text-stone-500 px-8">
                  <FolderOpen size={40} className="mb-3 opacity-20" />
                  <p className="text-sm font-medium text-stone-400">Select a project to edit</p>
                  <p className="text-xs mt-1">Or create a new project using the + button.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {adminTab === 'departments' && isAdmin && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-white">Departments</h2>
                  <p className="text-sm text-stone-400">Manage departments and their login credentials</p>
                </div>
                <button
                  onClick={openCreateDepartment}
                  className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold text-sm px-4 py-2 rounded-xl transition-colors"
                >
                  <Plus size={16} /> New Department
                </button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center h-32 text-stone-500">Loading…</div>
              ) : departments.length === 0 ? (
                <div className="text-center py-12 text-stone-500">
                  <Building2 size={48} className="mx-auto mb-3 opacity-20" />
                  <p className="text-sm">No departments yet</p>
                  <p className="text-xs mt-1">Create your first department to get started</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {departments.map(dept => {
                    const userData = deptUsers[dept.id]
                    const isLoadingUser = loadingUsers[dept.id]
                    const isExpanded = expandedDept === dept.id
                    const showPw = showDeptPassword[dept.id]
                    const deptProjectCount = projects.filter(p => p.department_id === dept.id).length

                    return (
                      <div key={dept.id} className="bg-stone-800 border border-stone-700 rounded-xl overflow-hidden">
                        <div className="p-4 flex items-start justify-between">
                          <div className="flex-1 cursor-pointer" onClick={() => toggleExpandDepartment(dept.id)}>
                            <div className="flex items-center gap-3">
                              <Building2 size={18} className="text-amber-400" />
                              <h3 className="text-base font-semibold text-white">{dept.name}</h3>
                              <span className="text-xs text-stone-500">
                                {isExpanded ? '▼' : '▶'}
                              </span>
                              <span className="text-xs text-stone-500 bg-stone-700 px-2 py-0.5 rounded-full">
                                {deptProjectCount} projects
                              </span>
                            </div>
                            <p className="text-sm text-stone-400 mt-1">{dept.description || 'No description'}</p>
                          </div>
                          <div className="flex gap-2 ml-4">
                            <button
                              onClick={() => openEditDepartment(dept)}
                              className="p-2 rounded-lg hover:bg-stone-700 text-stone-400 hover:text-stone-200 transition-colors"
                              title="Edit department"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => handleDeleteDepartment(dept)}
                              className="p-2 rounded-lg hover:bg-red-500/20 text-stone-400 hover:text-red-400 transition-colors"
                              title="Delete department"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>

                        {isExpanded && isAdmin && (
                          <div className="border-t border-stone-700 px-4 py-4 bg-stone-900/50">
                            <p className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-3">
                              🔐 Login Credentials
                            </p>
                            
                            {isLoadingUser ? (
                              <div className="flex items-center gap-2 text-stone-500 text-sm">
                                <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                                Loading credentials...
                              </div>
                            ) : userData ? (
                              <div className="space-y-3">
                                <div className="flex items-center gap-2 bg-stone-800 rounded-lg px-3 py-2">
                                  <span className="text-xs text-stone-400 font-medium w-16">Email:</span>
                                  <span className="text-sm text-white flex-1">{userData.email}</span>
                                  <button
                                    onClick={() => copyToClipboard(userData.email, 'email')}
                                    className="p-1 hover:bg-stone-700 rounded text-stone-400 hover:text-stone-200 transition-colors"
                                    title="Copy email"
                                  >
                                    {copiedItem === 'email' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                                  </button>
                                </div>

                                <div className="flex items-center gap-2 bg-stone-800 rounded-lg px-3 py-2">
                                  <span className="text-xs text-stone-400 font-medium w-16">Password:</span>
                                  <span className="text-sm text-white flex-1 font-mono">
                                    {showPw ? (
                                      <span className="text-amber-400 font-bold">
                                        {userData.plain_password || 'No password set'}
                                      </span>
                                    ) : (
                                      '••••••••'
                                    )}
                                  </span>
                                  <button
                                    onClick={() => setShowDeptPassword(prev => ({ ...prev, [dept.id]: !prev[dept.id] }))}
                                    className="p-1 hover:bg-stone-700 rounded text-stone-400 hover:text-stone-200 transition-colors"
                                    title={showPw ? 'Hide password' : 'Show password'}
                                  >
                                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                                  </button>
                                  <button
                                    onClick={() => copyToClipboard(userData.plain_password || 'No password set', 'password')}
                                    className="p-1 hover:bg-stone-700 rounded text-stone-400 hover:text-stone-200 transition-colors"
                                    title="Copy password"
                                  >
                                    {copiedItem === 'password' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                                  </button>
                                </div>

                                <div className="flex gap-2 mt-2">
                                  <button
                                    onClick={() => {
                                      const msg = `Department Login Credentials:\n\nEmail: ${userData.email}\nPassword: ${userData.plain_password || 'No password set'}`
                                      navigator.clipboard.writeText(msg)
                                      toast.success('Credentials copied to clipboard!')
                                    }}
                                    className="flex items-center gap-2 text-xs bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 px-3 py-1.5 rounded-lg transition-colors"
                                  >
                                    <Copy size={12} />
                                    Copy Credentials
                                  </button>
                                  <button
                                    onClick={() => {
                                      openEditDepartment(dept)
                                      setDeptForm({
                                        name: dept.name || '',
                                        description: dept.description || '',
                                        email: '',
                                        password: '',
                                      })
                                    }}
                                    className="flex items-center gap-2 text-xs bg-stone-700 hover:bg-stone-600 text-stone-300 px-3 py-1.5 rounded-lg transition-colors"
                                  >
                                    <Edit2 size={12} />
                                    Change Password
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="text-sm text-stone-500">
                                No user account found for this department. Edit the department to add credentials.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {adminTab === 'inbox' && (
          <div className="flex-1 overflow-hidden">
            <DeptInbox projects={projects} />
          </div>
        )}
      </div>

      {showDepartmentModal && isAdmin && (
        <>
          <div 
            className="fixed inset-0 bg-black/60 z-50"
            onClick={() => {
              setShowDepartmentModal(false)
              setEditingDepartment(null)
              setDeptForm({ name: '', description: '', email: '', password: '' })
            }}
          />
          
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div 
              className="bg-stone-900 border border-stone-700 rounded-2xl p-6 w-96 max-w-full shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Building2 size={18} className="text-amber-400" />
                {editingDepartment ? `Edit ${editingDepartment.name}` : 'Create New Department'}
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-stone-400 mb-1.5">
                    Department Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    value={deptForm.name}
                    onChange={e => setDeptForm({ ...deptForm, name: e.target.value })}
                    className="input-field"
                    placeholder="e.g. Sports Department"
                    autoFocus
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-stone-400 mb-1.5">
                    Description
                  </label>
                  <textarea
                    value={deptForm.description}
                    onChange={e => setDeptForm({ ...deptForm, description: e.target.value })}
                    className="input-field resize-none"
                    rows={2}
                    placeholder="What does this department handle?"
                  />
                </div>

                {!editingDepartment && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-stone-400 mb-1.5">
                        Login Email <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="email"
                        value={deptForm.email}
                        onChange={e => setDeptForm({ ...deptForm, email: e.target.value })}
                        className="input-field"
                        placeholder="dept@company.com"
                      />
                      <p className="text-xs text-stone-500 mt-1">The department will use this email to login</p>
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-stone-400 mb-1.5">
                        Login Password <span className="text-rose-400">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={deptForm.password}
                          onChange={e => setDeptForm({ ...deptForm, password: e.target.value })}
                          className="input-field pr-10"
                          placeholder="••••••••"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-200"
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      <p className="text-xs text-stone-500 mt-1">Minimum 6 characters recommended</p>
                    </div>
                  </>
                )}

                {editingDepartment && (
                  <div className="bg-stone-800 border border-stone-700 rounded-lg p-3">
                    <p className="text-xs text-stone-400">
                      <span className="text-amber-400">ℹ️</span> To update credentials, enter new email/password below. Leave blank to keep current values.
                    </p>
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-stone-400 mb-1.5">
                        New Email (optional)
                      </label>
                      <input
                        type="email"
                        value={deptForm.email}
                        onChange={e => setDeptForm({ ...deptForm, email: e.target.value })}
                        className="input-field"
                        placeholder="Leave blank to keep current"
                      />
                    </div>
                    <div className="mt-2">
                      <label className="block text-xs font-medium text-stone-400 mb-1.5">
                        New Password (optional)
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={deptForm.password}
                          onChange={e => setDeptForm({ ...deptForm, password: e.target.value })}
                          className="input-field pr-10"
                          placeholder="Leave blank to keep current"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-200"
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowDepartmentModal(false)
                    setEditingDepartment(null)
                    setDeptForm({ name: '', description: '', email: '', password: '' })
                  }}
                  className="flex-1 px-4 py-2.5 text-sm text-stone-400 hover:text-stone-200 hover:bg-stone-800 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveDepartment}
                  disabled={submitting || !deptForm.name.trim() || (!editingDepartment && (!deptForm.email.trim() || !deptForm.password.trim()))}
                  className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-stone-950 font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <span className="w-4 h-4 border-2 border-stone-950 border-t-transparent rounded-full animate-spin" />
                      {editingDepartment ? 'Updating...' : 'Creating...'}
                    </>
                  ) : (
                    editingDepartment ? 'Update Department' : 'Create Department'
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}