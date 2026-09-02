// Next.js port of the landing route `/` (was src/routes/index.tsx +
// src/features/site/LandingPage.tsx). Server Component: marketing content is
// server-rendered, SEO via the Metadata API (replacing client `useSeo`), and the
// Sign In/Sign Up card is a client island (`LandingAuth`) so Supabase auth runs
// only on the client. Markup/classes preserved 1:1 from the Vite LandingPage.
//
// `@/index.css` is imported here so the app component classes AuthForm relies on
// (.input/.label/.btn-primary/.btn-secondary) are available on this route, exactly
// as the Vite app loads them globally.

import type { Metadata } from 'next'
import {
  ArrowUpRight,
  BarChart3,
  Boxes,
  ClipboardCheck,
  Factory,
  Gauge,
  IndianRupee,
  ReceiptText,
  ShieldCheck,
  ShoppingCart,
  TrendingUp,
  Truck,
  Workflow,
} from 'lucide-react'
import { SiteChrome } from './_site/site-chrome'
import { JsonLd } from './_site/json-ld'
import { SITE } from '@/lib/site-meta'
import { BRAND } from '@/lib/brand'
import '@/index.css'

const TITLE = `${BRAND.product} — Job Orders, Invoices & Delivery Challans`

export const metadata: Metadata = {
  metadataBase: new URL(SITE.BASE_URL),
  title: TITLE,
  description: BRAND.description,
  keywords: BRAND.keywords,
  alternates: { canonical: `${SITE.BASE_URL}/` },
  robots: 'index,follow',
  openGraph: {
    siteName: SITE.SITE_NAME,
    title: TITLE,
    description: BRAND.description,
    type: 'website',
    url: `${SITE.BASE_URL}/`,
    images: [SITE.DEFAULT_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: BRAND.description,
    images: [SITE.DEFAULT_IMAGE],
  },
}

// Frequently asked questions — rendered on the page and mirrored into FAQPage
// structured data for rich results (SEO).
const FAQS = [
  {
    q: `Is my shop's data secure with ${BRAND.product}?`,
    a: 'Yes. Your data is hosted on secure, managed cloud infrastructure with encrypted connections, role-based access and approval-gated logins, so only the people you authorise can see it.',
  },
  {
    q: 'Do you provide onboarding and training?',
    a: 'We provide guided onboarding and support to help you set up your shop, import existing records and get your team comfortable — usually within a few days.',
  },
  {
    q: 'How much does it cost?',
    a: 'You can start with a free trial and pick a plan that matches your shop size. Reach out for a tailored quote based on the modules and users you need.',
  },
  {
    q: 'How long does implementation take?',
    a: 'Most shops are up and running quickly. Because job orders, materials and invoices live in one system, there is no complex integration — existing data can be imported to get you started fast.',
  },
]

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      name: BRAND.product,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description: BRAND.description,
      url: SITE.BASE_URL,
      image: SITE.DEFAULT_IMAGE,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
    },
    {
      '@type': 'Organization',
      name: BRAND.legalName,
      alternateName: BRAND.product,
      url: SITE.BASE_URL,
      logo: SITE.DEFAULT_IMAGE,
      description: BRAND.description,
      email: BRAND.contact.email,
      address: { '@type': 'PostalAddress', addressCountry: BRAND.contact.location },
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        email: BRAND.contact.email,
        availableLanguage: ['English'],
      },
    },
    {
      '@type': 'FAQPage',
      mainEntity: FAQS.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
  ],
}

// Hero highlight chips (kept from the original hero).
const FEATURES = [
  { icon: Gauge, t: 'Tight tolerances' },
  { icon: ShieldCheck, t: 'Documented QC' },
  { icon: Boxes, t: 'Batch traceability' },
]

// Module cards rendered in the premium “Modules” section. Each carries a
// category + accent hue used for the gradient icon-tile and the mono kicker,
// giving ERP-style category distinction on a neutral card system.
const MODULES = [
  {
    icon: ClipboardCheck,
    t: 'Job Orders',
    cat: 'Operations',
    accent: '#ea580c',
    d: 'Raise job orders, attach specs and drawings, and track each job from first-off to final dispatch.',
  },
  {
    icon: Boxes,
    t: 'Materials & Inventory',
    cat: 'Operations',
    accent: '#c2410c',
    d: 'Track raw material, batches and stock movement with heat- and lot-level traceability.',
  },
  {
    icon: Workflow,
    t: 'Production Planning',
    cat: 'Operations',
    accent: '#f97316',
    d: 'Plan and monitor production across machines so the shop floor stays balanced and on time.',
  },
  {
    icon: ShieldCheck,
    t: 'Quality Control',
    cat: 'Quality',
    accent: '#059669',
    d: 'Record documented QC and inspection at every stage — audit-ready whenever a customer asks.',
  },
  {
    icon: ShoppingCart,
    t: 'Sales & Distribution',
    cat: 'Commerce',
    accent: '#0284c7',
    d: 'Manage enquiries, quotations and orders, then dispatch company-wise from a single pipeline.',
  },
  {
    icon: Truck,
    t: 'Purchase & Vendors',
    cat: 'Commerce',
    accent: '#4f46e5',
    d: 'Coordinate purchase orders, subcontracting and vendor deliveries without losing the paper trail.',
  },
  {
    icon: ReceiptText,
    t: 'Invoices & Challans',
    cat: 'Finance',
    accent: '#7c3aed',
    d: 'Generate GST-ready invoices and delivery challans in seconds, linked back to the job.',
  },
  {
    icon: IndianRupee,
    t: 'Payments & Expenses',
    cat: 'Finance',
    accent: '#db2777',
    d: 'Follow payments, receivables and expenses company-wise in one clean ledger.',
  },
  {
    icon: BarChart3,
    t: 'Reports & Analytics',
    cat: 'Insight',
    accent: '#0d9488',
    d: 'See jobs, dispatches, dues and margins at a glance with live reports and dashboards.',
  },
]

// Real shop-floor sequence — the operations flow shown in the “Manufacturing
// execution” band (mapped to software, ZipERP/Zoho-style).
const STAGES = [
  { icon: ShoppingCart, t: 'Enquiry & Quote' },
  { icon: ClipboardCheck, t: 'Job Order' },
  { icon: Workflow, t: 'Production Planning' },
  { icon: Gauge, t: 'Machining' },
  { icon: ShieldCheck, t: 'Quality Control' },
  { icon: Truck, t: 'Dispatch & Challan' },
  { icon: ReceiptText, t: 'Invoice & Payment' },
]

// How the software maps to real operations (adapted from Zoho’s manufacturing
// execution capability areas).
const EXECUTION = [
  {
    icon: Workflow,
    t: 'Planning to execution',
    d: 'Turn customer orders into scheduled job orders on the floor — demand and production plans in one flow.',
  },
  {
    icon: Factory,
    t: 'Work-centre balance',
    d: 'See machine load, routing and WIP so you cut idle time and keep every work centre productive.',
  },
  {
    icon: BarChart3,
    t: 'Live visibility',
    d: 'Track real-time job status, work-in-progress and stock across the shop from a single dashboard.',
  },
  {
    icon: Boxes,
    t: 'Full traceability',
    d: 'Every part traces back to its batch, heat and job order — audit-ready material and component history.',
  },
]

export default function LandingPage() {
  return (
    <SiteChrome showFooter>
      <JsonLd data={jsonLd} />
      <section id="home" className="blueprint relative overflow-hidden">
        <div className="glow-amber pointer-events-none absolute inset-x-0 top-0 h-[520px]" />
        <div className="mx-auto flex min-h-[calc(100vh-64px)] max-w-3xl flex-col items-center justify-center px-5 py-16 text-center">
          <p className="kicker rise d1">{BRAND.product}</p>
          <h1 className="display rise d2 mt-4 text-4xl font-bold leading-[1.03] text-[var(--ink)] sm:text-5xl md:text-6xl">
            Run your shop floor with <span className="grad">total traceability.</span>
          </h1>
          <p className="rise d3 mt-5 max-w-xl text-base leading-relaxed text-[var(--ink-dim)]">
            Machine Shop Management tracks job orders, raw material, delivery challans, invoices,
            payments and expenses — company-wise, from order to dispatch, in one place.
          </p>
          <div className="rise d4 mt-8 flex flex-wrap items-center justify-center gap-3">
            <a href="/signup" className="site-btn site-btn-primary">
              Try for free <ArrowUpRight size={16} />
            </a>
            <a href="/login" className="site-btn site-btn-ghost">
              Login
            </a>
          </div>
          <div className="rise d5 mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            {FEATURES.map((f) => (
              <span
                key={f.t}
                className="flex items-center gap-2 text-sm font-medium text-[var(--ink-dim)]"
              >
                <f.icon size={16} className="text-[var(--amber)]" /> {f.t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Premium showcase banner — dark industrial band with a floating live
          dashboard preview (keeps the keyword-rich SEO lead copy). */}
      <section aria-labelledby="intro-heading" className="relative overflow-hidden bg-[#0e1626]">
        <div className="blueprint absolute inset-0 opacity-[0.12]" />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(50% 45% at 82% -5%, rgba(234,88,12,0.28), transparent 60%), radial-gradient(45% 40% at 0% 105%, rgba(56,189,248,0.12), transparent 60%)',
          }}
        />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 py-20 lg:grid-cols-[0.9fr_1.1fr] lg:gap-8 lg:pr-0">
          {/* Copy + CTA */}
          <div>
            <p className="kicker" style={{ color: '#fb923c' }}>
              Machine shop management software
            </p>
            <h2
              id="intro-heading"
              className="display mt-3 text-3xl font-bold leading-[1.1] text-white sm:text-[2.6rem]"
            >
              Your whole shop floor, on one{' '}
              <span
                style={{
                  background: 'linear-gradient(100deg, #fb923c, #f97316 55%, #fdba74)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                }}
              >
                live dashboard.
              </span>
            </h2>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/65">
              {BRAND.product} is purpose-built machine shop and CNC ERP software for precision
              manufacturers. Manage job orders, raw material and batch traceability, documented QC,
              GST-ready invoices, delivery challans, payments and expenses — company-wise, from
              order to dispatch — in a single, easy-to-use system. Replace scattered spreadsheets
              with one source of truth for your shop floor.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a href="/login" className="site-btn site-btn-primary">
                Book a free demo <ArrowUpRight size={16} />
              </a>
              <a
                href="/#features"
                style={{ color: '#ffffff' }}
                className="rounded-[10px] border border-white/25 bg-white/5 px-5 py-3 text-sm font-semibold transition hover:border-white/45 hover:bg-white/10"
              >
                Explore modules
              </a>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-medium text-white/45">
              <span className="mono">ORDER → PRODUCTION → DISPATCH → INVOICE</span>
            </div>
          </div>

          {/* Floating dashboard preview — flush to the right end of the screen */}
          <div className="relative w-full lg:justify-self-end xl:-mr-10 2xl:-mr-16">
            <div
              className="pointer-events-none absolute -inset-8 -z-10 rounded-[2rem]"
              style={{
                background: 'radial-gradient(closest-side, rgba(234,88,12,0.18), transparent)',
              }}
            />
            <DashboardPreview />
          </div>
        </div>
      </section>

      {/* Modules — premium card grid */}
      <section
        id="features"
        className="relative overflow-hidden border-t border-[var(--line)] bg-[var(--bg)]"
      >
        {/* faint dotted texture + soft wash so the neutral cards pop */}
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            backgroundImage: 'radial-gradient(rgba(17,26,43,0.05) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
          }}
        />
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-64"
          style={{
            background:
              'radial-gradient(60% 100% at 50% 0%, rgba(234,88,12,0.06), transparent 70%)',
          }}
        />
        <div className="relative mx-auto max-w-6xl px-5 py-24">
          <div className="reveal mx-auto max-w-2xl text-center">
            <p className="kicker">Modules</p>
            <h2 className="display mt-3 text-3xl font-bold text-[var(--ink)] sm:text-4xl">
              One system, every part of your <span className="grad">shop.</span>
            </h2>
            <p className="mt-4 text-base leading-relaxed text-[var(--ink-dim)]">
              Connected modules for the work a machine shop actually does — from job orders and
              materials to production, quality, invoicing and reports — so nothing falls through the
              cracks.
            </p>
          </div>
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {MODULES.map((c, i) => (
              <article
                key={c.t}
                className="reveal group relative overflow-hidden rounded-2xl border border-[var(--line)] bg-white p-6 shadow-[0_1px_2px_rgba(17,26,43,0.04),0_16px_32px_-24px_rgba(17,26,43,0.35)] transition duration-300 hover:-translate-y-1.5 hover:shadow-[0_1px_2px_rgba(17,26,43,0.04),0_28px_50px_-24px_rgba(17,26,43,0.35)]"
              >
                {/* top gradient hairline reveals on hover */}
                <span
                  className="absolute inset-x-0 top-0 h-[2px] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  style={{
                    background: `linear-gradient(90deg, transparent, ${c.accent}, transparent)`,
                  }}
                />
                <div className="flex items-center justify-between">
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-xl text-white shadow-md transition-transform duration-300 group-hover:-rotate-6"
                    style={{
                      background: `linear-gradient(135deg, ${c.accent}, ${c.accent}cc)`,
                      boxShadow: `0 10px 22px -10px ${c.accent}`,
                    }}
                  >
                    <c.icon size={22} />
                  </div>
                  <span
                    className="mono text-[11px] font-semibold tracking-[0.14em]"
                    style={{ color: c.accent }}
                  >
                    {String(i + 1).padStart(2, '0')} · {c.cat.toUpperCase()}
                  </span>
                </div>
                <h3 className="display mt-5 text-lg font-bold text-[var(--ink)]">{c.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--ink-dim)]">{c.d}</p>
                <span
                  className="mt-4 inline-flex -translate-x-1 items-center gap-1 text-sm font-semibold opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100"
                  style={{ color: c.accent }}
                >
                  Explore <ArrowUpRight size={14} />
                </span>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Manufacturing execution — real operations mapped to the software (navy band) */}
      <section aria-labelledby="mfg-heading" className="relative overflow-hidden bg-[#111a2b]">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(55% 45% at 85% 0%, rgba(234,88,12,0.22), transparent 60%), radial-gradient(50% 45% at 0% 100%, rgba(194,65,12,0.16), transparent 60%)',
          }}
        />
        <div className="relative mx-auto max-w-6xl px-5 py-20 text-white">
          <div className="reveal max-w-2xl">
            <p className="kicker" style={{ color: '#fb923c' }}>
              Manufacturing execution
            </p>
            <h2 id="mfg-heading" className="display mt-3 text-3xl font-bold sm:text-4xl">
              Mapped to how your shop floor{' '}
              <span
                style={{
                  background: 'linear-gradient(100deg, #fb923c, #f97316 60%, #fdba74)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                }}
              >
                actually runs.
              </span>
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/65">
              {BRAND.product} follows the real sequence of operations — from enquiry to invoice — so
              the software mirrors the floor instead of forcing generic ERP steps on your team.
            </p>
          </div>

          {/* Operations flow — nodes drift (floaty) with a staggered delay so the
              pipeline reads as live movement rather than a static diagram. */}
          <div className="reveal mt-12 flex flex-wrap items-center justify-center gap-x-1 gap-y-4 sm:justify-start">
            {STAGES.map((s, i) => (
              <div key={s.t} className="flex items-center gap-1">
                <div
                  className="floaty flex min-w-[130px] flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-4 text-center backdrop-blur transition hover:border-[#fdba74]/40 hover:bg-white/[0.08]"
                  style={{ animationDelay: `${i * 0.28}s` }}
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-[#fdba74]">
                    <s.icon size={18} />
                  </div>
                  <span className="text-xs font-semibold text-white/85">{s.t}</span>
                </div>
                {i < STAGES.length - 1 && (
                  <ArrowUpRight
                    size={16}
                    className="flow-arrow hidden shrink-0 rotate-45 text-[#fdba74] sm:block"
                    style={{ animationDelay: `${i * 0.28}s` }}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Capability mapping — cards float too, offset from the flow above. */}
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {EXECUTION.map((e, i) => (
              <div
                key={e.t}
                className="reveal floaty rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur transition hover:border-[#fdba74]/40 hover:bg-white/[0.08]"
                style={{ animationDelay: `${i * 0.4 + 0.2}s`, animationDuration: '4.4s' }}
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-[#fdba74]">
                  <e.icon size={22} />
                </div>
                <h3 className="display mt-4 text-base font-bold text-white">{e.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/60">{e.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t border-[var(--line)]">
        <div className="mx-auto max-w-3xl px-5 py-20">
          <div className="reveal text-center">
            <p className="kicker">FAQ</p>
            <h2 className="display mt-3 text-3xl font-bold text-[var(--ink)] sm:text-4xl">
              Frequently asked <span className="grad">questions.</span>
            </h2>
          </div>
          <div className="reveal mt-10 space-y-3">
            {FAQS.map((f) => (
              <details
                key={f.q}
                className="group rounded-2xl border border-[var(--line)] bg-white/70 p-5 shadow-sm [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="flex cursor-pointer items-center justify-between gap-4 text-base font-semibold text-[var(--ink)]">
                  {f.q}
                  <ArrowUpRight
                    size={18}
                    className="shrink-0 text-[var(--amber)] transition group-open:rotate-90"
                  />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-[var(--ink-dim)]">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </SiteChrome>
  )
}

// Floating "Accounts Dashboard" preview for the showcase banner — pure
// SVG/markup (grouped bar chart + donut), so it stays crisp and needs no
// screenshot asset. Gently floats via the shared `.floaty` animation.
function DashboardPreview() {
  const stats = [
    { label: 'Stock value', value: '₹42.8L', delta: '+6%' },
    { label: 'In-stock SKUs', value: '214', delta: '+9' },
    { label: 'Low stock', value: '6 items', delta: 'reorder' },
  ]
  // Stock received vs issued (kg) across recent months.
  const months = [
    { m: 'Apr', a: 58, b: 38 },
    { m: 'May', a: 74, b: 50 },
    { m: 'Jun', a: 50, b: 32 },
    { m: 'Jul', a: 86, b: 56 },
    { m: 'Aug', a: 66, b: 44 },
    { m: 'Sep', a: 94, b: 60 },
  ]
  const donut = [
    { label: 'Steel', val: 52, color: '#ea580c' },
    { label: 'Aluminium', val: 24, color: '#0284c7' },
    { label: 'Brass', val: 15, color: '#059669' },
    { label: 'Other', val: 9, color: '#a855f7' },
  ]
  const materials = [
    {
      name: 'MS Round 40mm',
      qty: '1,240 kg',
      status: 'In stock',
      tone: 'bg-emerald-100 text-emerald-700',
    },
    { name: 'Aluminium 6061', qty: '380 kg', status: 'Low', tone: 'bg-amber-100 text-amber-700' },
    { name: 'Brass rod 25mm', qty: '95 kg', status: 'Reorder', tone: 'bg-rose-100 text-rose-700' },
  ]
  // Donut geometry (stroke-dasharray segments on a circle).
  const R = 34
  const C = 2 * Math.PI * R
  let offset = 0

  return (
    <div className="floaty overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl ring-1 ring-black/5">
      {/* Window chrome */}
      <div className="flex items-center gap-2 border-b border-[var(--line)] bg-[var(--bg-2)] px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        <div className="ml-3 flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1 text-[11px] font-medium text-[var(--ink-faint)]">
          <Boxes size={11} className="text-[var(--amber)]" /> Material Management
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {/* Stat row */}
        <div className="grid grid-cols-3 gap-2.5">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-[var(--line)] bg-[var(--bg)] p-2.5"
            >
              <p className="truncate text-[9px] uppercase tracking-wide text-[var(--ink-faint)]">
                {s.label}
              </p>
              <p className="display mt-0.5 text-[15px] font-bold text-[var(--ink)]">{s.value}</p>
              <p className="mt-0.5 flex items-center gap-0.5 text-[9px] font-semibold text-emerald-600">
                <TrendingUp size={9} /> {s.delta}
              </p>
            </div>
          ))}
        </div>

        {/* Charts */}
        <div className="mt-3 grid gap-3 sm:grid-cols-[1.5fr_1fr]">
          {/* Stock movement bar chart */}
          <div className="rounded-xl border border-[var(--line)] bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] font-semibold text-[var(--ink-dim)]">Stock in vs out</p>
              <div className="flex items-center gap-2 text-[8px] text-[var(--ink-faint)]">
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-sm bg-[var(--amber)]" /> Received
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-sm bg-sky-500" /> Issued
                </span>
              </div>
            </div>
            <div className="flex items-end justify-between gap-2" style={{ height: 92 }}>
              {months.map((mo) => (
                <div key={mo.m} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="flex w-full items-end justify-center gap-[3px]"
                    style={{ height: 78 }}
                  >
                    <div
                      className="w-2 rounded-t bg-gradient-to-t from-[var(--amber)] to-[var(--amber-soft)]"
                      style={{ height: `${mo.a}%` }}
                    />
                    <div
                      className="w-2 rounded-t bg-gradient-to-t from-sky-600 to-sky-400"
                      style={{ height: `${mo.b}%` }}
                    />
                  </div>
                  <span className="text-[8px] text-[var(--ink-faint)]">{mo.m}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Stock-by-material donut chart */}
          <div className="rounded-xl border border-[var(--line)] bg-white p-3">
            <p className="mb-1 text-[10px] font-semibold text-[var(--ink-dim)]">
              Stock by material
            </p>
            <div className="flex items-center gap-3">
              <svg viewBox="0 0 80 80" className="h-[74px] w-[74px] -rotate-90">
                {donut.map((d) => {
                  const seg = (d.val / 100) * C
                  const el = (
                    <circle
                      key={d.label}
                      cx="40"
                      cy="40"
                      r={R}
                      fill="none"
                      stroke={d.color}
                      strokeWidth="9"
                      strokeDasharray={`${seg} ${C - seg}`}
                      strokeDashoffset={-offset}
                    />
                  )
                  offset += seg
                  return el
                })}
              </svg>
              <ul className="space-y-1">
                {donut.map((d) => (
                  <li
                    key={d.label}
                    className="flex items-center gap-1.5 text-[9px] text-[var(--ink-dim)]"
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: d.color }} />
                    {d.label} <span className="font-semibold text-[var(--ink)]">{d.val}%</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Materials table */}
        <div className="mt-3 rounded-xl border border-[var(--line)] bg-white p-3">
          <p className="mb-2 text-[10px] font-semibold text-[var(--ink-dim)]">Material stock</p>
          <div className="space-y-1.5">
            {materials.map((r) => (
              <div key={r.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded bg-orange-50 text-[var(--amber)]">
                    <Boxes size={11} />
                  </span>
                  <span className="text-[11px] font-medium text-[var(--ink)]">{r.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-[var(--ink-dim)]">{r.qty}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[8px] font-semibold ${r.tone}`}>
                    {r.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
