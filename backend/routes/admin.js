// routes/admin.js
import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import {
  listProjects,
  getProject,
  createProjectHandler,
  updateProjectHandler,
  deleteProjectHandler,
  listDepartments,
  createDepartmentHandler,
  updateDepartmentHandler,
  deleteDepartmentHandler,
  listDepartmentUsers,
  getDepartmentUser,
  listOutputs,
  analyzeReferenceImage,
  exportOutput,
  uploadGuidelinesZipHandler,
  upload
} from '../controllers/adminController.js'

const router = Router()

// All admin routes require authentication
router.use(requireAuth)

// ============================================================
// Projects - Both admin and dept_user can access
// ============================================================
router.get('/projects', requireRole('admin', 'dept_user'), listProjects)
router.get('/projects/:id', requireRole('admin', 'dept_user'), getProject)
router.post('/projects', requireRole('admin', 'dept_user'), createProjectHandler)
router.put('/projects/:id', requireRole('admin', 'dept_user'), updateProjectHandler)
router.delete('/projects/:id', requireRole('admin', 'dept_user'), deleteProjectHandler)

// ============================================================
// Departments - Admin only (list all)
// ============================================================
router.get('/departments', requireRole('admin'), listDepartments)
router.post('/departments', requireRole('admin'), createDepartmentHandler)
router.put('/departments/:id', requireRole('admin'), updateDepartmentHandler)
router.delete('/departments/:id', requireRole('admin'), deleteDepartmentHandler)
router.get('/departments/:id/user', requireRole('admin'), getDepartmentUser)

// ============================================================
// Department Users - Admin only
// ============================================================
router.get('/department-users', requireRole('admin'), listDepartmentUsers)

// ============================================================
// Outputs (Dept Inbox) - Both admin and dept_user can access
// ============================================================
router.get('/outputs', requireRole('admin', 'dept_user'), listOutputs)

// ============================================================
// Export - Both admin and dept_user can access
// ============================================================
router.get('/outputs/:id/export', requireRole('admin', 'dept_user'), exportOutput)

// ============================================================
// Image analysis - Admin only
// ============================================================
router.post('/analyze-image', requireRole('admin', 'dept_user'), analyzeReferenceImage)

// ============================================================
// ZIP Upload - Admin only
// ============================================================
router.post(
  '/upload-guidelines-zip',
  requireRole('admin', 'dept_user'),
  upload.single('zip'),
  uploadGuidelinesZipHandler
)

export default router