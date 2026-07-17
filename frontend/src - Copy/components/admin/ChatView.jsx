import React, { useState, useEffect, useRef } from 'react'
import { Send, Download, ArrowLeft, Loader2, Mic, MicOff } from 'lucide-react'
import { requestApi } from '../../api/client'
import { useAudioRecorder } from '../../hooks/useAudioRecorder'
import toast from 'react-hot-toast'

export default function ChatView({ output, project, onBack }) {
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const { isRecording: isAudioRecording, startRecording, stopRecording } = useAudioRecorder()
  const [isProcessingVoice, setIsProcessingVoice] = useState(false)
  const [currentOutput, setCurrentOutput] = useState(output)
  const messagesEndRef = useRef(null)

  const getFullImageUrl = (url) => {
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
    if (url.includes('replicate.delivery')) {
      return url
    }
    if (url.startsWith('data:image')) {
      return url
    }
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000'
    const baseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl
    return baseUrl + (url.startsWith('/') ? url : '/' + url)
  }

  useEffect(() => {
    if (output) {
      console.log('📋 ChatView received output:', output)
      
      const messagesList = [
        {
          id: 'user-1',
          role: 'user',
          content: output.original_request || 'No request text',
          timestamp: output.created_at || new Date().toISOString(),
        }
      ]
      
      if (output.content && output.output_type === 'image') {
        const imageUrl = getFullImageUrl(output.content)
        messagesList.push({
          id: 'assistant-old',
          role: 'assistant',
          content: imageUrl,
          timestamp: output.created_at || new Date().toISOString(),
          type: 'image',
          isOld: true,
        })
        messagesList.push({
          id: 'system-1',
          role: 'system',
          content: '📌 This is the previous version. Type a message below to generate a NEW version or make changes.',
          timestamp: new Date().toISOString(),
          type: 'system',
        })
      } else if (output.content && output.output_type === 'text') {
        messagesList.push({
          id: 'assistant-old',
          role: 'assistant',
          content: output.content,
          timestamp: output.created_at || new Date().toISOString(),
          type: 'text',
          isOld: true,
        })
        messagesList.push({
          id: 'system-1',
          role: 'system',
          content: '📌 This is the previous version. Type a message below to generate a NEW version or make changes.',
          timestamp: new Date().toISOString(),
          type: 'system',
        })
      } else {
        messagesList.push({
          id: 'system-1',
          role: 'system',
          content: '💡 Type a message below to generate an output based on this request.',
          timestamp: new Date().toISOString(),
          type: 'system',
        })
      }
      
      setMessages(messagesList)
    }
  }, [output])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async (text) => {
    if (!text?.trim() || loading) return
    
    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    }
    
    setMessages(prev => [...prev, userMessage])
    setNewMessage('')
    setLoading(true)

    try {
      let response
      
      if (currentOutput?.output_id || currentOutput?.id) {
        console.log('🔄 Iterating on output to generate NEW version:', currentOutput.id)
        response = await requestApi.iterate(
          currentOutput.output_id || currentOutput.id,
          text,
          currentOutput.session_id
        )
      } else {
        console.log('🆕 Generating new output from scratch')
        response = await requestApi.sendText(text, output?.session_id || crypto.randomUUID(), output?.project_id)
      }
      
      let content = response.content
      if (response.output_type === 'image') {
        content = getFullImageUrl(response.content)
        console.log('🔄 New image URL:', content)
      }
      
      const assistantMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: content,
        timestamp: new Date().toISOString(),
        type: response.output_type || 'image',
        isOld: false,
      }
      
      setMessages(prev => [...prev, assistantMessage])
      
      if (response.output_id) {
        setCurrentOutput({
          ...currentOutput,
          id: response.output_id,
          output_id: response.output_id,
          content: response.content,
          output_type: response.output_type,
        })
      }
      
      toast.success('New version generated!')
      
    } catch (err) {
      console.error('❌ Failed to generate:', err)
      toast.error('Failed to generate new version')
      setMessages(prev => prev.filter(m => m.id !== userMessage.id))
    } finally {
      setLoading(false)
    }
  }

  const handleVoiceRecord = async () => {
    if (isAudioRecording) {
      const blob = await stopRecording()
      if (blob && blob.size > 0) {
        await processVoiceInput(blob)
      }
    } else {
      await startRecording()
      toast.info('Recording... Click again to stop')
    }
  }

  const processVoiceInput = async (audioBlob) => {
    setIsProcessingVoice(true)
    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, 'recording.webm')
      formData.append('session_id', currentOutput?.session_id || crypto.randomUUID())

      const transcriptionResponse = await requestApi.sendVoice(formData)
      
      if (transcriptionResponse.transcription) {
        await sendMessage(transcriptionResponse.transcription)
        toast.success('Voice message sent')
      }
    } catch (err) {
      console.error('Voice processing failed:', err)
      toast.error('Failed to process voice. Please type your message.')
    } finally {
      setIsProcessingVoice(false)
    }
  }

  const exportOutput = () => {
    const lastOutput = messages
      .filter(m => m.role === 'assistant' && !m.isOld)
      .pop() || 
      messages.filter(m => m.role === 'assistant').pop()
      
    if (!lastOutput) {
      toast.error('No output to export')
      return
    }

    if (lastOutput.type === 'image') {
      fetch(lastOutput.content)
        .then(res => {
          if (!res.ok) throw new Error('Failed to fetch image')
          return res.blob()
        })
        .then(blob => {
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `${project?.name || 'output'}.png`
          a.click()
          URL.revokeObjectURL(url)
          toast.success('Image downloaded')
        })
        .catch((err) => {
          console.error('Download failed:', err)
          toast.error('Failed to download image')
        })
    } else {
      const blob = new Blob([lastOutput.content], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${project?.name || 'output'}.txt`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Text exported')
    }
  }

  return (
    <div className="flex flex-col h-full bg-stone-950">
      <div className="flex items-center justify-between px-4 py-3 border-b border-stone-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg hover:bg-stone-700 text-stone-400 hover:text-stone-200 transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h3 className="text-sm font-semibold text-white">{project?.name || 'Chat'}</h3>
            <p className="text-xs text-stone-500">Generate new versions by typing below</p>
          </div>
        </div>
        <button
          onClick={exportOutput}
          className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
        >
          <Download size={14} /> Export Latest
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => {
          if (msg.role === 'system') {
            return (
              <div key={msg.id} className="flex justify-center">
                <div className="bg-stone-800/50 border border-stone-700 rounded-xl px-4 py-2 text-xs text-stone-400 max-w-[80%] text-center">
                  {msg.content}
                </div>
              </div>
            )
          }
          
          return (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl p-4 ${
                  msg.role === 'user'
                    ? 'bg-amber-500/20 border border-amber-500/20'
                    : msg.isOld 
                      ? 'bg-stone-800/50 border border-stone-700/50 opacity-70' 
                      : 'bg-stone-800 border border-stone-700'
                }`}
              >
                {msg.type === 'image' ? (
                  <div className="rounded-lg overflow-hidden relative">
                    <img
                      src={msg.content}
                      alt={msg.isOld ? 'Previous version' : 'Newly generated output'}
                      className="w-full max-h-96 object-contain"
                      onError={(e) => {
                        console.error('❌ Image failed to load:', msg.content)
                        e.target.style.display = 'none'
                        const parent = e.target.parentElement
                        const fallback = document.createElement('div')
                        fallback.className = 'flex flex-col items-center justify-center p-8 bg-stone-800 rounded-lg'
                        fallback.innerHTML = `
                          <svg class="w-16 h-16 text-stone-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <p class="text-sm text-stone-400">Image failed to load</p>
                          <p class="text-xs text-stone-500 mt-1 break-all max-w-xs">${msg.content}</p>
                        `
                        parent.appendChild(fallback)
                      }}
                    />
                    {msg.isOld && (
                      <div className="absolute bottom-2 right-2 bg-stone-900/80 px-2 py-1 rounded text-xs text-stone-400">
                        Previous version
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-stone-200 whitespace-pre-wrap leading-relaxed">
                    {msg.content}
                  </p>
                )}
                <p className="text-xs text-stone-500 mt-2">
                  {msg.role === 'user' ? 'You' : msg.isOld ? 'Previous Output' : 'New Output'} •{' '}
                  {msg.timestamp ? new Date(msg.timestamp).toLocaleString() : 'Just now'}
                </p>
              </div>
            </div>
          )
        })}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-stone-800 border border-stone-700 rounded-2xl p-4">
              <div className="flex items-center gap-2">
                <Loader2 size={16} className="animate-spin text-amber-400" />
                <span className="text-sm text-stone-400">Generating new version...</span>
              </div>
            </div>
          </div>
        )}
        {isProcessingVoice && (
          <div className="flex justify-start">
            <div className="bg-stone-800 border border-stone-700 rounded-2xl p-4">
              <div className="flex items-center gap-2">
                <Loader2 size={16} className="animate-spin text-amber-400" />
                <span className="text-sm text-stone-400">Processing voice...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-stone-700 p-4 flex-shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage(newMessage)}
            disabled={loading || isProcessingVoice}
            placeholder="Type a message to generate a NEW version..."
            className="flex-1 bg-stone-800 border border-stone-700 rounded-xl px-4 py-3 text-sm text-white placeholder-stone-500 focus:outline-none focus:border-amber-500/50 transition"
          />
          
          <button
            onClick={handleVoiceRecord}
            disabled={loading || isProcessingVoice}
            className={`p-3 rounded-xl transition-colors ${
              isAudioRecording
                ? 'bg-rose-500 hover:bg-rose-400 text-white animate-pulse'
                : 'bg-stone-700 hover:bg-stone-600 text-stone-300 hover:text-white'
            }`}
            title={isAudioRecording ? 'Stop recording' : 'Record voice message'}
          >
            {isAudioRecording ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          
          <button
            onClick={() => sendMessage(newMessage)}
            disabled={loading || !newMessage.trim() || isProcessingVoice}
            className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-stone-950 px-4 py-3 rounded-xl transition-colors"
          >
            <Send size={18} />
          </button>
        </div>
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-stone-500">
            {isAudioRecording ? '🔴 Recording... Click mic again to send' : 'Type to generate a NEW version of the output'}
          </p>
          <p className="text-xs text-stone-500">
            {messages.filter(m => m.role === 'assistant' && !m.isOld).length} new versions generated
          </p>
        </div>
      </div>
    </div>
  )
}