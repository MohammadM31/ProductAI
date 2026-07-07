import 'dotenv/config'
import Replicate from 'replicate'
import { config } from './config/index.js'

async function debugReplicate() {
  console.log('🔍 Debugging Replicate...\n')
  
  const replicate = new Replicate({
    auth: config.replicate.apiKey,
  })

  try {
    console.log('📡 Creating prediction with flux-schnell...')
    
    const prediction = await replicate.predictions.create({
      version: "black-forest-labs/flux-schnell",
      input: {
        prompt: "A beautiful sunset over the ocean",
        num_outputs: 1,
      },
    })
    
    console.log('📊 Prediction created:')
    console.log('  ID:', prediction.id)
    console.log('  Status:', prediction.status)
    console.log('  URLs:', prediction.urls)
    console.log('  Output:', prediction.output)
    
    console.log('\n⏳ Waiting for completion...')
    
    // Poll until complete
    let result = prediction
    while (result.status !== 'succeeded' && result.status !== 'failed') {
      await new Promise(resolve => setTimeout(resolve, 2000))
      result = await replicate.predictions.get(result.id)
      console.log(`  Status: ${result.status}`)
    }
    
    console.log('\n📊 Final result:')
    console.log('  Status:', result.status)
    console.log('  Output type:', typeof result.output)
    console.log('  Is array:', Array.isArray(result.output))
    console.log('  Output:', JSON.stringify(result.output, null, 2))
    
    if (result.status === 'succeeded') {
      console.log('\n✅ Success! Image URL(s):')
      if (Array.isArray(result.output)) {
        result.output.forEach((item, i) => {
          console.log(`  [${i}]`, item)
        })
      } else {
        console.log('  ', result.output)
      }
    } else {
      console.log('\n❌ Failed:', result.error)
    }
    
  } catch (err) {
    console.error('❌ Error:', err.message)
    console.error(err)
  }
}

debugReplicate()