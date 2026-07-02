'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import bcrypt from 'bcryptjs'
import { AUTH_COOKIE, USER_COOKIE, getUserByUsername, signSession } from '@/lib/auth-db'

const SESSION_MAX_AGE = 60 * 60 * 24 * 7 // 7 days

export async function login(
  _prevState: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const username = ((formData.get('username') as string) ?? '').trim()
  const password = (formData.get('password') as string) ?? ''

  if (!username || !password) {
    return { error: 'Please enter your username and password.' }
  }

  const user = await getUserByUsername(username)
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return { error: 'Invalid username or password.' }
  }

  const cookieStore = await cookies()
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: SESSION_MAX_AGE,
    path: '/',
  }
  cookieStore.set(AUTH_COOKIE, signSession(user.username), cookieOpts)
  cookieStore.set(USER_COOKIE, user.username, cookieOpts)

  redirect(user.is_admin ? '/admin' : '/dashboard')
}

export async function logout() {
  const cookieStore = await cookies()
  cookieStore.delete(AUTH_COOKIE)
  cookieStore.delete(USER_COOKIE)
  redirect('/')
}
