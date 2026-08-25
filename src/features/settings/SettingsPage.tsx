import { useRef, useState } from 'react'
import {
  ArrowLeft,
  ChevronRight,
  Coins,
  Database,
  Download,
  Hash,
  KeyRound,
  Layers,
  ListChecks,
  Plus,
  Ruler,
  Save,
  Store,
  Tags,
  Upload,
  Wand2,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { settingsRepo, productRepo, BusinessRuleError } from '@/data/repo'
import { useDb } from '@/data/store'
import { exportDb, importDb, resetDb, saveDb } from '@/data/db'
import { buildInitialDb } from '@/data/seed'
import { loadDemoData } from '@/data/demo'
import { currency, setCurrency } from '@/lib/format'
import { PageHeader } from '@/components/common/PageHeader'
import { Card, Field, Input, SectionTitle, Textarea } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useAuth } from '@/features/auth/auth'

type SectionKey =
  | 'profile'
  | 'financial'
  | 'units'
  | 'materialTypes'
  | 'expenseCategories'
  | 'products'
  | 'numbering'
  | 'password'
  | 'data'

const MENU: { key: SectionKey; title: string; desc: string; icon: LucideIcon }[] = [
  { key: 'profile', title: 'Shop Profile', desc: 'Name, tagline, address & SEO', icon: Store },
  { key: 'financial', title: 'Financial & Rules', desc: 'Currency, tax, CGST/SGST, policies', icon: Coins },
  { key: 'units', title: 'Units', desc: 'Measurement units for materials', icon: Ruler },
  { key: 'materialTypes', title: 'Material Types / Grades', desc: 'Grades for materials', icon: Layers },
  { key: 'expenseCategories', title: 'Expense Categories', desc: 'Heads used for expenses', icon: Tags },
  { key: 'products', title: 'Machining Rate List', desc: 'Parts and their rates', icon: ListChecks },
  { key: 'numbering', title: 'Document Numbering', desc: 'Number formats for documents', icon: Hash },
  { key: 'password', title: 'Change Password', desc: 'Login credential', icon: KeyRound },
  { key: 'data', title: 'Data & Backup', desc: 'Export, restore, reset', icon: Database },
]

export function SettingsPage() {
  const settings = useDb((db) => db.settings)
  const toast = useToast()
  const confirm = useConfirm()
  const [section, setSection] = useState<SectionKey | null>(null)

  const active = MENU.find((m) => m.key === section)

  function renderSection() {
    switch (section) {
      case 'profile':
        return <CompanyProfile />
      case 'financial':
        return <FinancialSettings />
      case 'units':
        return (
          <ListEditor
            title="Units"
            subtitle="Measurement units for materials"
            value={settings.units}
            onSave={(units) => {
              settingsRepo.update({ units })
              toast.success('Units updated')
            }}
          />
        )
      case 'materialTypes':
        return (
          <ListEditor
            title="Material Types / Grades"
            subtitle="Grades available when defining materials"
            value={settings.materialTypes}
            onSave={(materialTypes) => {
              settingsRepo.update({ materialTypes })
              toast.success('Material types updated')
            }}
          />
        )
      case 'expenseCategories':
        return (
          <ListEditor
            title="Expense Categories"
            subtitle="Categories used when recording expenses"
            value={settings.expenseCategories}
            onSave={(expenseCategories) => {
              settingsRepo.update({ expenseCategories })
              toast.success('Expense categories updated')
            }}
          />
        )
      case 'products':
        return <ProductsCard />
      case 'numbering':
        return <NumberingSettings />
      case 'password':
        return <ChangePassword />
      case 'data':
        return <DataManagement toast={toast} confirm={confirm} />
      default:
        return null
    }
  }

  // Section view.
  if (active) {
    return (
      <div>
        <PageHeader
          title={active.title}
          subtitle={active.desc}
          actions={
            <button className="btn-secondary" onClick={() => setSection(null)}>
              <ArrowLeft size={16} /> All settings
            </button>
          }
        />
        <div className="max-w-2xl">{renderSection()}</div>
      </div>
    )
  }

  // Menu view.
  return (
    <div>
      <PageHeader title="Settings" subtitle="Choose a section to configure" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {MENU.map((m) => (
          <button
            key={m.key}
            onClick={() => setSection(m.key)}
            className="flex items-center gap-3 rounded-xl border border-slate-300 bg-white p-4 text-left shadow-sm transition hover:border-brand-400 hover:shadow-md"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700 ring-1 ring-brand-300">
              <m.icon size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-900">{m.title}</span>
              <span className="block truncate text-xs text-slate-500">{m.desc}</span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-slate-400" />
          </button>
        ))}
      </div>
    </div>
  )
}

// Machining rate list — e.g. "Open Well Bracket" ₹16.00. Used to prefill
// invoice and delivery-challan line items.
function ProductsCard() {
  const products = useDb((db) => db.products)
  const units = useDb((db) => db.settings.units)
  const toast = useToast()
  const confirm = useConfirm()
  const [name, setName] = useState('')
  const [rate, setRate] = useState('')
  const [unit, setUnit] = useState(units[0] ?? 'Nos')

  function add() {
    try {
      productRepo.create({ name, rate: Number(rate) || 0, unit, active: true })
      setName('')
      setRate('')
      toast.success('Product added')
    } catch (e) {
      toast.error(e instanceof BusinessRuleError ? e.message : 'Add failed')
    }
  }
  async function remove(id: string, label: string) {
    const ok = await confirm({ message: `Remove "${label}" from the rate list?`, danger: true })
    if (!ok) return
    productRepo.remove(id)
    toast.success('Removed')
  }

  return (
    <Card className="p-4 lg:col-span-2">
      <SectionTitle
        title="Machining Rate List"
        subtitle="Parts and their machining cost (e.g. Open Well Bracket ₹16.00). Used to prefill invoices and challans."
      />
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <Field label="Part / Product" className="flex-1">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Open Well Bracket" />
        </Field>
        <Field label="Rate (₹)" className="w-28">
          <Input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="16.00" />
        </Field>
        <Field label="Unit" className="w-24">
          <select className="input" value={unit} onChange={(e) => setUnit(e.target.value)}>
            {units.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </Field>
        <button className="btn-primary mb-0.5" onClick={add}>
          <Plus size={16} /> Add
        </button>
      </div>

      {products.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="th">Code</th>
                <th className="th">Part / Product</th>
                <th className="th">Unit</th>
                <th className="th text-right">Rate</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.map((p) => (
                <tr key={p.id}>
                  <td className="td font-mono text-xs text-slate-500">{p.code}</td>
                  <td className="td font-medium text-slate-800">{p.name}</td>
                  <td className="td">{p.unit || '—'}</td>
                  <td className="td text-right">{currency(p.rate)}</td>
                  <td className="td text-right">
                    <button className="btn-ghost btn-sm text-red-500" onClick={() => remove(p.id, p.name)}>
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

function CompanyProfile() {
  const company = useDb((db) => db.settings.company)
  const toast = useToast()
  const [form, setForm] = useState(company)

  return (
    <Card className="p-4">
      <SectionTitle
        title="Shop Profile"
        subtitle="Shop name & tagline show across every page and on printed invoices; SEO applies site-wide"
      />
      <div className="mt-3 space-y-3">
        <Field label="Shop Name" hint="Displayed in the sidebar, browser tab and page metadata everywhere">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Address">
          <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
        </div>
        <Field label="GSTIN">
          <Input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
        </Field>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-700">SEO (applied globally)</p>
          <div className="space-y-3">
            <Field label="Meta Description" hint="Used for the page description across the app">
              <Textarea
                rows={2}
                value={form.seoDescription}
                onChange={(e) => setForm({ ...form, seoDescription: e.target.value })}
              />
            </Field>
            <Field label="Keywords" hint="Comma-separated keywords for search metadata">
              <Input
                value={form.seoKeywords}
                onChange={(e) => setForm({ ...form, seoKeywords: e.target.value })}
              />
            </Field>
          </div>
        </div>

        <button
          className="btn-primary"
          onClick={() => {
            settingsRepo.update({ company: form })
            toast.success('Shop profile saved — changes apply across all pages')
          }}
        >
          <Save size={16} /> Save profile
        </button>
      </div>
    </Card>
  )
}

function FinancialSettings() {
  const settings = useDb((db) => db.settings)
  const toast = useToast()
  const [form, setForm] = useState({
    currency: settings.currency,
    currencySymbol: settings.currencySymbol,
    defaultTaxPercent: String(settings.defaultTaxPercent),
    defaultCgstPercent: String(settings.defaultCgstPercent ?? settings.defaultTaxPercent / 2),
    defaultSgstPercent: String(settings.defaultSgstPercent ?? settings.defaultTaxPercent / 2),
    allowOverproduction: settings.allowOverproduction,
    allowNegativeStock: settings.allowNegativeStock,
  })

  return (
    <Card className="p-4">
      <SectionTitle title="Financial & Rules" subtitle="Currency, tax and validation policy" />
      <div className="mt-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Currency Code">
            <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
          </Field>
          <Field label="Currency Symbol">
            <Input value={form.currencySymbol} onChange={(e) => setForm({ ...form, currencySymbol: e.target.value })} />
          </Field>
        </div>
        <Field label="Default Tax %" hint="Combined GST used as a fallback">
          <Input
            type="number"
            step="0.01"
            value={form.defaultTaxPercent}
            onChange={(e) => setForm({ ...form, defaultTaxPercent: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Default CGST %" hint="Auto-fills new invoices">
            <Input
              type="number"
              step="0.01"
              value={form.defaultCgstPercent}
              onChange={(e) => setForm({ ...form, defaultCgstPercent: e.target.value })}
            />
          </Field>
          <Field label="Default SGST %" hint="Auto-fills new invoices">
            <Input
              type="number"
              step="0.01"
              value={form.defaultSgstPercent}
              onChange={(e) => setForm({ ...form, defaultSgstPercent: e.target.value })}
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={form.allowOverproduction}
            onChange={(e) => setForm({ ...form, allowOverproduction: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300"
          />
          Allow completed quantity to exceed ordered (overproduction)
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={form.allowNegativeStock}
            onChange={(e) => setForm({ ...form, allowNegativeStock: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300"
          />
          Allow stock to go negative without override
        </label>
        <button
          className="btn-primary"
          onClick={() => {
            settingsRepo.update({
              currency: form.currency,
              currencySymbol: form.currencySymbol,
              defaultTaxPercent: Number(form.defaultTaxPercent) || 0,
              defaultCgstPercent: Number(form.defaultCgstPercent) || 0,
              defaultSgstPercent: Number(form.defaultSgstPercent) || 0,
              allowOverproduction: form.allowOverproduction,
              allowNegativeStock: form.allowNegativeStock,
            })
            setCurrency(form.currencySymbol, form.currency)
            toast.success('Settings saved')
          }}
        >
          <Save size={16} /> Save
        </button>
      </div>
    </Card>
  )
}

function NumberingSettings() {
  const numbering = useDb((db) => db.settings.numbering)
  const toast = useToast()
  const [form, setForm] = useState(numbering)
  const fields: { key: keyof typeof numbering; label: string }[] = [
    { key: 'job', label: 'Job Order' },
    { key: 'invoice', label: 'Invoice' },
    { key: 'receipt', label: 'Material Receipt' },
    { key: 'issue', label: 'Material Issue' },
    { key: 'adjustment', label: 'Adjustment' },
    { key: 'payment', label: 'Payment' },
    { key: 'expense', label: 'Expense' },
    { key: 'dc', label: 'Delivery Challan' },
  ]

  return (
    <Card className="p-4">
      <SectionTitle title="Document Numbering" subtitle="Tokens: {FY} {YYYY} {YY} {MM} {####}" />
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <Field key={f.key} label={f.label}>
            <Input
              value={form[f.key]}
              onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
            />
          </Field>
        ))}
      </div>
      <button
        className="btn-primary mt-3"
        onClick={() => {
          settingsRepo.update({ numbering: form })
          toast.success('Numbering saved')
        }}
      >
        <Save size={16} /> Save numbering
      </button>
    </Card>
  )
}

function ListEditor({
  title,
  subtitle,
  value,
  onSave,
}: {
  title: string
  subtitle: string
  value: string[]
  onSave: (items: string[]) => void
}) {
  const [text, setText] = useState(value.join('\n'))

  return (
    <Card className="p-4">
      <SectionTitle title={title} subtitle={subtitle} />
      <textarea
        className="input mt-3 h-40 font-mono text-xs"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="One value per line"
      />
      <button
        className="btn-primary mt-3"
        onClick={() =>
          onSave(
            text
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean),
          )
        }
      >
        <Save size={16} /> Save
      </button>
    </Card>
  )
}

function ChangePassword() {
  const { changePassword } = useAuth()
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')

  async function submit() {
    if (next.length < 4) return toast.error('New password must be at least 4 characters')
    const ok = await changePassword(current, next)
    if (ok) {
      toast.success('Password changed')
      setCurrent('')
      setNext('')
    } else {
      toast.error('Current password is incorrect')
    }
  }

  return (
    <Card className="p-4">
      <SectionTitle title="Change Password" subtitle="Admin login credential" />
      <div className="mt-3 space-y-3">
        <Field label="Current Password">
          <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="New Password">
          <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <button className="btn-primary" onClick={submit}>
          <KeyRound size={16} /> Update password
        </button>
      </div>
    </Card>
  )
}

function DataManagement({
  toast,
  confirm,
}: {
  toast: ReturnType<typeof useToast>
  confirm: ReturnType<typeof useConfirm>
}) {
  const fileRef = useRef<HTMLInputElement>(null)

  function backup() {
    const blob = new Blob([exportDb()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cnc-shop-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Backup downloaded')
  }

  async function restore(file: File) {
    try {
      const text = await file.text()
      importDb(text)
      toast.success('Backup restored')
      setTimeout(() => window.location.reload(), 400)
    } catch {
      toast.error('Invalid backup file')
    }
  }

  async function demo() {
    const ok = await confirm({
      title: 'Load demo data',
      message: 'This replaces all current data with a realistic sample dataset. Continue?',
      danger: true,
      confirmLabel: 'Load demo',
    })
    if (!ok) return
    loadDemoData()
    toast.success('Demo data loaded')
    setTimeout(() => window.location.reload(), 400)
  }

  async function reset() {
    const ok = await confirm({
      title: 'Reset all data',
      message: 'This permanently deletes all data and restores the initial companies. Continue?',
      danger: true,
      confirmLabel: 'Reset everything',
    })
    if (!ok) return
    resetDb()
    saveDb(buildInitialDb())
    toast.success('Data reset')
    setTimeout(() => window.location.reload(), 400)
  }

  return (
    <Card className="p-4 lg:col-span-2">
      <SectionTitle
        title="Data & Backup"
        subtitle="Data is stored locally in this browser. Back up regularly before treating it as your only record."
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn-secondary" onClick={backup}>
          <Download size={16} /> Download backup (JSON)
        </button>
        <button className="btn-secondary" onClick={() => fileRef.current?.click()}>
          <Upload size={16} /> Restore backup
        </button>
        <button className="btn-secondary" onClick={demo}>
          <Wand2 size={16} /> Load demo data
        </button>
        <button className="btn-danger" onClick={reset}>
          <Trash2 size={16} /> Reset all data
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void restore(f)
            e.target.value = ''
          }}
        />
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-2xs text-slate-500">
        <Database size={13} /> For a hosted multi-user deployment, connect the repository layer to Supabase
        (see docs/supabase-schema.sql).
      </p>
    </Card>
  )
}
