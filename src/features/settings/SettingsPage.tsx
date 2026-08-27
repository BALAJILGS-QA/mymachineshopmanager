import { useState, type ChangeEvent } from 'react'
import {
  ArrowLeft,
  ChevronRight,
  Coins,
  Database,
  Hash,
  KeyRound,
  Layers,
  ListChecks,
  Plus,
  Ruler,
  Save,
  Store,
  Tags,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import {
  useSettings,
  useUpdateSettings,
  useProducts,
  useCreateProduct,
  useDeleteProduct,
} from './hooks/useSettings'
import { toUserMessage } from '@/lib/api/errors'
import { DEFAULT_SETTINGS } from '@/data/seed'
import { currency, setCurrency } from '@/lib/format'
import { PageHeader } from '@/components/common/PageHeader'
import { Card, Field, Input, SectionTitle, Select, Textarea } from '@/components/ui/primitives'
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
  {
    key: 'financial',
    title: 'Financial & Rules',
    desc: 'Currency, tax, CGST/SGST, policies',
    icon: Coins,
  },
  { key: 'units', title: 'Units', desc: 'Measurement units for materials', icon: Ruler },
  {
    key: 'materialTypes',
    title: 'Material Types / Grades',
    desc: 'Grades for materials',
    icon: Layers,
  },
  {
    key: 'expenseCategories',
    title: 'Expense Categories',
    desc: 'Heads used for expenses',
    icon: Tags,
  },
  {
    key: 'products',
    title: 'Machining Rate List',
    desc: 'Parts and their rates',
    icon: ListChecks,
  },
  {
    key: 'numbering',
    title: 'Document Numbering',
    desc: 'Number formats for documents',
    icon: Hash,
  },
  { key: 'password', title: 'Change Password', desc: 'Login credential', icon: KeyRound },
  { key: 'data', title: 'Data & Backup', desc: 'Cloud storage information', icon: Database },
]

export function SettingsPage() {
  const settings = useSettings().data ?? DEFAULT_SETTINGS
  const updateSettings = useUpdateSettings()
  const toast = useToast()
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
              updateSettings.mutate({ units })
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
              updateSettings.mutate({ materialTypes })
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
              updateSettings.mutate({ expenseCategories })
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
        return <DataManagement />
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
        <div className="mx-auto w-full max-w-3xl">{renderSection()}</div>
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
  const { data: products = [] } = useProducts()
  const units = useSettings().data?.units ?? DEFAULT_SETTINGS.units
  const createProduct = useCreateProduct()
  const deleteProduct = useDeleteProduct()
  const toast = useToast()
  const confirm = useConfirm()
  const [name, setName] = useState('')
  const [rate, setRate] = useState('')
  const [unit, setUnit] = useState(units[0] ?? 'Nos')

  async function add() {
    try {
      await createProduct.mutateAsync({ name, rate: Number(rate) || 0, unit, active: true })
      setName('')
      setRate('')
      toast.success('Product added')
    } catch (e) {
      toast.error(toUserMessage(e, 'Add failed'))
    }
  }
  async function remove(id: string, label: string) {
    const ok = await confirm({ message: `Remove "${label}" from the rate list?`, danger: true })
    if (!ok) return
    try {
      await deleteProduct.mutateAsync(id)
      toast.success('Removed')
    } catch (e) {
      toast.error(toUserMessage(e, 'Remove failed'))
    }
  }

  return (
    <Card className="p-4 lg:col-span-2">
      <SectionTitle
        title="Machining Rate List"
        subtitle="Parts and their machining cost (e.g. Open Well Bracket ₹16.00). Used to prefill invoices and challans."
      />
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <Field label="Part / Product" className="flex-1">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Open Well Bracket"
          />
        </Field>
        <Field label="Rate (₹)" className="w-28">
          <Input
            type="number"
            step="0.01"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder="16.00"
          />
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
                    <button
                      className="btn-ghost btn-sm text-red-500"
                      onClick={() => remove(p.id, p.name)}
                    >
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
  const company = useSettings().data?.company ?? DEFAULT_SETTINGS.company
  const updateSettings = useUpdateSettings()
  const toast = useToast()
  const [form, setForm] = useState(company)

  // Read an image file into a data URL stored on the profile (logo / favicon).
  function onPickImage(
    e: ChangeEvent<HTMLInputElement>,
    key: 'logoUrl' | 'faviconUrl',
    maxKb: number,
  ) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file later
    if (!file) return
    if (!file.type.startsWith('image/')) return toast.error('Please choose an image file')
    if (file.size > maxKb * 1024) return toast.error(`Image must be under ${maxKb} KB`)
    const reader = new FileReader()
    reader.onload = () => setForm((f) => ({ ...f, [key]: reader.result as string }))
    reader.onerror = () => toast.error('Could not read the file')
    reader.readAsDataURL(file)
  }

  return (
    <Card className="p-4">
      <SectionTitle
        title="Shop Profile"
        subtitle="Shop name & tagline show across every page and on printed invoices; SEO applies site-wide"
      />
      <div className="mt-3 space-y-3">
        <Field
          label="Shop Name"
          hint="Displayed in the sidebar, browser tab and page metadata everywhere"
        >
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Address">
          <Input
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone">
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>
          <Field label="Email">
            <Input
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
        </div>
        <Field label="GSTIN">
          <Input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
        </Field>
        <Field label="Business Type" hint="Sets the signatory line on printed documents">
          <Select
            value={form.isProprietor ? 'proprietor' : 'partner'}
            onChange={(e) => setForm({ ...form, isProprietor: e.target.value === 'proprietor' })}
          >
            <option value="proprietor">Proprietorship — sign as "Proprietor"</option>
            <option value="partner">Partnership / Other — "Partner / Authorised Signatory"</option>
          </Select>
        </Field>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-700">
            Branding (logo + favicon apply across every page)
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Company Logo" hint="Sidebar & header mark — square PNG/SVG, max 300 KB">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <img
                    src={form.logoUrl || '/sbi-logo.svg'}
                    alt="logo preview"
                    className="h-full w-full object-contain"
                  />
                </div>
                <label className="btn-secondary btn-sm cursor-pointer">
                  Upload
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => onPickImage(e, 'logoUrl', 300)}
                  />
                </label>
                {form.logoUrl && (
                  <button
                    className="btn-ghost btn-sm text-red-500"
                    onClick={() => setForm({ ...form, logoUrl: '' })}
                  >
                    Remove
                  </button>
                )}
              </div>
            </Field>
            <Field label="Favicon" hint="Browser-tab icon — square PNG/SVG, max 100 KB">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <img
                    src={form.faviconUrl || '/favicon.svg'}
                    alt="favicon preview"
                    className="h-8 w-8 object-contain"
                  />
                </div>
                <label className="btn-secondary btn-sm cursor-pointer">
                  Upload
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => onPickImage(e, 'faviconUrl', 100)}
                  />
                </label>
                {form.faviconUrl && (
                  <button
                    className="btn-ghost btn-sm text-red-500"
                    onClick={() => setForm({ ...form, faviconUrl: '' })}
                  >
                    Remove
                  </button>
                )}
              </div>
            </Field>
          </div>
        </div>

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
            updateSettings.mutate({ company: form })
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
  const settings = useSettings().data ?? DEFAULT_SETTINGS
  const updateSettings = useUpdateSettings()
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
            <Input
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            />
          </Field>
          <Field label="Currency Symbol">
            <Input
              value={form.currencySymbol}
              onChange={(e) => setForm({ ...form, currencySymbol: e.target.value })}
            />
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
            updateSettings.mutate({
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
  const numbering = useSettings().data?.numbering ?? DEFAULT_SETTINGS.numbering
  const updateSettings = useUpdateSettings()
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
          updateSettings.mutate({ numbering: form })
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

function DataManagement() {
  return (
    <Card className="p-4 lg:col-span-2">
      <SectionTitle title="Data & Backup" subtitle="Your data is stored securely in the cloud." />
      <p className="mt-3 flex items-start gap-2 text-xs text-slate-600">
        <Database size={16} className="mt-0.5 shrink-0" />
        <span>
          All records are saved to the hosted Supabase database in real time. Point-in-time backups
          and restores are managed from your Supabase project dashboard.
        </span>
      </p>
    </Card>
  )
}
