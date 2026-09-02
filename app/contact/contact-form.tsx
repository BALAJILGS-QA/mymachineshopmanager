'use client'

// Client island for the public /contact page. Collects an enquiry and writes it
// via contactsApi (Supabase `contact_messages` with a local fallback), where it
// surfaces in the app's CRM module. Router-agnostic and provider-light: uses a
// local success state rather than depending on app context.
//
// UI is a page-scoped premium redesign; the form logic (zod schema, react-hook-
// form, submitContact, success/error/loading states) is preserved exactly.

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertCircle, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react'
import { submitContact } from '@/features/crm/contactsApi'

const schema = z.object({
  name: z.string().trim().min(1, 'Your name is required'),
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email'),
  phone: z.string().trim().default(''),
  company: z.string().trim().default(''),
  message: z.string().trim().min(1, 'Please tell us how we can help'),
})
type Values = z.infer<typeof schema>

// Page-scoped input styling: clean brand-line border, comfortable height,
// industrial-orange focus ring. Not shared with other pages.
const inputCls =
  'w-full rounded-lg border border-[var(--line)] bg-white px-3.5 py-2.5 text-sm text-[var(--ink)] outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-[var(--amber)] focus:ring-2 focus:ring-[var(--amber)]/20 disabled:opacity-60'

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
      <div className="rounded-2xl border border-[var(--line)] bg-white p-8 text-center shadow-[0_1px_2px_rgba(17,26,43,0.04),0_18px_40px_-24px_rgba(17,26,43,0.25)] sm:p-10">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
          <CheckCircle2 size={24} />
        </div>
        <h3 className="display text-xl font-bold text-[var(--ink)]">Message sent successfully</h3>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-[var(--ink-dim)]">
          Thanks for reaching out. Our team will get back to you within 1 business day.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-white p-6 shadow-[0_1px_2px_rgba(17,26,43,0.04),0_18px_40px_-24px_rgba(17,26,43,0.25)] sm:p-8">
      <div className="mb-6">
        <h2 className="display text-xl font-bold text-[var(--ink)]">Send us a message</h2>
        <p className="mt-1 text-sm text-[var(--ink-dim)]">
          Tell us what you need and our team will get back to you.
        </p>
      </div>

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field htmlFor="name" label="Name" required error={errors.name?.message}>
            <input
              id="name"
              className={inputCls}
              placeholder="Your full name"
              autoComplete="name"
              {...register('name')}
            />
          </Field>
          <Field htmlFor="email" label="Email" required error={errors.email?.message}>
            <input
              id="email"
              type="email"
              className={inputCls}
              placeholder="you@company.com"
              autoComplete="email"
              {...register('email')}
            />
          </Field>
          <Field htmlFor="phone" label="Phone">
            <input
              id="phone"
              className={inputCls}
              placeholder="+91 XXXXX XXXXX"
              autoComplete="tel"
              {...register('phone')}
            />
          </Field>
          <Field htmlFor="company" label="Company">
            <input
              id="company"
              className={inputCls}
              placeholder="Your company name"
              autoComplete="organization"
              {...register('company')}
            />
          </Field>
        </div>

        <Field htmlFor="message" label="Message" required error={errors.message?.message}>
          <textarea
            id="message"
            rows={5}
            className={`${inputCls} resize-y`}
            placeholder="Tell us how we can help your business"
            {...register('message')}
          />
        </Field>

        {failed && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            Something went wrong. Please try again or email us directly.
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="group inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--amber)] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#a8380a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--amber)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Sending…
            </>
          ) : (
            <>
              Send Message
              <ArrowRight
                size={16}
                className="transition-transform duration-200 group-hover:translate-x-0.5"
              />
            </>
          )}
        </button>
      </form>
    </div>
  )
}

function Field({
  htmlFor,
  label,
  required,
  error,
  children,
}: {
  htmlFor: string
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-semibold text-[var(--ink)]">
        {label}
        {required && <span className="text-[var(--amber)]"> *</span>}
      </label>
      {children}
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  )
}
