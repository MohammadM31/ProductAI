// backend/scripts/fix-reference-image-urls.js
//
// One-time repair script. Before this fix, any reference image imported via
// the department ZIP uploader (or converted from base64) was saved with a
// URL built from PUBLIC_BASE_URL, which defaulted to "http://localhost:5000"
// whenever that env var wasn't set. Those URLs are permanently baked into
// the project documents in OpenSearch and Replicate can never reach them.
//
// Run this ONCE, after you've set PUBLIC_BASE_URL correctly in your
// environment, to rewrite every project's reference_images (and
// attached_files, just in case) from the old localhost URL to the real one.
//
// Usage:
//   PUBLIC_BASE_URL=https://your-app.onrender.com node scripts/fix-reference-image-urls.js

import { config } from '../config/index.js'
import { searchDocuments, updateDocument } from '../services/databaseService.js'

const OLD_PREFIXES = [
  'http://localhost:5000',
  'https://localhost:5000',
]

async function fixReferenceImageUrls() {
  const newBase = process.env.PUBLIC_BASE_URL
  if (!newBase) {
    console.error('❌ Set PUBLIC_BASE_URL before running this script, e.g.')
    console.error('   PUBLIC_BASE_URL=https://your-app.onrender.com node scripts/fix-reference-image-urls.js')
    process.exit(1)
  }
  const cleanBase = newBase.replace(/\/$/, '')

  console.log(`🔧 Rewriting reference image URLs to use: ${cleanBase}`)

  const projects = await searchDocuments(config.indices.projects, {
    query: { match_all: {} },
    size: 500,
  })

  console.log(`📋 Found ${projects.length} project(s)`)

  let fixedProjects = 0
  let fixedImages = 0

  for (const project of projects) {
    let changed = false

    const reference_images = (project.reference_images || []).map(img => {
      if (!img.url) return img
      const badPrefix = OLD_PREFIXES.find(p => img.url.startsWith(p))
      if (!badPrefix) return img
      changed = true
      fixedImages++
      return { ...img, url: cleanBase + img.url.slice(badPrefix.length) }
    })

    if (changed) {
      await updateDocument(config.indices.projects, project.id, { reference_images })
      console.log(`✅ Fixed ${project.name} (${reference_images.length} reference image(s))`)
      fixedProjects++
    }
  }

  console.log(`\n✅ Done. Fixed ${fixedImages} image URL(s) across ${fixedProjects} project(s).`)
  if (fixedProjects === 0) {
    console.log('ℹ️  No broken URLs found — either already fixed, or none were imported before this patch.')
  }
}

fixReferenceImageUrls().catch(err => {
  console.error('❌ Migration failed:', err)
  process.exit(1)
})