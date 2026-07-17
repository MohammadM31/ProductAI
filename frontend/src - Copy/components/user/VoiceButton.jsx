import React, { useState } from 'react'
import { Mic, MicOff } from 'lucide-react'
import { useAudioRecorder } from '../../hooks/useAudioRecorder'

export default function VoiceButton({ onAudioReady, disabled }) {
  const { isRecording, startRecording, stopRecording } = useAudioRecorder()
  const [pressed, setPressed] = useState(false)

  const handleMouseDown = async () => {
    if (disabled) return
    setPressed(true)
    await startRecording()
  }

  const handleMouseUp = async () => {
    if (!isRecording) return
    setPressed(false)
    const blob = await stopRecording()
    if (blob && blob.size > 0) onAudioReady(blob)
  }

  const handleTouchStart = async (e) => {
    e.preventDefault()
    await handleMouseDown()
  }

  const handleTouchEnd = async (e) => {
    e.preventDefault()
    await handleMouseUp()
  }

  return (
    <button
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      disabled={disabled}
      aria-label={isRecording ? 'Release to send voice' : 'Hold to speak'}
      className={`
        relative flex-shrink-0 w-14 h-14 rounded-full flex items-center justify-center
        transition-all duration-150 select-none touch-none
        ${disabled
          ? 'bg-stone-800 text-stone-600 cursor-not-allowed'
          : isRecording
            ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/40 scale-110'
            : 'bg-amber-500 hover:bg-amber-400 text-stone-950 shadow-md hover:shadow-amber-400/30 hover:scale-105'
        }
      `}
    >
      {isRecording ? <MicOff size={22} /> : <Mic size={22} />}
      {isRecording && (
        <span className="absolute inset-0 rounded-full animate-ping bg-rose-500 opacity-30" />
      )}
    </button>
  )
}
