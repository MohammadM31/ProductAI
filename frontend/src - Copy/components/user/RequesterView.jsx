import React, { useState, useEffect, useRef } from 'react'
import { Sparkles, Loader2, ArrowLeft, Mic, Type, Info, ChevronLeft, ChevronRight, GripVertical, History, ImageIcon, FileText, User, Clock, MessageSquare, Building2 } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { requestApi } from '../../api/client'
import VoiceButton from './VoiceButton'
import OutputDisplay from './OutputDisplay'
import ChatView from '../admin/ChatView'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

export default function RequesterView() {
  const { state, dispatch } = useApp()
  const { 
    currentOutput, 
    requestStatus, 
    transcription, 
    sessionId,
    textInput: persistedTextInput,
    inputMode: persistedInputMode,
    showGuidelines: persistedShowGuidelines,
    panelWidth: persistedPanelWidth,
    user
  } = state

  const [textInput, setTextInput] = useState(persistedTextInput || '')
  const [inputMode, setInputMode] = useState(persistedInputMode || 'voice')
  const [showGuidelines, setShowGuidelines] = useState(persistedShowGuidelines !== undefined ? persistedShowGuidelines : false)
  const [panelWidth, setPanelWidth] = useState(persistedPanelWidth || 320)
  const [mappedProject, setMappedProject] = useState(null)
  const [isMapping, setIsMapping] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  
  const [showHistory, setShowHistory] = useState(false)
  const [myRequests, setMyRequests] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [selectedHistoryOutput, setSelectedHistoryOutput] = useState(null)
  const [showChatFromHistory, setShowChatFromHistory] = useState(false)

  // Personalization state
  const [suggestions, setSuggestions] = useState([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)

  const panelRef = useRef(null)
  const resizeRef = useRef(null)

  const isProcessing = requestStatus === 'processing' || requestStatus === 'iterating'

  // Load personalized suggestions
  useEffect(() => {
    if (user) {
      loadPersonalizedSuggestions()
    }
  }, [user])

  const loadPersonalizedSuggestions = async () => {
    setLoadingSuggestions(true)
    try {
      const response = await requestApi.getSuggestions()
      setSuggestions(response.suggestions || [])
    } catch (err) {
      console.error('Failed to load suggestions:', err)
      // Fallback to default suggestions
      setSuggestions([])
    } finally {
      setLoadingSuggestions(false)
    }
  }

  useEffect(() => {
    dispatch({ type: 'SET_TEXT_INPUT', payload: textInput })
  }, [textInput, dispatch])

  useEffect(() => {
    dispatch({ type: 'SET_INPUT_MODE', payload: inputMode })
  }, [inputMode, dispatch])

  useEffect(() => {
    dispatch({ type: 'SET_SHOW_GUIDELINES', payload: showGuidelines })
  }, [showGuidelines, dispatch])

  useEffect(() => {
    dispatch({ type: 'SET_PANEL_WIDTH', payload: panelWidth })
  }, [panelWidth, dispatch])

  // Auto-map when user types
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (textInput.trim().length > 3) {
        setIsMapping(true)
        try {
          const response = await requestApi.mapRequest(textInput)
          setMappedProject(response.project)
        } catch (err) {
          setMappedProject(null)
        } finally {
          setIsMapping(false)
        }
      } else {
        setMappedProject(null)
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [textInput])

  useEffect(() => {
    if (showHistory) {
      loadMyRequests()
    }
  }, [showHistory])

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return
      
      const newWidth = e.clientX
      if (newWidth >= 200 && newWidth <= 500) {
        setPanelWidth(newWidth)
      }
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      document.body.style.cursor = 'default'
      document.body.style.userSelect = 'none'
    }

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'default'
      document.body.style.userSelect = 'auto'
    }
  }, [isResizing])

  const loadMyRequests = async () => {
    setHistoryLoading(true)
    try {
      const data = await requestApi.getMyOutputs()
      setMyRequests(data.outputs || [])
    } catch (err) {
      console.error('Failed to load my requests:', err)
      setMyRequests([])
    } finally {
      setHistoryLoading(false)
    }
  }

  const loadIntoChat = (output) => {
    setSelectedHistoryOutput(output)
    setShowChatFromHistory(true)
    setShowHistory(false)
  }

  const handleAudio = async (audioBlob) => {
    dispatch({ type: 'SET_REQUEST_STATUS', payload: 'processing' })
    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, 'recording.webm')
      formData.append('session_id', sessionId)

      const result = await requestApi.sendVoice(formData)
      dispatch({ type: 'SET_TRANSCRIPTION', payload: result.transcription })
      dispatch({ type: 'SET_ORIGINAL_REQUEST', payload: result.transcription })
      dispatch({ type: 'SET_CURRENT_OUTPUT', payload: result })
      if (showHistory) loadMyRequests()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Voice processing failed')
      dispatch({ type: 'SET_REQUEST_STATUS', payload: 'idle' })
    }
  }

  const handleTextSubmit = async () => {
    if (!textInput.trim()) return
    const text = textInput.trim()
    setTextInput('')
    dispatch({ type: 'SET_TEXT_INPUT', payload: '' })
    dispatch({ type: 'SET_REQUEST_STATUS', payload: 'processing' })
    dispatch({ type: 'SET_ORIGINAL_REQUEST', payload: text })
    try {
      const result = await requestApi.sendText(text, sessionId, mappedProject?.id)
      dispatch({ type: 'SET_CURRENT_OUTPUT', payload: result })
      // Reload suggestions after making a request
      loadPersonalizedSuggestions()
      if (showHistory) loadMyRequests()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Request failed')
      dispatch({ type: 'SET_REQUEST_STATUS', payload: 'idle' })
    }
  }

  const handleIterate = async (feedback) => {
    dispatch({ type: 'SET_REQUEST_STATUS', payload: 'iterating' })
    try {
      const result = await requestApi.iterate(currentOutput.output_id, feedback, sessionId)
      dispatch({ type: 'SET_CURRENT_OUTPUT', payload: result })
      loadPersonalizedSuggestions()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Revision failed')
      dispatch({ type: 'SET_REQUEST_STATUS', payload: 'done' })
    }
  }

  const handleConfirm = async () => {
    try {
      await requestApi.confirm(currentOutput.output_id)
      toast.success('Sent to department for review!')
      dispatch({ type: 'CLEAR_OUTPUT' })
      setTextInput('')
      dispatch({ type: 'SET_TEXT_INPUT', payload: '' })
      loadPersonalizedSuggestions()
      if (showHistory) loadMyRequests()
    } catch (err) {
      toast.error('Failed to send. Please try again.')
    }
  }

  const toggleGuidelines = () => {
    setShowGuidelines(!showGuidelines)
  }

  const toggleHistory = () => {
    setShowHistory(!showHistory)
    if (!showHistory) {
      loadMyRequests()
    }
  }

  const startResize = (e) => {
    e.preventDefault()
    setIsResizing(true)
  }

  const handleNewRequest = () => {
    dispatch({ type: 'CLEAR_OUTPUT' })
    setTextInput('')
    dispatch({ type: 'SET_TEXT_INPUT', payload: '' })
    setShowChatFromHistory(false)
    setSelectedHistoryOutput(null)
  }

  const defaultSuggestions = [
    { text: 'Create a menu image for grilled salmon with lemon butter' },
    { text: 'Make an Instagram post for our summer promotion' },
    { text: 'Generate a photo for the truffle pasta dish' },
    { text: 'Create a football pitch promotional image' },
  ]

  if (showChatFromHistory && selectedHistoryOutput) {
    return (
      <ChatView
        output={selectedHistoryOutput}
        project={{ name: selectedHistoryOutput.project_name || 'Previous Request' }}
        onBack={() => {
          setShowChatFromHistory(false)
          setSelectedHistoryOutput(null)
          setShowHistory(true)
        }}
      />
    )
  }

  if (isProcessing) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
        <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
          <Loader2 size={28} className="text-amber-400 animate-spin" />
        </div>
        <div>
          <p className="text-white font-semibold">
            {requestStatus === 'iterating' ? 'Revising output…' : 'Generating output…'}
          </p>
          {transcription && requestStatus === 'processing' && (
            <p className="text-stone-400 text-sm mt-1 max-w-xs">"{transcription}"</p>
          )}
        </div>
        <p className="text-stone-500 text-xs">This may take a few seconds for images.</p>
      </div>
    )
  }

  if (currentOutput && requestStatus === 'done') {
    return (
      <div className="flex flex-col h-full overflow-y-auto px-4 py-6 max-w-2xl mx-auto w-full">
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={handleNewRequest}
            className="flex items-center gap-2 text-stone-400 hover:text-stone-200 text-sm transition-colors"
          >
            <ArrowLeft size={16} /> New Request
          </button>
          <button
            onClick={toggleHistory}
            className="flex items-center gap-2 text-stone-400 hover:text-stone-200 text-sm transition-colors"
          >
            <History size={16} /> My Requests
          </button>
        </div>
        {transcription && (
          <div className="bg-stone-800 border border-stone-700 rounded-xl px-4 py-3 mb-4 text-sm text-stone-300">
            <span className="text-stone-500 text-xs mr-2">Your request:</span>
            {transcription}
          </div>
        )}
        <OutputDisplay
          output={currentOutput}
          onIterate={handleIterate}
          onConfirm={handleConfirm}
          disabled={isProcessing}
        />
      </div>
    )
  }

  // ============================================================
  // Main View with Department Display and Personalized Suggestions
  // ============================================================
  return (
    <div className="flex h-full w-full">
      {/* LEFT SIDE - Guidelines Panel */}
      <div
        ref={panelRef}
        className={`flex-shrink-0 border-r border-stone-700 overflow-y-auto bg-stone-900/50 transition-all duration-300 ${
          showGuidelines ? 'w-auto opacity-100' : 'w-0 opacity-0 overflow-hidden border-0'
        }`}
        style={{ width: showGuidelines ? panelWidth : 0 }}
      >
        <div className="p-4" style={{ width: panelWidth, minWidth: panelWidth }}>
          <div className="sticky top-0 bg-stone-900/80 backdrop-blur pb-3 border-b border-stone-700 mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider flex items-center gap-2">
              <Info size={14} className="text-amber-400" />
              Guidelines
            </h3>
            
            <button
              onClick={toggleGuidelines}
              className="p-1 hover:bg-stone-700 rounded transition-colors group"
              title="Hide guidelines panel"
            >
              <ChevronLeft size={16} className="text-stone-400 group-hover:text-stone-200" />
            </button>
          </div>

          {isMapping ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 size={20} className="text-amber-400 animate-spin" />
              <span className="text-xs text-stone-400 ml-2">Mapping request...</span>
            </div>
          ) : mappedProject ? (
            <div className="space-y-4">
              {/* Department Badge */}
              <div className="flex items-center gap-2 bg-stone-800 rounded-lg px-3 py-2 border border-stone-700">
                <Building2 size={14} className="text-amber-400" />
                <span className="text-xs text-stone-300">
                  Department: <span className="font-medium text-white">
                    {mappedProject.department || 'Unassigned'}
                  </span>
                </span>
              </div>

              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                <p className="text-sm font-semibold text-amber-400">{mappedProject.name}</p>
                <p className="text-xs text-stone-400 mt-1">{mappedProject.description}</p>
              </div>

              <div>
                <p className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-2">Guidelines</p>
                <div className="bg-stone-800 rounded-lg p-3 max-h-40 overflow-y-auto">
                  <p className="text-xs text-stone-300 leading-relaxed whitespace-pre-wrap">
                    {mappedProject.system_prompt || 'No guidelines set for this project.'}
                  </p>
                </div>
              </div>

              {mappedProject.reference_criteria && (
                <div>
                  <p className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-2">Criteria</p>
                  <div className="bg-stone-800/50 rounded-lg p-3">
                    <p className="text-xs text-stone-300 leading-relaxed whitespace-pre-wrap">
                      {mappedProject.reference_criteria}
                    </p>
                  </div>
                </div>
              )}

              {mappedProject.reference_images && mappedProject.reference_images.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-2">
                    Images ({mappedProject.reference_images.length})
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {mappedProject.reference_images.slice(0, 6).map((img, i) => (
                      <img
                        key={i}
                        src={img.url}
                        alt={img.name}
                        className="w-full h-20 object-cover rounded-lg border border-stone-700"
                      />
                    ))}
                    {mappedProject.reference_images.length > 6 && (
                      <div className="w-full h-20 rounded-lg border border-stone-700 bg-stone-800 flex items-center justify-center text-xs text-stone-400">
                        +{mappedProject.reference_images.length - 6}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {mappedProject.attached_files && mappedProject.attached_files.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-2">
                    Files ({mappedProject.attached_files.length})
                  </p>
                  <div className="space-y-1">
                    {mappedProject.attached_files.map((file, i) => (
                      <div key={i} className="bg-stone-800 rounded-lg px-3 py-1.5 text-xs text-stone-300 flex items-center gap-2">
                        <span>📄</span>
                        <span className="truncate">{file.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="text-xs text-stone-500 mt-2 pt-2 border-t border-stone-700">
                <span>✅ Matched to: {mappedProject.name}</span>
                {mappedProject.department && (
                  <span className="block text-stone-600">
                    📋 Department: {mappedProject.department}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <Info size={32} className="text-stone-600 mb-3 opacity-30" />
              <p className="text-xs text-stone-500">Start typing your request</p>
              <p className="text-xs text-stone-600 mt-1">AI will automatically find the right project</p>
            </div>
          )}
        </div>
      </div>

      {/* Resize Handle */}
      {showGuidelines && (
        <div
          ref={resizeRef}
          className="flex-shrink-0 w-1 hover:w-1.5 bg-transparent hover:bg-amber-500/50 cursor-col-resize transition-all duration-150 flex items-center justify-center group relative"
          onMouseDown={startResize}
          style={{ cursor: 'col-resize' }}
        >
          <div className="absolute inset-y-0 flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
            <GripVertical size={14} className="text-amber-400" />
          </div>
        </div>
      )}

      {/* RIGHT SIDE - Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-8 max-w-2xl mx-auto relative">
        <div className="absolute top-4 right-4">
          <button
            onClick={toggleHistory}
            className="flex items-center gap-2 text-stone-400 hover:text-stone-200 text-sm transition-colors bg-stone-800 hover:bg-stone-700 px-3 py-2 rounded-lg border border-stone-700"
          >
            <History size={16} />
            My Requests
            {myRequests.length > 0 && (
              <span className="bg-amber-500/20 text-amber-400 text-xs px-2 py-0.5 rounded-full ml-1">
                {myRequests.length}
              </span>
            )}
          </button>
        </div>

        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 mb-4">
            <Sparkles size={28} className="text-amber-400" />
          </div>
          <h2 className="text-2xl font-bold text-white">What do you need?</h2>
          <p className="text-stone-400 text-sm mt-2">
            Speak or type your request — the AI will automatically route it to the right department.
          </p>
          {suggestions.length > 0 && (
            <p className="text-xs text-stone-500 mt-1">
              💡 Personalized based on your frequent requests
            </p>
          )}
        </div>

        {/* Personalized Suggestions */}
        <div className="grid grid-cols-1 gap-2 w-full text-sm">
          {loadingSuggestions ? (
            <div className="text-stone-400 text-center py-4 flex items-center justify-center gap-2">
              <Loader2 size={16} className="animate-spin text-amber-400" />
              Loading suggestions...
            </div>
          ) : suggestions.length > 0 ? (
            suggestions.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => {
                  setTextInput(suggestion.text)
                  setInputMode('text')
                }}
                className="text-left bg-stone-800/50 border border-stone-700 hover:border-amber-500/40 hover:bg-stone-800 rounded-xl px-4 py-3 text-stone-400 hover:text-stone-200 transition-all group"
              >
                <div className="flex items-center gap-2">
                  {suggestion.frequency && (
                    <span className="text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full flex-shrink-0">
                      ⭐ {suggestion.frequency}x
                    </span>
                  )}
                  <span className="truncate">{suggestion.text}</span>
                </div>
              </button>
            ))
          ) : (
            // Fallback to default suggestions
            <>
              <button
                onClick={() => {
                  setTextInput('Create a menu image for grilled salmon with lemon butter')
                  setInputMode('text')
                }}
                className="text-left bg-stone-800/50 border border-stone-700 hover:border-amber-500/40 hover:bg-stone-800 rounded-xl px-4 py-3 text-stone-400 hover:text-stone-200 transition-all"
              >
                📸 "Create a menu image for grilled salmon with lemon butter"
              </button>
              <button
                onClick={() => {
                  setTextInput('Make an Instagram post for our summer promotion')
                  setInputMode('text')
                }}
                className="text-left bg-stone-800/50 border border-stone-700 hover:border-amber-500/40 hover:bg-stone-800 rounded-xl px-4 py-3 text-stone-400 hover:text-stone-200 transition-all"
              >
                📱 "Make an Instagram post for our summer promotion"
              </button>
              <button
                onClick={() => {
                  setTextInput('Generate a photo for the truffle pasta dish')
                  setInputMode('text')
                }}
                className="text-left bg-stone-800/50 border border-stone-700 hover:border-amber-500/40 hover:bg-stone-800 rounded-xl px-4 py-3 text-stone-400 hover:text-stone-200 transition-all"
              >
                🍝 "Generate a photo for the truffle pasta dish"
              </button>
              <button
                onClick={() => {
                  setTextInput('Create a football pitch promotional image')
                  setInputMode('text')
                }}
                className="text-left bg-stone-800/50 border border-stone-700 hover:border-amber-500/40 hover:bg-stone-800 rounded-xl px-4 py-3 text-stone-400 hover:text-stone-200 transition-all"
              >
                ⚽ "Create a football pitch promotional image"
              </button>
            </>
          )}
        </div>

        <div className="w-full space-y-4">
          <div className="flex items-center gap-2 bg-stone-800 rounded-full p-1 w-fit mx-auto">
            <button
              onClick={() => setInputMode('voice')}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                inputMode === 'voice' ? 'bg-amber-500 text-stone-950' : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              <Mic size={14} /> Voice
            </button>
            <button
              onClick={() => setInputMode('text')}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                inputMode === 'text' ? 'bg-amber-500 text-stone-950' : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              <Type size={14} /> Text
            </button>
          </div>

          {inputMode === 'voice' ? (
            <div className="flex flex-col items-center gap-3">
              <VoiceButton onAudioReady={handleAudio} disabled={isProcessing} />
              <p className="text-stone-500 text-xs">Hold to record, release to send</p>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={textInput}
                onChange={e => setTextInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleTextSubmit()}
                placeholder="Describe what you need…"
                className="flex-1 bg-stone-800 border border-stone-700 rounded-xl px-4 py-3 text-sm text-white placeholder-stone-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 transition"
              />
              <button
                onClick={handleTextSubmit}
                disabled={!textInput.trim() || isMapping}
                className="bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-stone-950 font-semibold px-6 py-3 rounded-xl transition-colors text-sm"
              >
                Send
              </button>
            </div>
          )}
        </div>
      </div>

      {/* GUIDELINES TOGGLE BUTTON */}
      {!showGuidelines && (
        <button
          onClick={toggleGuidelines}
          className="fixed left-0 top-1/2 -translate-y-1/2 z-50 bg-stone-800 hover:bg-stone-700 border border-stone-700 border-l-0 rounded-r-lg px-3 py-4 transition-colors flex flex-col items-center gap-1 group shadow-lg"
          title="Show guidelines"
        >
          <ChevronRight size={18} className="text-amber-400 group-hover:text-amber-300" />
          <span className="text-[10px] text-stone-400 writing-mode-vertical font-medium">Guidelines</span>
        </button>
      )}

      {/* MY REQUESTS SIDEBAR */}
      <div
        className={`fixed inset-y-0 right-0 w-96 bg-stone-900 border-l border-stone-700 shadow-2xl transform transition-transform duration-300 z-50 ${
          showHistory ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between px-4 py-4 border-b border-stone-700 flex-shrink-0">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <History size={16} className="text-amber-400" />
              My Requests
              {myRequests.length > 0 && (
                <span className="text-xs text-stone-400 font-normal ml-1">
                  ({myRequests.length})
                </span>
              )}
            </h3>
            <button
              onClick={toggleHistory}
              className="p-2 rounded-lg hover:bg-stone-700 text-stone-400 hover:text-stone-200 transition-colors"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {historyLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 size={20} className="text-amber-400 animate-spin" />
                <span className="text-xs text-stone-400 ml-2">Loading...</span>
              </div>
            ) : myRequests.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center px-4 text-stone-500">
                <History size={32} className="mb-3 opacity-30" />
                <p className="text-sm">No requests yet</p>
                <p className="text-xs mt-1">Your confirmed requests will appear here</p>
              </div>
            ) : (
              <div className="divide-y divide-stone-800">
                {myRequests.map(out => (
                  <div
                    key={out.id}
                    className="px-4 py-3 hover:bg-stone-800 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {out.output_type === 'image'
                        ? <ImageIcon size={12} className="text-amber-400 flex-shrink-0" />
                        : <FileText size={12} className="text-blue-400 flex-shrink-0" />
                      }
                      <span className="text-xs text-stone-400">
                        {out.created_at ? format(new Date(out.created_at), 'MMM d, HH:mm') : ''}
                      </span>
                      <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 ml-auto">
                        Sent
                      </span>
                    </div>
                    
                    <p className="text-xs text-stone-300 truncate mb-2 line-clamp-2">
                      {out.original_request || 'No description'}
                    </p>
                    
                    <button
                      onClick={() => loadIntoChat(out)}
                      className="w-full flex items-center justify-center gap-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs px-3 py-1.5 rounded-lg transition-colors border border-amber-500/20"
                    >
                      <MessageSquare size={12} />
                      Load in Chat to Continue Working
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showHistory && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={toggleHistory}
        />
      )}
    </div>
  )
}