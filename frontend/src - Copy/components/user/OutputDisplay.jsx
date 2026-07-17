import React, { useState } from 'react'
import { CheckCircle, RefreshCw, Send, ChevronDown, ChevronUp, ImageIcon, FileText } from 'lucide-react'

export default function OutputDisplay({ output, onIterate, onConfirm, disabled }) {
  const [feedback, setFeedback] = useState('')
  const [showPrompt, setShowPrompt] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [iterating, setIterating] = useState(false)

  const handleIterate = async () => {
    if (!feedback.trim()) return
    setIterating(true)
    try {
      await onIterate(feedback)
      setFeedback('')
    } finally {
      setIterating(false)
    }
  }

  const handleConfirm = async () => {
    setConfirming(true)
    try {
      await onConfirm()
    } finally {
      setConfirming(false)
    }
  }

  const getImageUrl = (url) => {
    if (!url) return null
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url
    }
    if (url.startsWith('/uploads/')) {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000'
      const baseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl
      return baseUrl + url
    }
    if (url.startsWith('uploads/')) {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000'
      const baseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl
      return baseUrl + '/' + url
    }
    return url
  }

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 rounded-full px-3 py-1 text-xs text-amber-400">
          {output.output_type === 'image' ? <ImageIcon size={12} /> : <FileText size={12} />}
          {output.project?.name}
        </div>
        <span className="text-xs text-stone-500">Generated output</span>
      </div>

      <div className="rounded-2xl overflow-hidden border border-stone-700 bg-stone-900">
        {output.output_type === 'image' ? (
          <div>
            <img
              src={getImageUrl(output.content)}
              alt="Generated output"
              className="w-full object-cover rounded-t-2xl"
              style={{ maxHeight: 480 }}
              onError={(e) => {
                console.error('❌ Image failed to load:', output.content)
                const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000'
                const baseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl
                if (output.content && output.content.startsWith('/uploads/')) {
                  e.target.src = baseUrl + output.content
                } else {
                  e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"%3E%3Crect width="200" height="200" fill="%231c1917"/%3E%3Ctext x="100" y="90" text-anchor="middle" fill="%23505050" font-family="sans-serif" font-size="14"%3EImage failed%3C/text%3E%3Ctext x="100" y="115" text-anchor="middle" fill="%23505050" font-family="sans-serif" font-size="12"%3Eto load%3C/text%3E%3C/svg%3E'
                }
              }}
            />
            {output.dalle_prompt && (
              <div className="border-t border-stone-700">
                <button
                  onClick={() => setShowPrompt(!showPrompt)}
                  className="w-full flex items-center justify-between px-4 py-3 text-xs text-stone-400 hover:text-stone-300 transition-colors"
                >
                  <span>View image prompt</span>
                  {showPrompt ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {showPrompt && (
                  <p className="px-4 pb-4 text-xs text-stone-500 leading-relaxed italic">
                    {output.dalle_prompt}
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="p-6 text-stone-200 text-sm leading-relaxed whitespace-pre-wrap">
            {output.content}
          </div>
        )}
      </div>

      <div className="bg-stone-900 border border-stone-700 rounded-2xl p-4 space-y-4">
        <p className="text-xs font-medium text-stone-400 uppercase tracking-wide">What would you like to do?</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={feedback}
            onChange={e => setFeedback(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleIterate()}
            disabled={disabled || iterating}
            placeholder='Request a change, e.g. "make it warmer" or "add a garnish"…'
            className="flex-1 bg-stone-800 border border-stone-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-stone-500 focus:outline-none focus:border-amber-500/50 transition"
          />
          <button
            onClick={handleIterate}
            disabled={disabled || iterating || !feedback.trim()}
            className="flex items-center gap-2 bg-stone-700 hover:bg-stone-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
          >
            <RefreshCw size={14} className={iterating ? 'animate-spin' : ''} />
            {iterating ? 'Revising…' : 'Revise'}
          </button>
        </div>
        <button
          onClick={handleConfirm}
          disabled={disabled || confirming}
          className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-stone-950 font-semibold py-3 rounded-xl transition-colors text-sm"
        >
          <Send size={15} />
          {confirming ? 'Sending to department…' : 'Confirm & Send to Department'}
        </button>
        <p className="text-xs text-stone-500 text-center">
          The Marketing Department will receive this output for final polish and publishing.
        </p>
      </div>
    </div>
  )
}