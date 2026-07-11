import { Router } from 'express'
import multer from 'multer'
import { 
  processVoice, 
  processText, 
  iterateRequest, 
  confirmOutput,
  previewProjectMapping,
  getMyOutputs,
  debugImageContent,
  debugAllOutputs,
  getPersonalizedSuggestions
} from '../controllers/requestController.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) cb(null, true)
    else cb(new Error('Only audio files are allowed'))
  },
})

// All routes require authentication
router.post('/voice', requireAuth, upload.single('audio'), processVoice)
router.post('/text', requireAuth, processText)
router.post('/iterate', requireAuth, iterateRequest)
router.post('/confirm', requireAuth, confirmOutput)
router.post('/preview-project', requireAuth, previewProjectMapping)
router.get('/my-outputs', requireAuth, getMyOutputs)
router.get('/suggestions', requireAuth, getPersonalizedSuggestions)

// Debug routes
router.get('/debug-image/:output_id', requireAuth, debugImageContent)
router.get('/debug-outputs', requireAuth, debugAllOutputs)

export default router