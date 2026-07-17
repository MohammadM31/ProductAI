// services/nanobananaService.js
//
// "Nano Banana" is Google's Gemini 2.5 Flash Image model. It is served
// through Replicate (model: google/nano-banana) using our Replicate
// credentials — there is no standalone api.nanobanana.ai service.
// This module takes the user's reference image + their request text
// and asks Nano Banana to apply that request directly onto the image.
import { config } from '../config/index.js'
import { generateImageWithReplicate } from './replicateService.js'

/**
 * Generate/edit an image using Nano Banana (google/nano-banana on Replicate).
 * If a reference image is supplied, Nano Banana edits that image according
 * to the prompt. Without one, it generates a fresh image from the prompt.
 */
export async function generateWithNanoBanana(prompt, options = {}) {
  const { referenceImage = null } = options

  console.log('🍌 Generating image with Nano Banana...')
  console.log(`   User request: ${prompt.substring(0, 100)}...`)
  console.log(`   Reference image: ${referenceImage ? referenceImage.substring(0, 80) + '...' : 'None (text-to-image)'}`)

  const result = await generateImageWithReplicate(prompt, 'nano-banana', referenceImage)

  return {
    success: true,
    url: result.url,
    provider: 'nanobanana',
    model: config.nanobanana.model,
    used_image_to_image: !!result.used_reference,
  }
}

/**
 * Generate an image with Nano Banana, falling back to other Replicate
 * models if Nano Banana itself fails for some reason.
 */
export async function generateImage(prompt, options = {}, fallbackToReplicate = true) {
  if (!config.replicate.apiKey) {
    throw new Error('No image generation service available (REPLICATE_API_TOKEN / REPLICATE_API_KEY is not set)')
  }

  try {
    return await generateWithNanoBanana(prompt, options)
  } catch (err) {
    console.warn('⚠️ Nano Banana failed:', err.message)
    if (!fallbackToReplicate) {
      throw err
    }
  }

  // Fallback to other Replicate models if Nano Banana itself errors out
  try {
    const { generateImageWithFallback } = await import('./replicateService.js')
    return await generateImageWithFallback(prompt, ['flux-dev', 'sdxl'], options.referenceImage || null)
  } catch (err) {
    console.error('❌ Fallback generation failed:', err.message)
    throw err
  }
}

/**
 * Check Nano Banana availability. Since it runs through Replicate, this
 * just confirms Replicate credentials are configured.
 */
export async function checkNanoBananaHealth() {
  if (!config.replicate.apiKey) {
    return { status: 'unhealthy', error: 'REPLICATE_API_TOKEN / REPLICATE_API_KEY is not set' }
  }
  return { status: 'healthy', model: config.nanobanana.model }
}