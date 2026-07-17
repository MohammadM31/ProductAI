import React from 'react'
import { Toaster } from 'react-hot-toast'
import { AppProvider, useApp } from './context/AppContext'
import LoginScreen from './components/user/LoginScreen'
import RequesterView from './components/user/RequesterView'
import AdminPanel from './components/admin/AdminPanel'
import { Sparkles, LogOut, Settings, User, LayoutDashboard } from 'lucide-react'

function Layout() {
  const { state, dispatch, logout } = useApp()
  const { user, authLoading, view } = state

  if (authLoading) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return <LoginScreen />

  const canAdmin = user.role === 'admin' || user.role === 'dept_user'

  return (
    <div className="h-screen flex flex-col bg-stone-950 overflow-hidden">
      {/* Top nav */}
      <header className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b border-stone-800 bg-stone-900/80 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
            <Sparkles size={16} className="text-amber-400" />
          </div>
          <span className="text-sm font-bold text-white tracking-tight hidden sm:block">Creative Request Platform</span>
        </div>

        {/* View toggle (admin/dept users only) */}
        {canAdmin && (
          <div className="flex items-center gap-1 bg-stone-800 rounded-full p-1">
            <button
              onClick={() => dispatch({ type: 'SET_VIEW', payload: 'requester' })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                view === 'requester' ? 'bg-amber-500 text-stone-950' : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              <User size={12} /> Request
            </button>
            <button
              onClick={() => dispatch({ type: 'SET_VIEW', payload: 'admin' })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                view === 'admin' ? 'bg-amber-500 text-stone-950' : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              <LayoutDashboard size={12} /> Admin
            </button>
          </div>
        )}

        {/* User info + logout */}
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-medium text-stone-300">{user.name}</p>
            <p className="text-xs text-stone-500 capitalize">{user.role.replace('_', ' ')}</p>
          </div>
          <button
            onClick={logout}
            className="p-2 rounded-lg hover:bg-stone-700 text-stone-400 hover:text-stone-200 transition-colors"
            title="Sign out"
          >
            <LogOut size={15} />
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        {canAdmin && view === 'admin' ? (
          <AdminPanel />
        ) : (
          <RequesterView />
        )}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <Layout />
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#1c1917',
            color: '#f5f5f4',
            border: '1px solid #292524',
            borderRadius: '12px',
            fontSize: '13px',
          },
          success: { iconTheme: { primary: '#f59e0b', secondary: '#1c1917' } },
          error: { iconTheme: { primary: '#f43f5e', secondary: '#fff' } },
        }}
      />
    </AppProvider>
  )
}
