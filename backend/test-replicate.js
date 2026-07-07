import 'dotenv/config'
import Replicate from 'replicate'
import { config } from './config/index.js'

async function testReplicate() {
  console.log('🧪 Testing Replicate...')
  console.log('API Key:', config.replicate.apiKey ? '✅ Set' : '❌ Missing')
  
  const replicate = new Replicate({
    auth: config.replicate.apiKey,
  })

  try {
    console.log('Generating test image...')
    const output = await replicate.run(
      'black-forest-labs/flux-schnell',
      {
        input: {
          prompt: 'A beautiful sunset over the ocean',
          num_outputs: 1,
          aspect_ratio: '1:1',
        }
      }
    )
    
    console.log('Output type:', typeof output)
    console.log('Is array:', Array.isArray(output))
    console.log('Output:', JSON.stringify(output).substring(0, 200))
    
    let url = null
    if (Array.isArray(output) && output.length > 0) {
      url = output[0]
    } else if (typeof output === 'string') {
      url = output
    }
    
    console.log('URL:', url)
    
  } catch (err) {
    console.error('❌ Error:', err.message)
    console.error(err)
  }
}

testReplicate()