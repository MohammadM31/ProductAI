import { verifyToken } from '../services/authService.js'

export function requireAuth(req, res, next) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: no token provided' })
  }
  const token = header.slice(7)
  try {
    req.user = verifyToken(token)
    next()
  } catch {
    return res.status(401).json({ error: 'Unauthorized: invalid or expired token' })
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: insufficient permissions' })
    }
    next()
  }
}