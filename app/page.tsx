'use client'

import { useActionState } from 'react'
import { login } from '@/app/actions/auth'
import { AuthShell, Field, PasswordField, SubmitButton, ErrorText } from '@/app/components/AuthShell'

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(login, null)

  return (
    <AuthShell title="Digital Content Intelligence" subtitle="Dashboard">
      <form action={formAction} className="space-y-4">
        <Field
          id="username"
          name="username"
          label="Username"
          type="text"
          required
          autoComplete="username"
          placeholder="Your username"
        />

        <PasswordField id="password" name="password" label="Password" autoComplete="current-password" />

        {state?.error && <ErrorText>{state.error}</ErrorText>}

        <SubmitButton pending={isPending} idleLabel="Sign In" pendingLabel="Signing in…" />
      </form>
    </AuthShell>
  )
}
