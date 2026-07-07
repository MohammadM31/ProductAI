import OpenAI from 'openai'
import { config } from '../config/index.js'
import { Readable } from 'stream'

let openaiClient = null

function getOpenAI() {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: config.openai.apiKey })
  }
  return openaiClient
}

/**
 * Transcribe audio buffer using OpenAI Whisper.
 * Whisper auto-detects the language (multilingual).
 */
export async function transcribeAudio(audioBuffer, mimeType = 'audio/webm') {
  const openai = getOpenAI()

  // Whisper requires a file-like object. Create a readable stream from buffer.
  const ext = mimeType.includes('mp4') ? 'mp4'
    : mimeType.includes('mp3') ? 'mp3'
    : mimeType.includes('wav') ? 'wav'
    : 'webm'

  const file = new File([audioBuffer], `audio.${ext}`, { type: mimeType })

  const transcription = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    // No language specified → auto-detect (multilingual)
  })

  return transcription.text
}
