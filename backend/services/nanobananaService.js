// services/nanobananaService.js
import { config } from '../config/index.js'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let apiClient = null

function getApiClient() {
  if (!apiClient) {
    apiClient = axios.create({
      baseURL: config.nanobanana.baseUrl,
      headers: {
        'Authorization': `Bearer ${config.nanobanana.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 120000,
    })
  }
  return apiClient
}

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

/**
 * Generate image using Nano Banana 2 API with IMAGE-TO-IMAGE support
 */
export async function generateWithNanoBanana(prompt, options = {}) {
  const client = getApiClient()
  const {
    referenceImage = null,
    negativePrompt = '',
    width = 1024,
    height = 1024,
    style = 'photorealistic',
    steps = 30,
    cfgScale = 7.5,
    seed = null,
    enhancePrompt = false,
    strength = 0.85,  // HIGHER = preserve more of the original image
  } = options

  console.log('🎨 Generating image with Nano Banana 2...')
  console.log(`   User prompt: ${prompt.substring(0, 100)}...`)
  console.log(`   Style: ${style}`)
  console.log(`   Dimensions: ${width}x${height}`)
  
  if (referenceImage) {
    console.log(`   📸 Reference image provided: ${referenceImage.substring(0, 80)}...`)
    console.log(`   🎯 Image-to-image strength: ${strength} (higher = more preservation)`)

    // Verify the reference image is accessible
    try {
      const checkResponse = await axios.head(referenceImage, { timeout: 5000 })
      console.log(`   ✅ Reference image is accessible (${checkResponse.status})`)
    } catch (err) {
      console.warn(`   ⚠️ Reference image may not be accessible: ${err.message}`)
    }
  }

  try {
    const requestBody = {
      prompt: prompt,
      negative_prompt: negativePrompt,
      width: width,
      height: height,
      style: style,
      steps: steps,
      cfg_scale: cfgScale,
      enhance_prompt: enhancePrompt,
    }

    if (seed !== null) {
      requestBody.seed = seed
    }

    // IMAGE-TO-IMAGE MODE - Use reference image as source for editing
    if (referenceImage) {
      requestBody.image = referenceImage  // The source image to edit
      requestBody.strength = strength  // How much to change (0.85 = 15% change, 85% preserve)
      requestBody.guidance_scale = 1.5  // How closely to follow the prompt
      requestBody.mode = 'image-to-image'  // Explicitly set image-to-image mode
    }

    console.log('   📤 Sending request to Nano Banana 2...')
    const response = await client.post('/generations', requestBody)

    if (!response.data || !response.data.images || response.data.images.length === 0) {
      throw new Error('No images returned from Nano Banana 2')
    }

    const imageUrl = response.data.images[0]
    console.log('✅ Nano Banana 2 generated image')

    // Download and save locally
    const localUrl = await downloadAndSaveImage(imageUrl, 'png')

    return {
      success: true,
      url: localUrl,
      provider: 'nanobanana',
      model: config.nanobanana.model,
      seed: response.data.seed || null,
      used_image_to_image: !!referenceImage,
      strength: strength,
    }
  } catch (err) {
    console.error('❌ Nano Banana 2 generation failed:', err.message)
    if (err.response) {
      console.error('   Status:', err.response.status)
      console.error('   Data:', JSON.stringify(err.response.data, null, 2))
    }
    throw new Error(`Nano Banana 2 generation failed: ${err.message}`)
  }
}

/**
 * Generate image with fallback to Replicate if Nano Banana 2 fails
 */
export async function generateImage(prompt, options = {}, fallbackToReplicate = true) {
  // Try Nano Banana 2 first if API key is configured
  if (config.nanobanana.apiKey) {
    try {
      return await generateWithNanoBanana(prompt, options)
    } catch (err) {
      console.warn('⚠️ Nano Banana 2 failed, trying fallback...')
      if (!fallbackToReplicate) {
        throw err
      }
    }
  }

  // Fallback to Replicate
  if (fallbackToReplicate && config.replicate.apiKey) {
    try {
      const { generateImageWithReplicate } = await import('./replicateService.js')
      const modelName = options.model || process.env.REPLICATE_IMAGE_MODEL || 'flux-dev'
      return await generateImageWithReplicate(prompt, modelName, options.referenceImage)
    } catch (err) {
      console.error('❌ Fallback generation failed:', err.message)
      throw err
    }
  }

  throw new Error('No image generation service available')
}

/**
 * Check Nano Banana 2 API health
 */
export async function checkNanoBananaHealth() {
  try {
    const client = getApiClient()
    const response = await client.get('/health')
    return { status: 'healthy', data: response.data }
  } catch (err) {
    return { 
      status: 'unhealthy', 
      error: err.message,
      code: err.response?.status 
    }
  }
}

/**
 * Get available styles from Nano Banana 2
 */
export async function getAvailableStyles() {
  try {
    const client = getApiClient()
    const response = await client.get('/styles')
    return response.data.styles || []
  } catch (err) {
    console.warn('Could not fetch styles:', err.message)
    return ['photorealistic', 'digital_art', 'anime', 'oil_painting', 'watercolor']
  }
}