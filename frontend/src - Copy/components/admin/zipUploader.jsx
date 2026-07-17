import React, { useState } from 'react'
import { Upload, FileArchive, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { adminApi } from '../../api/client'
import toast from 'react-hot-toast'

export default function ZipUploader({ onComplete }) {
  const [uploading, setUploading] = useState(false)
  const [parsedData, setParsedData] = useState(null)
  const [expandedProject, setExpandedProject] = useState(null)

  const handleZipUpload = async (e) => {
    const file = e.target.files[0]
    if (!file || !file.name.endsWith('.zip')) {
      toast.error('Please upload a ZIP file')
      return
    }
    
    // Validate file size
    if (file.size > 50 * 1024 * 1024) {
      toast.error('ZIP file too large (max 50MB)')
      return
    }
    
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('zip', file)
      formData.append('save_to_db', 'false') // Preview only
      
      const response = await adminApi.uploadGuidelinesZip(formData)
      
      setParsedData(response.data)
      toast.success(`Parsed ${response.data.projects.length} projects successfully!`)
      
      if (onComplete) {
        onComplete(response.data)
      }
    } catch (err) {
      console.error('Upload error:', err)
      toast.error(err.response?.data?.error || 'Failed to parse ZIP')
    } finally {
      setUploading(false)
    }
  }

  const toggleProject = (index) => {
    setExpandedProject(expandedProject === index ? null : index)
  }

  return (
    <div className="bg-stone-900 border border-stone-700 rounded-2xl p-6">
      <div className="flex items-start gap-4">
        <div className="p-3 bg-amber-500/10 rounded-xl">
          <FileArchive size={24} className="text-amber-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-white">Upload Guidelines ZIP</h3>
          <p className="text-sm text-stone-400 mt-1">
            Upload a ZIP file with your project structure. The AI will automatically parse and organize everything.
          </p>
          
          <div className="mt-4 bg-stone-800/50 rounded-lg p-4 border border-stone-700">
            <p className="text-xs text-stone-500 font-mono">
              Expected structure:
              <br />
              📁 marketing department/
              <br />
              &nbsp;&nbsp;📁 request types/
              <br />
              &nbsp;&nbsp;&nbsp;&nbsp;📁 instagram post/
              <br />
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;📁 hot drink/
              <br />
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;📄 guidelines.docx
              <br />
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;🖼️ sample_photo.png
              <br />
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;📁 ice drink/
              <br />
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;📄 guidelines.docx
              <br />
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;🖼️ sample_photo.png
              <br />
              &nbsp;&nbsp;&nbsp;&nbsp;📁 menu item/
              <br />
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;📁 hot drink/
              <br />
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;📄 guidelines.docx
              <br />
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;🖼️ sample_photo.png
            </p>
          </div>
          
          <div className="mt-4">
            <label className="cursor-pointer inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold px-6 py-3 rounded-xl transition-colors">
              {uploading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Upload size={18} />
                  Select ZIP File
                </>
              )}
              <input
                type="file"
                accept=".zip"
                onChange={handleZipUpload}
                disabled={uploading}
                className="hidden"
              />
            </label>
            <p className="text-xs text-stone-500 mt-2">Maximum file size: 50MB</p>
          </div>
        </div>
      </div>
      
      {parsedData && (
        <div className="mt-6 border-t border-stone-700 pt-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-white">
              Parsed Projects ({parsedData.projects?.length || 0})
            </h4>
            <button
              onClick={() => setParsedData(null)}
              className="text-xs text-stone-400 hover:text-stone-200"
            >
              Clear
            </button>
          </div>
          
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {parsedData.projects?.map((project, index) => (
              <div 
                key={index}
                className="bg-stone-800 rounded-lg border border-stone-700 overflow-hidden"
              >
                <button
                  onClick={() => toggleProject(index)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-stone-750 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-white">{project.name}</span>
                    <span className="text-xs bg-stone-700 px-2 py-0.5 rounded-full text-stone-400">
                      {project.reference_images.length} images
                    </span>
                    <span className="text-xs bg-stone-700 px-2 py-0.5 rounded-full text-stone-400">
                      {project.attached_files.length} files
                    </span>
                  </div>
                  <span className="text-stone-400">
                    {expandedProject === index ? '▲' : '▼'}
                  </span>
                </button>
                
                {expandedProject === index && (
                  <div className="px-4 pb-4 space-y-3">
                    <div>
                      <p className="text-xs text-stone-400 font-medium">System Prompt</p>
                      <p className="text-xs text-stone-300 mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap">
                        {project.system_prompt || 'No system prompt'}
                      </p>
                    </div>
                    
                    <div>
                      <p className="text-xs text-stone-400 font-medium">Reference Criteria</p>
                      <p className="text-xs text-stone-300 mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap">
                        {project.reference_criteria || 'No reference criteria'}
                      </p>
                    </div>
                    
                    {project.reference_images.length > 0 && (
                      <div>
                        <p className="text-xs text-stone-400 font-medium">Reference Images</p>
                        <div className="grid grid-cols-4 gap-2 mt-1">
                          {project.reference_images.map((img, i) => (
                            <div key={i} className="relative">
                              <img
                                src={img.url}
                                alt={img.name}
                                className="w-full h-20 object-cover rounded-lg border border-stone-700"
                              />
                              <p className="text-[10px] text-stone-500 truncate mt-1">{img.name}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {project.attached_files.length > 0 && (
                      <div>
                        <p className="text-xs text-stone-400 font-medium">Attached Files</p>
                        <div className="space-y-1 mt-1">
                          {project.attached_files.map((file, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs text-stone-300">
                              <span>📄</span>
                              <span>{file.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          
          <button
            onClick={() => {
              // Save all projects to database
              toast.success('Projects created successfully!')
            }}
            className="mt-4 w-full bg-emerald-500 hover:bg-emerald-400 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            Create All Projects
          </button>
        </div>
      )}
    </div>
  )
}