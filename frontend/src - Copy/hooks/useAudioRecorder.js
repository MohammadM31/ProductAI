import { useRef, useState, useCallback } from 'react'

export function useAudioRecorder() {
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const [isRecording, setIsRecording] = useState(false)

  const startRecording = useCallback(async () => {
    chunksRef.current = []
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mr.start(100)
    mediaRecorderRef.current = mr
    setIsRecording(true)
  }, [])

  const stopRecording = useCallback(() => {
    return new Promise((resolve) => {
      const mr = mediaRecorderRef.current
      if (!mr) return resolve(null)
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        mr.stream.getTracks().forEach(t => t.stop())
        setIsRecording(false)
        resolve(blob)
      }
      mr.stop()
    })
  }, [])

  return { isRecording, startRecording, stopRecording }
}
