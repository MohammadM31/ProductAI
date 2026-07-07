import React, { useEffect, useState } from 'react'
import { adminApi } from '../../api/client'
import { ImageIcon, FileText, Download, RefreshCw, MessageSquare, User, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import ChatView from './ChatView'
import toast from 'react-hot-toast'

export default function DeptInbox({ projects }) {
  const [outputs, setOutputs] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedProject, setSelectedProject] = useState('all')
  const [selectedOutput, setSelectedOutput] = useState(null)
  const [showChat, setShowChat] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const projectId = selectedProject !== 'all' ? selectedProject : null
      console.log('📋 Loading outputs for project:', projectId)
      
      const data = await adminApi.listOutputs(projectId)
      console.log('📋 Outputs response:', data)
      
      // Only show confirmed outputs
      const confirmedOutputs = (data.outputs || []).filter(out => 
        out.status === 'confirmed' || out.status === 'sent_to_dept'
      )
      setOutputs(confirmedOutputs)
    } catch (err) {
      console.error('Failed to load outputs:', err)
      // Don't show error toast for 400 - it might just be no outputs
      if (err.response?.status !== 400) {
        toast.error('Failed to load outputs')
      }
      setOutputs([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { 
    load() 
  }, [selectedProject])

  const projectName = (id) => {
    const project = projects.find(p => p.id === id)
    return project?.name || 'Unknown'
  }
  
  const projectObj = (id) => {
    return projects.find(p => p.id === id) || null
  }

  const exportOutput = (output) => {
    if (!output) return

    if (output.output_type === 'image') {
      fetch(output.content)
        .then(res => res.blob())
        .then(blob => {
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `${projectName(output.project_id)}.png`
          a.click()
          URL.revokeObjectURL(url)
          toast.success('Image downloaded')
        })
        .catch(() => toast.error('Failed to download image'))
    } else {
      const blob = new Blob([output.content], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${projectName(output.project_id)}.txt`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Text exported')
    }
  }

  const loadIntoChat = (output) => {
    setSelectedOutput(output)
    setShowChat(true)
  }

  if (showChat && selectedOutput) {
    return (
      <ChatView
        output={selectedOutput}
        project={projectObj(selectedOutput.project_id)}
        onBack={() => setShowChat(false)}
      />
    )
  }

  return (
    <div className="flex h-full">
      {/* Left Panel - List of outputs */}
      <div className="flex flex-col w-80 flex-shrink-0 border-r border-stone-700 overflow-y-auto">
        <div className="px-4 py-4 border-b border-stone-700 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Department Inbox</h3>
            <button 
              onClick={load} 
              className="p-1 rounded hover:bg-stone-700 text-stone-400 hover:text-stone-200 transition-colors"
              disabled={loading}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
          <select
            value={selectedProject}
            onChange={e => setSelectedProject(e.target.value)}
            className="input-field text-xs"
          >
            <option value="all">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center flex-1 text-stone-500 text-sm">Loading…</div>
        ) : outputs.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 text-center px-4 text-stone-500">
            <FileText size={32} className="mb-3 opacity-30" />
            <p className="text-sm">No confirmed outputs yet</p>
            <p className="text-xs mt-1">Outputs appear here once requesters confirm them.</p>
          </div>
        ) : (
          <div className="divide-y divide-stone-800">
            {outputs.map(out => (
              <div
                key={out.id}
                className="w-full text-left px-4 py-3 hover:bg-stone-800 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2 mb-1">
                  {out.output_type === 'image'
                    ? <ImageIcon size={12} className="text-amber-400 flex-shrink-0" />
                    : <FileText size={12} className="text-blue-400 flex-shrink-0" />
                  }
                  <span className="text-xs font-medium text-stone-300 truncate">{projectName(out.project_id)}</span>
                </div>
                
                {/* Requester info */}
                <div className="flex items-center gap-1.5 mb-1">
                  <User size={11} className="text-stone-500 flex-shrink-0" />
                  <span className="text-xs text-stone-400 truncate">
                    {out.requester_name || out.requester_email || 'Unknown User'}
                  </span>
                </div>
                
                <p className="text-xs text-stone-500 truncate mb-2 line-clamp-2">
                  {out.original_request || 'No description'}
                </p>
                
                <div className="flex items-center justify-between">
                  <span className="text-xs text-stone-600">
                    {out.created_at ? format(new Date(out.created_at), 'MMM d, HH:mm') : ''}
                  </span>
                  
                  {/* Load into Chat button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      loadIntoChat(out)
                    }}
                    className="flex items-center gap-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs px-3 py-1 rounded-full transition-colors"
                  >
                    <MessageSquare size={12} />
                    Load in Chat
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right Panel - Preview / Empty State */}
      <div className="flex-1 overflow-y-auto">
        {selectedOutput && !showChat ? (
          <div className="p-6 space-y-4 max-w-2xl mx-auto">
            <div>
              <div className="flex items-center gap-3 mb-1 flex-wrap">
                <h3 className="text-base font-semibold text-white">{projectName(selectedOutput.project_id)}</h3>
                <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  Confirmed
                </span>
              </div>
              
              <div className="flex items-center gap-2 bg-stone-800/50 rounded-lg px-3 py-2 mb-2">
                <User size={14} className="text-amber-400" />
                <span className="text-sm text-stone-300">
                  Submitted by: <span className="font-medium text-white">
                    {selectedOutput.requester_name || selectedOutput.requester_email || 'Unknown User'}
                  </span>
                </span>
              </div>
              
              <p className="text-sm text-stone-400">
                <span className="text-stone-500 mr-1">Request:</span>
                {selectedOutput.original_request}
              </p>
            </div>

            {selectedOutput.output_type === 'image' ? (
              <div className="rounded-2xl overflow-hidden border border-stone-700">
                <img 
                  src={selectedOutput.content} 
                  alt="Output" 
                  className="w-full object-contain" 
                  style={{ maxHeight: 500 }}
                  onError={(e) => {
                    e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"%3E%3Crect width="200" height="200" fill="%231c1917"/%3E%3Ctext x="100" y="100" text-anchor="middle" dy=".3em" fill="%23505050" font-family="sans-serif" font-size="14"%3ENo Image%3C/text%3E%3C/svg%3E'
                  }}
                />
              </div>
            ) : (
              <div className="bg-stone-900 border border-stone-700 rounded-2xl p-6 text-sm text-stone-200 whitespace-pre-wrap leading-relaxed">
                {selectedOutput.content}
              </div>
            )}

            <div className="flex gap-3 flex-wrap">
              {selectedOutput.output_type === 'image' && (
                <a
                  href={selectedOutput.content}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-stone-700 hover:bg-stone-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
                >
                  <Download size={14} /> Open Full Image
                </a>
              )}
              {selectedOutput.output_type === 'text' && (
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(selectedOutput.content)
                    toast.success('Copied to clipboard!')
                  }}
                  className="flex items-center gap-2 bg-stone-700 hover:bg-stone-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
                >
                  Copy Text
                </button>
              )}
              <button
                onClick={() => exportOutput(selectedOutput)}
                className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
              >
                <Download size={14} /> Export as File
              </button>
              <button
                onClick={() => loadIntoChat(selectedOutput)}
                className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
              >
                <MessageSquare size={14} /> Load in Chat
              </button>
            </div>

            {selectedOutput.created_at && (
              <p className="text-xs text-stone-600">
                Received: {format(new Date(selectedOutput.created_at), 'MMMM d, yyyy at HH:mm')}
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-stone-500">
            <ImageIcon size={40} className="mb-3 opacity-20" />
            <p className="text-sm">Select an output from the list</p>
            <p className="text-xs mt-1">Click "Load in Chat" to continue working on it</p>
          </div>
        )}
      </div>
    </div>
  )
}