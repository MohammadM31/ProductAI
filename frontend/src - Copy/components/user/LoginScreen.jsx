import React, { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { Sparkles, Lock, Mail, AlertCircle } from 'lucide-react'

export default function LoginScreen() {
  const { login } = useApp()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-stone-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 mb-4">
            <Sparkles size={24} className="text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Creative Request Platform</h1>
          <p className="text-stone-400 text-sm mt-1">Sign in to continue</p>
        </div>

        {/* Demo credentials */}
        <div className="bg-stone-900 border border-stone-700 rounded-xl p-4 mb-6 text-xs text-stone-400 space-y-1">
          <p className="font-semibold text-stone-300 mb-2">Demo Accounts</p>
          <p><span className="text-amber-400">staff@company.com</span> / request123 — Requester</p>
          <p><span className="text-amber-400">marketing@company.com</span> / marketing123 — Marketing Dept</p>
          <p><span className="text-amber-400">admin@company.com</span> / admin123 — Admin</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-stone-900 border border-stone-800 rounded-2xl p-8 space-y-5">
          <div>
            <label className="block text-sm font-medium text-stone-300 mb-2">Email</label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-stone-800 border border-stone-700 rounded-xl pl-9 pr-4 py-3 text-white text-sm placeholder-stone-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 transition"
                placeholder="you@company.com"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-300 mb-2">Password</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-stone-800 border border-stone-700 rounded-xl pl-9 pr-4 py-3 text-white text-sm placeholder-stone-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 transition"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
              <AlertCircle size={15} />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-stone-950 font-semibold py-3 rounded-xl transition-colors text-sm"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
