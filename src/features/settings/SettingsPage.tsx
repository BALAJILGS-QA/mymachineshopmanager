import { useRef, useState } from 'react'
import { Database, Download, KeyRound, Save, Upload, Wand2, Trash2 } from 'lucide-react'
import { settingsRepo } from '@/data/repo'
import { useDb } from '@/data/store'
import { exportDb, importDb, resetDb, saveDb } from '@/data/db'
import { buildInitialDb } from '@/data/seed'
import { loadDemoData } from '@/data/demo'
import { setCurrency } from '@/lib/format'
import { PageHeader } from '@/components/common/PageHeader'
import { Card, Field, Input, SectionTitle } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useAuth } from '@/features/auth/auth'

export function SettingsPage() {
  const settings = useDb((db) => db.settings)
  const toast = useToast()
  const confirm = useConfirm()

  return (
    <div>
      <PageHeader title="Settings" subtitle="Master data, numbering, company profile and backups" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CompanyProfile />
        <FinancialSettings />
        <ListEditor
          title="Units"
          subtitle="Measurement units for materials"
          value={settings.units}
          onSave={(units) => {
            settingsRepo.update({ units })
            toast.success('Units updated')
          }}
        />
        <ListEditor
          title="Material Types / Grades"
          subtitle="Grades available when defining materials"
          value={settings.materialTypes}
          onSave={(materialTypes) => {
            settingsRepo.update({ materialTypes })
            toast.success('Material types updated')
          }}
        />
        <ListEditor
          title="Expense Categories"
          subtitle="Categories used when recording expenses"
          value={settings.expenseCategories}
          onSave={(expenseCategories) => {
            settingsRepo.update({ expenseCategories })
            toast.success('Expense categories updated')
          }}
        />
        <NumberingSettings />
        <ChangePassword />
        <DataManagement toast={toast} confirm={confirm} />
      </div>
    </div>
  )
}

function CompanyProfile() {
  const company = useDb((db) => db.settings.company)
  const toast = useToast()
  const [form, setForm] = useState(company)

  return (
    <Card className="p-4">
      <SectionTitle title="Shop Profile" subtitle="Shown on printed invoices" />
      <div className="mt-3 space-y-3">
        <Field label="Shop Name">
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
        <button
          className="btn-primary"
          onClick={() => {
            settingsRepo.update({ company: form })
            toast.success('Shop profile saved')
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
        <Field label="Default Tax %">
          <Input
            type="number"
            step="0.01"
            value={form.defaultTaxPercent}
            onChange={(e) => setForm({ ...form, defaultTaxPercent: e.target.value })}
          />
        </Field>
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
      <p className="mt-3 flex items-center gap-1.5 text-2xs text-slate-400">
        <Database size={13} /> For a hosted multi-user deployment, connect the repository layer to Supabase
        (see docs/supabase-schema.sql).
      </p>
    </Card>
  )
}
