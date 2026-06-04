'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

const CREDENTIALS = {
  username: 'honda-revou',
  password: 'thepowerofdreams',
}

const AUTH_TOKEN = 'hrd2026-authenticated'

export async function login(
  _prevState: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const username = formData.get('username') as string
  const password = formData.get('password') as string

  if (username === CREDENTIALS.username && password === CREDENTIALS.password) {
    const cookieStore = await cookies()
    cookieStore.set('honda_auth', AUTH_TOKEN, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    })
    redirect('/dashboard')
  }

  return { error: 'Invalid username or password.' }
}

export async function logout() {
  const cookieStore = await cookies()
  cookieStore.delete('honda_auth')
  redirect('/')
}
