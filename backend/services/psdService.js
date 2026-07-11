import { writePsd } from 'ag-psd'
import sharp from 'sharp'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { fileURLToPath } from 'url'
import { removeBackground } from './replicateService.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ============================================================
// Build a genuine multi-layer .psd from a single generated image.
//
// There is no model that outputs a native layered PSD directly from a
// prompt (as of mid-2026) — that's simply not a thing image generators do.
// The real-world pattern is a 2-step pipeline:
//   1. Segment the flat image into separate transparent elements
//      (here: a background-removal pass to isolate the product/subject)
//   2. Assemble those elements into an actual .psd file server-side
//
// This gets you a genuinely editable "Background" + "Product Cutout"
// layer split — swap the background or move the product without
// regenerating the whole image. It does NOT reconstruct editable text
// layers or multi-object segmentation; that would need a more advanced
// segmentation model as a follow-up if you need finer-grained layers.
// ============================================================
export async function buildLayeredPsd(imageUrl, { name = 'generated' } = {}) {
  console.log('📐 Building layered PSD from generated image...')

  // 1. Get an absolute URL for Replicate to fetch (it can't reach our
  //    local /uploads path), then run background removal to isolate
  //    the product/subject as a transparent cutout.
  const absoluteUrl = toAbsoluteUrl(imageUrl)
  const cutoutUrl = await removeBackground(absoluteUrl)

  // 2. Download both images and decode to raw RGBA pixel buffers at
  //    matching dimensions (ag-psd writes layers from raw pixel data).
  const [baseBuffer, cutoutBuffer] = await Promise.all([
    downloadBuffer(absoluteUrl),
    downloadBuffer(cutoutUrl),
  ])

  const baseImage = sharp(baseBuffer).ensureAlpha()
  const baseMeta = await baseImage.metadata()
  const { width, height } = baseMeta

  const baseRaw = await baseImage.raw().toBuffer()
  const cutoutRaw = await sharp(cutoutBuffer)
    .ensureAlpha()
    .resize(width, height, { fit: 'fill' }) // match canvas exactly
    .raw()
    .toBuffer()

  // 3. Assemble the .psd with two real, independently-editable layers.
  const psd = {
    width,
    height,
    children: [
      {
        name: 'Background',
        imageData: { data: new Uint8ClampedArray(baseRaw), width, height },
        top: 0,
        left: 0,
      },
      {
        name: 'Product Cutout',
        imageData: { data: new Uint8ClampedArray(cutoutRaw), width, height },
        top: 0,
        left: 0,
      },
    ],
  }

  const psdBuffer = writePsd(psd)

  const uploadDir = path.join(__dirname, '..', 'uploads', 'psd')
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true })
  }

  const filename = `${name.replace(/[^a-z0-9-_]/gi, '_')}-${uuidv4()}.psd`
  const filepath = path.join(uploadDir, filename)
  fs.writeFileSync(filepath, Buffer.from(psdBuffer))

  console.log('✅ Layered PSD written:', filename)

  return {
    psdUrl: `/uploads/psd/${filename}`,
    layers: ['Background', 'Product Cutout'],
  }
}

function toAbsoluteUrl(url) {
  if (/^https?:\/\//i.test(url)) return url
  const base = process.env.PUBLIC_BASE_URL
  if (!base) {
    throw new Error(
      'PUBLIC_BASE_URL is not set — Replicate needs a publicly reachable URL to fetch the generated image for background removal. Set PUBLIC_BASE_URL to your backend\'s public URL (e.g. https://your-app.onrender.com).'
    )
  }
  return `${base.replace(/\/$/, '')}${url}`
}

async function downloadBuffer(url) {
  const response = await axios({ method: 'GET', url, responseType: 'arraybuffer', timeout: 30000 })
  return Buffer.from(response.data)
}