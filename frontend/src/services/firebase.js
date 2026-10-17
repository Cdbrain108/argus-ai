import { initializeApp, getApps, getApp } from 'firebase/app'
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth'

// Firebase configuration matching Samvaad AI setup
const firebaseConfig = {
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY || '').trim() || 'AIzaSyAa2MPLyrxxiYS6in7Ojv_jVmlzglwXXGw',
  authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '').trim() || 'samvaad-ai-db3a1.firebaseapp.com',
  projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID || '').trim() || 'samvaad-ai-db3a1',
  storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '').trim() || 'samvaad-ai-db3a1.firebasestorage.app',
  messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim() || '293750023914',
  appId: (import.meta.env.VITE_FIREBASE_APP_ID || '').trim() || '1:293750023914:web:753705201ae0bfd07e9993',
}

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  typeof firebaseConfig.apiKey === 'string' &&
  !firebaseConfig.apiKey.includes('your_') &&
  firebaseConfig.projectId &&
  !firebaseConfig.projectId.includes('your_')
)

let app = null
let auth = null
let googleProvider = null

if (isFirebaseConfigured) {
  try {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)
    auth = getAuth(app)
    googleProvider = new GoogleAuthProvider()
    googleProvider.setCustomParameters({ prompt: 'select_account' })
  } catch (err) {
    console.warn('Firebase initialization note: using fallback auth mode', err)
    auth = null
    googleProvider = null
  }
}

export const formatFirebaseUser = (rawUser) => {
  if (!rawUser) return null
  return {
    id: rawUser.uid || `user_${Date.now()}`,
    name: rawUser.displayName || rawUser.email?.split('@')[0] || 'Argus Analyst',
    email: rawUser.email || '',
    photoURL: rawUser.photoURL || null,
    provider: rawUser.providerData?.[0]?.providerId || 'firebase',
  }
}

export const registerWithEmail = async (email, password, name = '') => {
  if (!auth) {
    // Offline / Mock fallback
    const mockUser = {
      uid: `usr_${Date.now()}`,
      email,
      displayName: name || email.split('@')[0],
    }
    return { user: formatFirebaseUser(mockUser), error: null }
  }
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    return { user: formatFirebaseUser(cred.user), error: null }
  } catch (err) {
    const msg = err.code === 'auth/email-already-in-use'
      ? 'An account with this email already exists.'
      : err.code === 'auth/weak-password'
      ? 'Password should be at least 6 characters.'
      : err.message || 'Registration failed.'
    return { user: null, error: msg }
  }
}

export const loginWithEmail = async (email, password) => {
  if (!auth) {
    const mockUser = {
      uid: `usr_${Date.now()}`,
      email,
      displayName: email.split('@')[0],
    }
    return { user: formatFirebaseUser(mockUser), error: null }
  }
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password)
    return { user: formatFirebaseUser(cred.user), error: null }
  } catch (err) {
    const msg = err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password'
      ? 'Invalid email or password.'
      : err.message || 'Login failed.'
    return { user: null, error: msg }
  }
}

export const signInWithGoogle = async () => {
  if (!auth || !googleProvider) {
    // Fallback: fast mock Google user
    const mockUser = {
      uid: `google_${Date.now()}`,
      email: 'analyst@argus.ai',
      displayName: 'Google Analyst',
    }
    return { user: formatFirebaseUser(mockUser), error: null }
  }
  try {
    const cred = await signInWithPopup(auth, googleProvider)
    return { user: formatFirebaseUser(cred.user), error: null }
  } catch (err) {
    if (err.code === 'auth/popup-closed-by-user') {
      return { user: null, error: 'Sign-in window closed before completion.' }
    }
    return { user: null, error: err.message || 'Google sign-in failed.' }
  }
}

export const logoutFirebase = async () => {
  if (auth) {
    try {
      await signOut(auth)
    } catch {}
  }
}

export const subscribeToAuthChanges = (callback) => {
  if (!auth) {
    return () => {}
  }
  return onAuthStateChanged(auth, (rawUser) => {
    callback(formatFirebaseUser(rawUser))
  })
}

export { auth }
