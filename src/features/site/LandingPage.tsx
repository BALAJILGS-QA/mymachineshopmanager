import { Link } from 'react-router-dom'
import {
  ArrowUpRight,
  CircleDot,
  Cog,
  Gauge,
  Layers,
  Ruler,
  ScanLine,
  ShieldCheck,
  Boxes,
  Wrench,
  ClipboardCheck,
  Factory,
} from 'lucide-react'
import { SiteLayout } from './SiteLayout'
import { useReveal } from './useReveal'
import { useSeo, SITE } from '@/lib/seo'
import { POSTS } from './blogData'
import { fmtDate } from '@/lib/format'

const CAPABILITIES = [
  { icon: CircleDot, title: 'CNC Turning', desc: 'Shafts, bushes, pulleys and cylindrical components with tight concentricity and fine finish.' },
  { icon: Layers, title: 'CNC Milling', desc: 'Brackets, housings, manifolds and contoured parts milled from solid billet.' },
  { icon: Wrench, title: 'Drilling & Tapping', desc: 'Precise hole patterns, threads and secondary operations to print.' },
  { icon: ScanLine, title: 'Inspection & QC', desc: 'Documented dimensional checks on critical features, batch after batch.' },
  { icon: Ruler, title: 'Prototyping', desc: 'One-off functional parts in production material, fast turnaround.' },
  { icon: Boxes, title: 'Batch Production', desc: 'Repeatable low-to-medium volume runs with full job traceability.' },
]

const PROCESS = [
  { n: '01', icon: Layers, title: 'Cutting', desc: 'Raw bar and billet cut to size against each company job.' },
  { n: '02', icon: CircleDot, title: 'Turning', desc: 'Diameters, tapers and threads turned to tolerance.' },
  { n: '03', icon: Cog, title: 'Milling', desc: 'Faces, slots, pockets and holes machined precisely.' },
  { n: '04', icon: Wrench, title: 'Drilling', desc: 'Hole patterns, tapping and deburring completed.' },
  { n: '05', icon: ClipboardCheck, title: 'Inspection', desc: 'Critical dimensions verified and recorded.' },
  { n: '06', icon: Factory, title: 'Packing', desc: 'Cleaned, packed and dispatched with delivery reference.' },
]

const MATERIALS = ['Mild Steel', 'EN8', 'EN19', 'EN24', 'SS 304', 'SS 316', 'Aluminium 6061', 'Brass', 'Cast Iron']

const INDUSTRIES = [
  { title: 'Pumps & Fluid', desc: 'Shafts, impeller casings, couplings and wear components.' },
  { title: 'General Engineering', desc: 'Precision parts and fixtures for machinery builders.' },
  { title: 'Industrial OEM', desc: 'Repeatable batch components with traceability.' },
  { title: 'Maintenance & Spares', desc: 'Reverse-engineered replacements for legacy equipment.' },
]

const STATS = [
  { v: '±0.01', u: 'mm', label: 'Achievable tolerance' },
  { v: '4', u: '+', label: 'Companies served' },
  { v: '100', u: '%', label: 'Job-level traceability' },
  { v: '24', u: 'hr', label: 'Quote turnaround' },
]

export function LandingPage() {
  useReveal()
  useSeo({
    path: '/',
    title: 'Sree Balaji Industries — Precision CNC Machining & Turning',
    description:
      'Precision CNC turning and milling for pumps, engineering and industrial components. Company-wise job tracking, tight tolerances and full traceability. Request a quote today.',
    type: 'website',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      name: 'Sree Balaji Industries',
      description:
        'Precision CNC machining, turning and milling services for pumps, engineering and industrial components.',
      url: SITE.BASE_URL,
      image: SITE.DEFAULT_IMAGE,
      email: 'contact@sreebalajiindustries.com',
      priceRange: '₹₹',
      areaServed: 'IN',
      makesOffer: CAPABILITIES.map((c) => ({
        '@type': 'Offer',
        itemOffered: { '@type': 'Service', name: c.title, description: c.desc },
      })),
    },
  })

  return (
    <SiteLayout>
      <Hero />
      <TrustBar />
      <Capabilities />
      <Process />
      <Materials />
      <Industries />
      <Stats />
      <BlogTeaser />
      <CtaBand />
    </SiteLayout>
  )
}

function Hero() {
  return (
    <section className="blueprint relative overflow-hidden border-b border-[var(--line)]">
      <div className="glow-amber pointer-events-none absolute inset-x-0 top-0 h-[520px]" />
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-20 md:grid-cols-[1.15fr_0.85fr] md:py-28">
        <div>
          <p className="kicker rise d1">Precision CNC Machining · Since 2016</p>
          <h1 className="display rise d2 mt-4 text-4xl font-bold leading-[1.02] sm:text-5xl md:text-6xl">
            Metal, machined to
            <span className="text-[var(--amber)]"> exact tolerance.</span>
          </h1>
          <p className="rise d3 mt-5 max-w-xl text-base leading-relaxed text-[var(--ink-dim)]">
            Sree Balaji Industries delivers CNC turning and milling for pumps, engineering and
            industrial components — with company-wise job tracking from raw material to dispatch.
          </p>
          <div className="rise d4 mt-8 flex flex-wrap items-center gap-3">
            <a href="/#contact" className="site-btn site-btn-primary">
              Request a Quote <ArrowUpRight size={16} />
            </a>
            <a href="/#capabilities" className="site-btn site-btn-ghost">
              Explore Capabilities
            </a>
          </div>
          <div className="rise d5 mt-10 flex flex-wrap gap-x-8 gap-y-3">
            {[
              { icon: Gauge, t: 'Tight tolerances' },
              { icon: ShieldCheck, t: 'Documented QC' },
              { icon: Boxes, t: 'Batch traceability' },
            ].map((f) => (
              <span key={f.t} className="flex items-center gap-2 text-sm text-[var(--ink-dim)]">
                <f.icon size={16} className="text-[var(--amber)]" /> {f.t}
              </span>
            ))}
          </div>
        </div>

        <div className="rise d3 relative mx-auto hidden aspect-square w-full max-w-sm md:block">
          <TechDial />
        </div>
      </div>
    </section>
  )
}

// Decorative precision dial / schematic.
function TechDial() {
  return (
    <svg viewBox="0 0 400 400" className="h-full w-full" role="img" aria-label="Precision machining schematic">
      <defs>
        <radialGradient id="g" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#182230" />
          <stop offset="100%" stopColor="#0b0f15" />
        </radialGradient>
      </defs>
      <circle cx="200" cy="200" r="190" fill="url(#g)" stroke="#232c38" />
      <g className="spin-slow" style={{ transformOrigin: '200px 200px' }}>
        <circle cx="200" cy="200" r="150" fill="none" stroke="#2b3646" strokeDasharray="2 10" />
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i / 12) * Math.PI * 2
          return (
            <line
              key={i}
              x1={200 + Math.cos(a) * 158}
              y1={200 + Math.sin(a) * 158}
              x2={200 + Math.cos(a) * 172}
              y2={200 + Math.sin(a) * 172}
              stroke="#3a4657"
              strokeWidth="2"
            />
          )
        })}
      </g>
      <circle cx="200" cy="200" r="110" fill="none" stroke="#ff7a1a" strokeOpacity="0.5" strokeWidth="1.5" />
      <circle cx="200" cy="200" r="70" fill="none" stroke="#4cc4f0" strokeOpacity="0.4" strokeWidth="1.5" />
      <line x1="30" y1="200" x2="370" y2="200" stroke="#ff7a1a" strokeOpacity="0.35" strokeWidth="1" />
      <line x1="200" y1="30" x2="200" y2="370" stroke="#ff7a1a" strokeOpacity="0.35" strokeWidth="1" />
      <circle cx="200" cy="200" r="14" fill="#ff7a1a" />
      <text x="200" y="300" textAnchor="middle" fill="#5f6b7c" fontFamily="monospace" fontSize="12">
        ⌀ 200.00 ±0.01
      </text>
    </svg>
  )
}

function TrustBar() {
  const names = ['Flowra Global', 'Vahinie Engineering', 'Nirmal Pumps', 'Local Partners']
  return (
    <section className="border-b border-[var(--line)] bg-[var(--bg-2)]">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-5 py-8 sm:flex-row sm:justify-between">
        <p className="mono text-xs uppercase tracking-widest text-[var(--ink-faint)]">Trusted by manufacturers</p>
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {names.map((n) => (
            <span key={n} className="display text-sm font-semibold text-[var(--ink-dim)]">
              {n}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

function SectionHead({ kicker, title, sub }: { kicker: string; title: string; sub?: string }) {
  return (
    <div className="reveal mx-auto max-w-2xl text-center">
      <p className="kicker">{kicker}</p>
      <h2 className="display mt-3 text-3xl font-bold sm:text-4xl">{title}</h2>
      {sub && <p className="mt-3 text-[var(--ink-dim)]">{sub}</p>}
    </div>
  )
}

function Capabilities() {
  return (
    <section id="capabilities" className="mx-auto max-w-6xl px-5 py-20 md:py-24">
      <SectionHead
        kicker="Capabilities"
        title="What we machine"
        sub="A focused set of precision services, run with process discipline around every cut."
      />
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CAPABILITIES.map((c, i) => (
          <div
            key={c.title}
            className="reveal group rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 transition hover:border-[var(--amber)]/50 hover:shadow-[0_20px_50px_-30px_rgba(255,122,26,0.6)]"
            style={{ transitionDelay: `${i * 40}ms` }}
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--amber)]/12 text-[var(--amber)] ring-1 ring-[var(--amber)]/25">
              <c.icon size={20} />
            </span>
            <h3 className="display mt-4 text-lg font-semibold">{c.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--ink-dim)]">{c.desc}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function Process() {
  return (
    <section id="process" className="border-y border-[var(--line)] bg-[var(--bg-2)]">
      <div className="mx-auto max-w-6xl px-5 py-20 md:py-24">
        <SectionHead
          kicker="Process"
          title="From bar stock to dispatch"
          sub="Every job flows through the same disciplined route — tracked at each stage in our system."
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PROCESS.map((s, i) => (
            <div
              key={s.n}
              className="reveal relative overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6"
              style={{ transitionDelay: `${i * 40}ms` }}
            >
              <span className="mono absolute right-4 top-3 text-3xl font-bold text-white/5">{s.n}</span>
              <s.icon size={22} className="text-[var(--steel)]" />
              <h3 className="display mt-3 text-lg font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-sm text-[var(--ink-dim)]">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Materials() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 md:py-24">
      <SectionHead kicker="Materials" title="Metals we work with" />
      <div className="reveal mt-10 flex flex-wrap justify-center gap-3">
        {MATERIALS.map((m) => (
          <span
            key={m}
            className="mono rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--ink-dim)] transition hover:border-[var(--amber)]/60 hover:text-[var(--ink)]"
          >
            {m}
          </span>
        ))}
      </div>
    </section>
  )
}

function Industries() {
  return (
    <section id="industries" className="border-y border-[var(--line)] bg-[var(--bg-2)]">
      <div className="mx-auto max-w-6xl px-5 py-20 md:py-24">
        <SectionHead kicker="Industries" title="Who we build for" />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {INDUSTRIES.map((c, i) => (
            <div
              key={c.title}
              className="reveal rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6"
              style={{ transitionDelay: `${i * 40}ms` }}
            >
              <h3 className="display text-lg font-semibold text-[var(--amber-soft)]">{c.title}</h3>
              <p className="mt-2 text-sm text-[var(--ink-dim)]">{c.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Stats() {
  return (
    <section className="blueprint relative border-b border-[var(--line)]">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-5 py-16 lg:grid-cols-4">
        {STATS.map((s, i) => (
          <div key={s.label} className="reveal text-center" style={{ transitionDelay: `${i * 60}ms` }}>
            <p className="display text-4xl font-bold text-[var(--ink)] sm:text-5xl">
              {s.v}
              <span className="text-[var(--amber)]">{s.u}</span>
            </p>
            <p className="mono mt-2 text-xs uppercase tracking-wider text-[var(--ink-faint)]">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function BlogTeaser() {
  const posts = POSTS.slice(0, 3)
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 md:py-24">
      <div className="reveal flex items-end justify-between gap-4">
        <div>
          <p className="kicker">Insights</p>
          <h2 className="display mt-3 text-3xl font-bold sm:text-4xl">From the workshop</h2>
        </div>
        <Link to="/blog" className="site-btn site-btn-ghost hidden sm:inline-flex">
          All articles <ArrowUpRight size={16} />
        </Link>
      </div>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {posts.map((p, i) => (
          <Link
            key={p.slug}
            to={`/blog/${p.slug}`}
            className="reveal group flex flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] transition hover:border-[var(--amber)]/50"
            style={{ transitionDelay: `${i * 50}ms` }}
          >
            <div
              className="relative h-36 overflow-hidden"
              style={{ background: `linear-gradient(135deg, ${p.accent}22, transparent 70%), #0e141c` }}
            >
              <div className="blueprint absolute inset-0 opacity-60" />
              <Cog size={72} className="absolute -right-4 -bottom-4 opacity-10" style={{ color: p.accent }} />
              <span className="mono absolute left-4 top-4 text-[10px] uppercase tracking-widest" style={{ color: p.accent }}>
                {p.tags[0]}
              </span>
            </div>
            <div className="flex flex-1 flex-col p-5">
              <h3 className="display text-base font-semibold leading-snug transition group-hover:text-[var(--amber-soft)]">
                {p.title}
              </h3>
              <p className="mt-2 line-clamp-2 flex-1 text-sm text-[var(--ink-dim)]">{p.excerpt}</p>
              <p className="mono mt-4 text-[11px] text-[var(--ink-faint)]">
                {fmtDate(p.date)} · {p.readMins} min read
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

function CtaBand() {
  return (
    <section className="relative overflow-hidden border-t border-[var(--line)] bg-[var(--bg-2)]">
      <div className="glow-amber pointer-events-none absolute inset-x-0 bottom-0 h-full" />
      <div className="reveal mx-auto max-w-4xl px-5 py-20 text-center md:py-24">
        <h2 className="display text-3xl font-bold sm:text-4xl">
          Have a drawing? <span className="text-[var(--amber)]">Let's machine it.</span>
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[var(--ink-dim)]">
          Send us a 2D drawing or 3D model with material, quantity and tolerances. We'll come back
          with a quote — usually within a day.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a href="mailto:contact@sreebalajiindustries.com" className="site-btn site-btn-primary">
            Email your enquiry <ArrowUpRight size={16} />
          </a>
          <Link to="/login" className="site-btn site-btn-ghost">
            Client Portal Login
          </Link>
        </div>
      </div>
    </section>
  )
}
