import { validateCredentials, generateToken } from '../services/authService.js'

export async function login(req, res) {
  const { email, password } = req.body
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
  }

  const user = await validateCredentials(email, password)
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }

  const token = generateToken(user)
  return res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      department_id: user.department_id,
    },
  })
}

export async function me(req, res) {
  return res.json({ user: req.user })
}
