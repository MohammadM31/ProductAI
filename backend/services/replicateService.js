import Replicate from 'replicate'
import { config } from '../config/index.js'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let replicateClient = null

function getReplicate() {
  if (!replicateClient) {
    replicateClient = new Replicate({
      auth: config.replicate.apiKey,
    })
  }
  return replicateClient
}

// Function to download and save image locally
async function downloadAndSaveImage(imageUrl, extension = 'png') {
  try {
    console.log('📥 Downloading image from:', imageUrl.substring(0, 80) + '...')
    
    const uploadDir = path.join(__dirname, '..', 'uploads', 'images')
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }

    let response = null
    let attempts = 0
    while (attempts < 3 && !response) {
      try {
        response = await axios({
          method: 'GET',
          url: imageUrl,
          responseType: 'arraybuffer',
          timeout: 30000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        })
      } catch (err) {
        attempts++
        console.log(`⚠️ Download attempt ${attempts} failed:`, err.message)
        if (attempts < 3) {
          await new Promise(resolve => setTimeout(resolve, 2000))
        } else {
          throw err
        }
      }
    }

    const filename = `${uuidv4()}.${extension}`
    const filepath = path.join(uploadDir, filename)
    fs.writeFileSync(filepath, response.data)
    console.log('✅ Image saved locally:', filename)

    return `/uploads/images/${filename}`
  } catch (err) {
    console.error('❌ Failed to download image:', err.message)
    return imageUrl
  }
}

const MODEL_CONFIGS = {
  'flux-schnell': {
    version: 'black-forest-labs/flux-schnell',
    input: {
      prompt: '',
      go_fast: true,
      num_outputs: 1,
      aspect_ratio: '1:1',
      output_format: 'png',
    }
  },
  'flux-dev': {
    version: 'black-forest-labs/flux-dev',
    input: {
      prompt: '',
      num_outputs: 1,
      aspect_ratio: '1:1',
      output_format: 'png',
    }
  },
  'flux-1.1-pro': {
    version: 'black-forest-labs/flux-1.1-pro',
    input: {
      prompt: '',
      num_outputs: 1,
      aspect_ratio: '1:1',
      output_format: 'png',
    }
  },
  'sdxl': {
    version: 'stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b',
    input: {
      prompt: '',
      width: 1024,
      height: 1024,
      num_outputs: 1,
      scheduler: 'K_EULER',
      num_inference_steps: 25,
      guidance_scale: 7.5,
    }
  },
  'recraft-v4': {
    version: 'recraft-ai/recraft-v4',
    input: {
      prompt: '',
      aspect_ratio: '1:1',
    },
    outputExtension: 'png',
  },
  'recraft-v4-svg': {
    version: 'recraft-ai/recraft-v4-svg',
    input: {
      prompt: '',
      aspect_ratio: '1:1',
    },
    outputExtension: 'svg',
  },
}

// ============================================================
// Main generation function with image-to-image support
// ============================================================
export async function generateImageWithReplicate(prompt, modelName = 'flux-schnell', referenceImage = null) {
  const replicate = getReplicate()
  
  const configModel = MODEL_CONFIGS[modelName] || MODEL_CONFIGS['flux-schnell']
  
  const input = { ...configModel.input }
  input.prompt = prompt
  
  // Detect if this is a modification request
  const isModification = prompt.includes('instead of') || 
                         prompt.includes('change') || 
                         prompt.includes('remove') ||
                         prompt.includes('without')
  
  if (referenceImage) {
    console.log('🖼️ Using reference image for image generation')
    
    if (modelName.startsWith('flux')) {
      input.image = referenceImage
      // Replicate's Flux img2img field is `prompt_strength`, NOT `strength`.
      // Scale is 0 = keep the reference image as-is, 1 = ignore it completely.
      // So LOWER values keep us close to the reference; higher values let the
      // prompt override more of it.
      if (isModification) {
        input.prompt_strength = 0.4  // Changed from 0.5 to 0.4
        console.log('   Modification mode: prompt_strength 0.4 (apply the requested change, keep the rest close to reference)')
      } else {
        input.prompt_strength = 0.15  // Changed from 0.25 to 0.15
        console.log('   Replication mode: prompt_strength 0.15 (very close to reference)')
      }
      input.guidance_scale = 3.5
    }
    
    if (modelName === 'sdxl') {
      input.image = referenceImage
      input.denoising_strength = isModification ? 0.5 : 0.3
    }

    if (modelName.startsWith('recraft')) {
      console.warn('⚠️ Recraft models don\'t support direct img2img reference locking yet (needs Recraft custom-style API). Reference is being used as a text description only — for exact product/logo preservation, use a flux-* model.')
    }
  }
  
  try {
    console.log(`🎨 Generating with ${modelName}${referenceImage ? ' (with reference image)' : ''}...`)
    
    const prediction = await replicate.predictions.create({
      version: configModel.version,
      input: input,
    })
    
    console.log('📊 Prediction ID:', prediction.id)
    
    let result = prediction
    let attempts = 0
    const maxAttempts = 60
    
    while (result.status !== 'succeeded' && result.status !== 'failed' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000))
      result = await replicate.predictions.get(result.id)
      attempts++
      if (attempts % 5 === 0) {
        console.log(`⏳ Still processing... (${attempts * 2}s)`)
      }
    }
    
    if (result.status === 'failed') {
      throw new Error(`Replicate prediction failed: ${result.error || 'Unknown error'}`)
    }
    
    if (result.status !== 'succeeded') {
      throw new Error(`Replicate prediction timed out after ${maxAttempts * 2} seconds`)
    }
    
    console.log('✅ Prediction succeeded!')
    
    let imageUrl = null
    
    if (Array.isArray(result.output) && result.output.length > 0) {
      imageUrl = result.output[0]
    } else if (typeof result.output === 'string') {
      imageUrl = result.output
    } else if (result.output && typeof result.output === 'object') {
      imageUrl = result.output.url || result.output.image || result.output.image_url
    }
    
    if (!imageUrl || typeof imageUrl !== 'string' || imageUrl === '{}' || imageUrl.length < 10) {
      console.error('❌ Invalid image URL:', imageUrl)
      console.error('Full output:', JSON.stringify(result.output, null, 2))
      throw new Error('Could not extract valid image URL from Replicate response')
    }
    
    console.log('✅ Image URL extracted:', imageUrl.substring(0, 80) + '...')
    
    const localUrl = await downloadAndSaveImage(imageUrl, configModel.outputExtension || 'png')
    
    return {
      success: true,
      url: localUrl,
      model: modelName,
      used_reference: !!referenceImage,
    }
    
  } catch (err) {
    console.error('❌ Replicate generation failed:', err.message)
    throw new Error(`Image generation failed: ${err.message}`)
  }
}

// ============================================================
// Background Removal (used by the PSD layering pipeline)
// ============================================================
export async function removeBackground(imageUrl) {
  const replicate = getReplicate()

  try {
    console.log('✂️ Removing background for layer separation...')
    const prediction = await replicate.predictions.create({
      version: '851-labs/background-remover',
      input: {
        image: imageUrl,
        background_type: 'rgba',
        format: 'png',
        threshold: 0,
      },
    })

    let result = prediction
    let attempts = 0
    const maxAttempts = 30

    while (result.status !== 'succeeded' && result.status !== 'failed' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000))
      result = await replicate.predictions.get(result.id)
      attempts++
    }

    if (result.status !== 'succeeded') {
      throw new Error(`Background removal failed or timed out: ${result.error || result.status}`)
    }

    const cutoutUrl = Array.isArray(result.output) ? result.output[0] : result.output
    if (!cutoutUrl || typeof cutoutUrl !== 'string') {
      throw new Error('Background remover returned no usable output')
    }

    return cutoutUrl
  } catch (err) {
    console.error('❌ Background removal failed:', err.message)
    throw new Error(`Background removal failed: ${err.message}`)
  }
}

// ============================================================
// Fallback function
// ============================================================
export async function generateImageWithFallback(prompt, fallbackModels = ['flux-schnell', 'flux-dev', 'sdxl'], referenceImage = null) {
  let lastError = null
  
  for (const model of fallbackModels) {
    try {
      console.log(`🔄 Trying fallback model: ${model}`)
      const result = await generateImageWithReplicate(prompt, model, referenceImage)
      console.log(`✅ Success with ${model}`)
      return result
    } catch (err) {
      console.warn(`⚠️ ${model} failed:`, err.message)
      lastError = err
    }
  }
  
  throw new Error(`All models failed: ${lastError?.message || 'Unknown error'}`)
}

// ============================================================
// Health check
// ============================================================
export async function checkReplicateHealth() {
  try {
    const replicate = getReplicate()
    await replicate.predictions.create({
      version: 'black-forest-labs/flux-schnell',
      input: {
        prompt: 'test',
        num_outputs: 1,
      }
    })
    return { status: 'healthy', credits_available: true }
  } catch (err) {
    return { status: 'unhealthy', error: err.message }
  }
}