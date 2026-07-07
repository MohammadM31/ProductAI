import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react'
import { authApi } from '../api/client'

const AppContext = createContext(null)

const initialState = {
  // Auth
  user: null,
  authLoading: true,

  // View: 'requester' | 'admin'
  view: 'requester',

  // Requester state - PERSISTENT
  sessionId: crypto.randomUUID(),
  currentOutput: null,
  requestStatus: 'idle',
  transcription: null,
  originalRequest: null,
  
  // NEW: Persist input state
  textInput: '',
  inputMode: 'voice',
  showGuidelines: true,
  panelWidth: 320,

  // Admin state
  adminTab: 'projects',

  error: null,
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_USER':
      return { ...state, user: action.payload, authLoading: false }
    case 'SET_AUTH_LOADING':
      return { ...state, authLoading: action.payload }
    case 'LOGOUT':
      return { ...initialState, authLoading: false }
    case 'SET_VIEW':
      return { ...state, view: action.payload }
    case 'SET_REQUEST_STATUS':
      return { ...state, requestStatus: action.payload }
    case 'SET_TRANSCRIPTION':
      return { ...state, transcription: action.payload }
    case 'SET_ORIGINAL_REQUEST':
      return { ...state, originalRequest: action.payload }
    case 'SET_CURRENT_OUTPUT':
      return { ...state, currentOutput: action.payload, requestStatus: 'done' }
    case 'CLEAR_OUTPUT':
      return { 
        ...state, 
        currentOutput: null, 
        requestStatus: 'idle', 
        transcription: null, 
        originalRequest: null, 
        sessionId: crypto.randomUUID(),
        // Keep text input and UI state
      }
    case 'SET_ADMIN_TAB':
      return { ...state, adminTab: action.payload }
    case 'SET_ERROR':
      return { ...state, error: action.payload, requestStatus: 'idle' }
    case 'CLEAR_ERROR':
      return { ...state, error: null }
    // NEW: Actions for persisting UI state
    case 'SET_TEXT_INPUT':
      return { ...state, textInput: action.payload }
    case 'SET_INPUT_MODE':
      return { ...state, inputMode: action.payload }
    case 'SET_SHOW_GUIDELINES':
      return { ...state, showGuidelines: action.payload }
    case 'SET_PANEL_WIDTH':
      return { ...state, panelWidth: action.payload }
    case 'RESET_REQUESTER_STATE':
      return {
        ...state,
        currentOutput: null,
        requestStatus: 'idle',
        transcription: null,
        originalRequest: null,
        sessionId: crypto.randomUUID(),
      }
    default:
      return state
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  // Try to restore session from stored token
  useEffect(() => {
    const token = localStorage.getItem('auth_token')
    if (!token) {
      dispatch({ type: 'SET_AUTH_LOADING', payload: false })
      return
    }
    authApi.me()
      .then(({ user }) => {
        dispatch({ type: 'SET_USER', payload: user })
      })
      .catch(() => {
        localStorage.removeItem('auth_token')
        dispatch({ type: 'SET_AUTH_LOADING', payload: false })
      })
  }, [])

  const login = useCallback(async (email, password) => {
    const data = await authApi.login(email, password)
    localStorage.setItem('auth_token', data.token)
    dispatch({ type: 'SET_USER', payload: data.user })
    return data.user
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('auth_token')
    dispatch({ type: 'LOGOUT' })
  }, [])

  return (
    <AppContext.Provider value={{ state, dispatch, login, logout }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}