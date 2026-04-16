export interface AppUser {
  id: string
  email: string
  passwordHash: string
  role: 'admin' | 'operator' | 'viewer'
  name: string
  createdAt: string
  lastLogin?: string
  active: boolean
}

interface SessionToken {
  value: string
  userId: string
  expiresAt: number
}

const SESSION_DURATION = 8 * 60 * 60 * 1000  // 8 hours
const USERS_KEY = 'stlr_users'
const SESSION_KEY = 'stlr_auth'
const TOKEN_KEY = 'stlr_token'
const CURRENT_USER_KEY = 'stlr_current_user'

// Simple hash function (no external lib needed):
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// Default accounts
const DEFAULT_USERS = [
  {
    email: 'admin@stlr.io',
    password: 'stlr2026',
    role: 'admin' as const,
    name: 'Administrateur',
  },
  {
    email: 'operateur@stlr.io',
    password: 'stlr2026',
    role: 'operator' as const,
    name: 'Opérateur',
  },
  {
    email: 'viewer@stlr.io',
    password: 'stlr2026',
    role: 'viewer' as const,
    name: 'Observateur',
  },
]

// Initialize default users on first run:
async function initDefaultAdmin(): Promise<void> {
  const users = getUsers()
  if (users.length === 0) {
    const initializedUsers: AppUser[] = []
    for (const u of DEFAULT_USERS) {
      const hash = await hashPassword(u.password)
      initializedUsers.push({
        id: crypto.randomUUID(),
        email: u.email,
        passwordHash: hash,
        role: u.role,
        name: u.name,
        createdAt: new Date().toISOString(),
        active: true,
      })
    }
    localStorage.setItem(USERS_KEY, JSON.stringify(initializedUsers))
  }
}

export function getUsers(): AppUser[] {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) ?? '[]')
  } catch { return [] }
}

export async function login(email: string, password: string): Promise<boolean> {
  await initDefaultAdmin()
  const users = getUsers()
  const hash = await hashPassword(password)
  const user = users.find(
    u => u.email.toLowerCase() === email.toLowerCase() && 
         u.passwordHash === hash
  )
  
  if (!user) return false
  if (!user.active) {
    throw new Error('Compte désactivé. Veuillez contacter un administrateur.')
  }
  
  const token: SessionToken = {
    value: crypto.randomUUID(),
    userId: user.id,
    expiresAt: Date.now() + SESSION_DURATION,
  }
  // Update lastLogin
  const updated = users.map(u => 
    u.id === user.id ? { ...u, lastLogin: new Date().toISOString() } : u
  )
  localStorage.setItem(USERS_KEY, JSON.stringify(updated))
  localStorage.setItem(SESSION_KEY, 'authenticated')
  localStorage.setItem(TOKEN_KEY, JSON.stringify(token))
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user))
  return true
}

export function logout(): void {
  localStorage.removeItem(SESSION_KEY)
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(CURRENT_USER_KEY)
}

export function isAuthenticated(): boolean {
  if (localStorage.getItem(SESSION_KEY) !== 'authenticated') return false
  try {
    const token: SessionToken = JSON.parse(localStorage.getItem(TOKEN_KEY) ?? '')
    if (Date.now() > token.expiresAt) { logout(); return false }
    return true
  } catch { logout(); return false }
}

export function getCurrentUser(): AppUser | null {
  try {
    return JSON.parse(localStorage.getItem(CURRENT_USER_KEY) ?? 'null')
  } catch { return null }
}

export function hasRole(role: AppUser['role']): boolean {
  const user = getCurrentUser()
  if (!user) return false
  if (user.role === 'admin') return true
  return user.role === role
}

export function getDefaultRoute(role: AppUser['role']): string {
  switch(role) {
    case 'admin':
    case 'operator': return '/home/electricity'
    case 'viewer':   return '/dashboard'
    default:         return '/dashboard'
  }
}

// getAllUsers — return without passwordHash for safety
export function getAllUsers(): Omit<AppUser, 'passwordHash'>[] {
  return getUsers().map(({ passwordHash: _, ...rest }) => rest)
}

export async function createUser(data: {
  name: string
  email: string
  password: string
  role: AppUser['role']
}): Promise<AppUser> {
  const users = getUsers()
  
  if (users.find(u => u.email.toLowerCase() === data.email.toLowerCase())) {
    throw new Error('Email already exists')
  }
  
  const hash = await hashPassword(data.password)
  const newUser: AppUser = {
    id: crypto.randomUUID(),
    email: data.email.toLowerCase(),
    passwordHash: hash,
    role: data.role,
    name: data.name,
    createdAt: new Date().toISOString(),
    active: true,
  }
  
  localStorage.setItem(USERS_KEY, JSON.stringify([...users, newUser]))
  return newUser
}

export async function updateUserPassword(
  userId: string, 
  newPassword: string
): Promise<void> {
  const users = getUsers()
  const hash = await hashPassword(newPassword)
  const updated = users.map(u => 
    u.id === userId ? { ...u, passwordHash: hash } : u
  )
  localStorage.setItem(USERS_KEY, JSON.stringify(updated))
}

export function updateUserRole(
  userId: string, 
  role: AppUser['role']
): void {
  const users = getUsers()
  const updated = users.map(u => 
    u.id === userId ? { ...u, role } : u
  )
  localStorage.setItem(USERS_KEY, JSON.stringify(updated))
}

export function toggleUserActive(userId: string): void {
  const users = getUsers()
  const updated = users.map(u => 
    u.id === userId ? { ...u, active: !u.active } : u
  )
  localStorage.setItem(USERS_KEY, JSON.stringify(updated))
}

export function deleteUser(userId: string): { success: boolean; error?: string } {
  const current = getCurrentUser()
  if (current?.id === userId) {
    return { success: false, error: 'Impossible de supprimer votre propre compte' }
  }
  const users = getUsers()
  const admins = users.filter(u => u.role === 'admin' && u.active)
  const targetUser = users.find(u => u.id === userId)
  if (targetUser?.role === 'admin' && admins.length <= 1) {
    return { success: false, error: 'Impossible de supprimer le dernier administrateur' }
  }
  localStorage.setItem(USERS_KEY, JSON.stringify(users.filter(u => u.id !== userId)))
  return { success: true }
}

/**
 * Verify if a password matches the stored hash for a user
 */
export async function verifyCurrentPassword(
  userId: string, 
  password: string
): Promise<boolean> {
  const users = getUsers()
  const user = users.find(u => u.id === userId)
  if (!user) return false
  const hash = await hashPassword(password)
  return user.passwordHash === hash
}

/**
 * Update user profile (name and email)
 */
export function updateUserProfile(
  userId: string,
  data: { name: string; email: string }
): void {
  const users = getUsers()
  
  // Check email uniqueness (excluding current user)
  const emailTaken = users.some(
    u => u.id !== userId && 
         u.email.toLowerCase() === data.email.toLowerCase()
  )
  if (emailTaken) {
    throw new Error('Email already in use')
  }
  
  const updated = users.map(u =>
    u.id === userId 
      ? { ...u, name: data.name, email: data.email }
      : u
  )
  localStorage.setItem(USERS_KEY, JSON.stringify(updated))
  
  // Update current user in session if editing own profile
  const currentUser = getCurrentUser()
  if (currentUser?.id === userId) {
    const updatedUser = updated.find(u => u.id === userId)
    if (updatedUser) {
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(updatedUser))
    }
  }
}
