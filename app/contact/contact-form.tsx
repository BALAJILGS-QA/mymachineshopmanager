'use client'

// Client island for the public /contact page. Collects an enquiry and writes it
// via contactsApi (Supabase `contact_messages` with a local fallback), where it
// surfaces in the app's CRM module. Router-agnostic and provider-light: uses a
// local success state rather than depending on app context.

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Building2, CheckCircle2, Loader2, Mail, MessageSquare, Phone, User } from 'lucide-react'
import { submitContact } from '@/features/crm/contactsApi'

const schema = z.object({
  name: z.string().trim().min(1, 'Your name is required'),
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email'),
  phone: z.string().trim().default(''),
  company: z.string().trim().default(''),
  message: z.string().trim().min(1, 'Please tell us how we can help'),
})
type Values = z.infer<typeof schema>

export function ContactForm() {
  const [done, setDone] = useState(false)
  const [failed, setFailed] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', phone: '', company: '', message: '' },
  })

  const onSubmit = handleSubmit(async (values) => {
    setFailed(false)
    try {
      await submitContact(values)
      setDone(true)
    } catch {
      setFailed(true)
    }
  })

  if (done) {
    return (
      <div className="rounded-2xl border border-[var(--line)] bg-white/80 p-8 text-center shadow-xl shadow-orange-900/5 backdrop-blur">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
          <CheckCircle2 size={24} />
        </div>
        <h2 className="display text-xl font-bold text-[var(--ink)]">Thanks — message received</h2>
        <p className="mt-2 text-sm text-[var(--ink-dim)]">
          Our team will get back to you shortly. Your enquiry has been logged with us.
        </p>
      </div>
    )
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="rounded-2xl border border-[var(--line)] bg-white/80 p-6 shadow-xl shadow-orange-900/5 backdrop-blur sm:p-7"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <IconField icon={User} label="Name" required error={errors.name?.message}>
          <input className="input pl-9" aria-label="Name" {...register('name')} />
        </IconField>
        <IconField icon={Mail} label="Email" required error={errors.email?.message}>
          <input
            className="input pl-9"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            aria-label="Email"
            {...register('email')}
          />
        </IconField>
        <IconField icon={Phone} label="Phone">
          <input className="input pl-9" aria-label="Phone" {...register('phone')} />
        </IconField>
        <IconField icon={Building2} label="Company">
          <input className="input pl-9" aria-label="Company" {...register('company')} />
        </IconField>
      </div>

      <div className="mt-4">
        <label className="label" htmlFor="message">
          Message <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <MessageSquare
            size={16}
            className="pointer-events-none absolute left-3 top-3 text-slate-500"
          />
          <textarea
            id="message"
            rows={5}
            className="input pl-9"
            placeholder="How can we help your shop?"
            {...register('message')}
          />
        </div>
        {errors.message && <p className="mt-1 text-xs text-red-600">{errors.message.message}</p>}
      </div>

      {failed && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-center text-xs text-red-600">
          Something went wrong. Please try again or email us directly.
        </p>
      )}

      <button type="submit" className="btn-primary mt-5 w-full py-2.5" disabled={isSubmitting}>
        {isSubmitting && <Loader2 size={16} className="animate-spin" />}
        Send message
      </button>
    </form>
  )
}

function IconField({
  icon: Icon,
  label,
  required,
  error,
  children,
}: {
  icon: typeof Mail
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="label">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <div className="relative">
        <Icon
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
        />
        {children}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
