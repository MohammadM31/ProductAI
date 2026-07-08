// backend/services/deepgramService.js
import { createClient } from '@deepgram/sdk'
import { config } from '../config/index.js'

let deepgramClient = null

function getDeepGram() {
  if (!deepgramClient) {
    deepgramClient = createClient(config.deepgram.apiKey)
  }
  return deepgramClient
}

/**
 * Transcribe audio buffer using DeepGram.
 * Supports multiple audio formats (webm, mp3, wav, etc.)
 */
export async function transcribeAudio(audioBuffer, mimeType = 'audio/webm') {
  const deepgram = getDeepGram()

  try {
    const source = {
      buffer: audioBuffer,
      mimetype: mimeType,
    }

    const response = await deepgram.listen.prerecorded.transcribeFile(source, {
      model: 'nova-2', // Best general model
      smart_format: true, // Adds punctuation, capitalization
      language: 'en', // Auto-detect if you use 'auto'
      diarize: false, // Set to true if you need speaker separation
      punctuate: true,
      paragraphs: true,
    })

    const result = response.result
    const transcript = result?.results?.channels[0]?.alternatives[0]?.transcript || ''
    
    console.log('🎤 DeepGram transcription:', transcript.substring(0, 100) + '...')
    return transcript.trim()
    
  } catch (err) {
    console.error('❌ DeepGram transcription failed:', err.message)
    return null
  }
}

/**
 * Transcribe audio from a file path (optional)
 */
export async function transcribeFile(filePath) {
  const deepgram = getDeepGram()
  
  try {
    const response = await deepgram.listen.prerecorded.transcribeFile(
      { path: filePath },
      {
        model: 'nova-2',
        smart_format: true,
        language: 'en',
        punctuate: true,
      }
    )
    
    const transcript = response.result?.results?.channels[0]?.alternatives[0]?.transcript || ''
    return transcript.trim()
    
  } catch (err) {
    console.error('❌ DeepGram file transcription failed:', err.message)
    return null
  }
}

/**
 * Transcribe audio from a URL (optional)
 */
export async function transcribeUrl(audioUrl) {
  const deepgram = getDeepGram()
  
  try {
    const response = await deepgram.listen.prerecorded.transcribeUrl(
      { url: audioUrl },
      {
        model: 'nova-2',
        smart_format: true,
        language: 'en',
        punctuate: true,
      }
    )
    
    const transcript = response.result?.results?.channels[0]?.alternatives[0]?.transcript || ''
    return transcript.trim()
    
  } catch (err) {
    console.error('❌ DeepGram URL transcription failed:', err.message)
    return null
  }
}

/**
 * Check DeepGram API health
 */
export async function checkDeepGramHealth() {
  try {
    const deepgram = getDeepGram()
    // Make a small test request
    const response = await deepgram.listen.prerecorded.transcribeFile(
      { buffer: Buffer.from('test') },
      { model: 'nova-2' }
    )
    return { status: 'healthy' }
  } catch (err) {
    return { status: 'unhealthy', error: err.message }
  }
}