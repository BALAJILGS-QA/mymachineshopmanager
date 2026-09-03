import { useState } from 'react'
import { clsx } from 'clsx'
import { Percent } from 'lucide-react'
import { MasterManager } from '@/features/hrm/components/MasterManager'
import { useFinanceAccess } from '../access'
import { useCompanies } from '@/features/companies/hooks/useCompanies'
import { useGstRegistrations, useGstTaxRates, useHsnCodes } from '../hooks/useFinance'
import { PageHeader } from '@/components/common/PageHeader'
import { Badge, Field, Input, Select } from '@/components/ui/primitives'
import type { DataTableColumn } from '@/components/common/DataTable'
import type { GstRegistration, GstTaxRate, HsnCode } from '../types'

const TABS = ['Registrations', 'Tax Rates', 'HSN / SAC'] as const
type Tab = (typeof TABS)[number]

export function GstConfigPage() {
  const perms = useFinanceAccess()
  const canManage = perms.can('GST_MANAGE')
  const [tab, setTab] = useState<Tab>('Registrations')

  return (
    <div>
      <PageHeader
        title="Tax Configuration"
        subtitle="GST registrations, configurable tax-rate slabs, and the HSN/SAC master"
      />
      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              'border-b-2 px-3 py-2 text-sm font-medium',
              tab === t
                ? 'border-brand-500 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-700',
            )}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'Registrations' && <Registrations canManage={canManage} />}
      {tab === 'Tax Rates' && <TaxRates canManage={canManage} />}
      {tab === 'HSN / SAC' && <Hsn canManage={canManage} />}
    </div>
  )
}

function Registrations({ canManage }: { canManage: boolean }) {
  const { list, create, update, remove } = useGstRegistrations()
  const companies = useCompanies().data ?? []
  const columns: DataTableColumn<GstRegistration>[] = [
    { key: 'gstin', header: 'GSTIN', cellClassName: 'font-mono text-xs', render: (r) => r.gstin },
    {
      key: 'legal',
      header: 'Legal name',
      cellClassName: 'font-semibold',
      render: (r) => r.legalName,
    },
    {
      key: 'state',
      header: 'State',
      render: (r) => `${r.state ?? '—'}${r.stateCode ? ` (${r.stateCode})` : ''}`,
    },
    { key: 'type', header: 'Type', render: (r) => r.registrationType || '—' },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <Badge tone={r.status === 'active' ? 'green' : 'slate'}>{r.status}</Badge>,
    },
  ]
  return (
    <MasterManager<GstRegistration>
      title="GST Registrations"
      subtitle="One or more GSTINs for the business"
      addLabel="Add GSTIN"
      rows={list.data ?? []}
      loading={list.isLoading}
      columns={columns}
      canWrite={canManage}
      search={(r, q) => r.gstin.toLowerCase().includes(q) || r.legalName.toLowerCase().includes(q)}
      emptyDraft={() => ({
        legalName: '',
        gstin: '',
        status: 'active',
        registrationType: 'regular',
      })}
      toDraft={(r) => ({ ...r })}
      validate={(d) =>
        !String(d.gstin).trim()
          ? 'GSTIN is required'
          : !String(d.legalName).trim()
            ? 'Legal name is required'
            : null
      }
      onCreate={(d) => create.mutateAsync(d as Partial<GstRegistration>)}
      onUpdate={(id, d) => update.mutateAsync({ id, patch: d as Partial<GstRegistration> })}
      onDelete={(r) => remove.mutateAsync(r.id)}
      renderForm={(draft, patch) => (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="GSTIN" required>
            <Input
              value={String(draft.gstin ?? '')}
              onChange={(e) => patch({ gstin: e.target.value.toUpperCase() })}
              placeholder="22AAAAA0000A1Z5"
            />
          </Field>
          <Field label="Company">
            <Select
              value={String(draft.companyId ?? '')}
              onChange={(e) => patch({ companyId: e.target.value || undefined })}
            >
              <option value="">—</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Legal name" required>
            <Input
              value={String(draft.legalName ?? '')}
              onChange={(e) => patch({ legalName: e.target.value })}
            />
          </Field>
          <Field label="Trade name">
            <Input
              value={String(draft.tradeName ?? '')}
              onChange={(e) => patch({ tradeName: e.target.value })}
            />
          </Field>
          <Field label="Registration type">
            <Select
              value={String(draft.registrationType ?? 'regular')}
              onChange={(e) => patch({ registrationType: e.target.value })}
            >
              <option value="regular">Regular</option>
              <option value="composition">Composition</option>
              <option value="casual">Casual</option>
              <option value="sez">SEZ</option>
            </Select>
          </Field>
          <Field label="PAN">
            <Input
              value={String(draft.pan ?? '')}
              onChange={(e) => patch({ pan: e.target.value.toUpperCase() })}
            />
          </Field>
          <Field label="State">
            <Input
              value={String(draft.state ?? '')}
              onChange={(e) => patch({ state: e.target.value })}
            />
          </Field>
          <Field label="State code">
            <Input
              value={String(draft.stateCode ?? '')}
              onChange={(e) => patch({ stateCode: e.target.value })}
              placeholder="22"
            />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Input
              value={String(draft.address ?? '')}
              onChange={(e) => patch({ address: e.target.value })}
            />
          </Field>
        </div>
      )}
    />
  )
}

function TaxRates({ canManage }: { canManage: boolean }) {
  const { list, create, update, remove } = useGstTaxRates()
  const columns: DataTableColumn<GstTaxRate>[] = [
    { key: 'name', header: 'Slab', cellClassName: 'font-semibold', render: (r) => r.name },
    { key: 'total', header: 'Total %', cellClassName: 'tnum', render: (r) => `${r.totalRate}%` },
    { key: 'cgst', header: 'CGST', cellClassName: 'tnum', render: (r) => `${r.cgst}%` },
    { key: 'sgst', header: 'SGST', cellClassName: 'tnum', render: (r) => `${r.sgst}%` },
    { key: 'igst', header: 'IGST', cellClassName: 'tnum', render: (r) => `${r.igst}%` },
    { key: 'cess', header: 'Cess', cellClassName: 'tnum', render: (r) => `${r.cess}%` },
  ]
  return (
    <MasterManager<GstTaxRate>
      title="GST Tax Rates"
      subtitle="Configurable slabs — the calculator reads these, nothing is hardcoded"
      addLabel="Add Rate"
      emptyIcon={<Percent size={40} />}
      rows={list.data ?? []}
      loading={list.isLoading}
      columns={columns}
      canWrite={canManage}
      search={(r, q) => r.name.toLowerCase().includes(q)}
      emptyDraft={() => ({
        name: '',
        totalRate: 18,
        cgst: 9,
        sgst: 9,
        igst: 18,
        cess: 0,
        active: true,
      })}
      toDraft={(r) => ({ ...r })}
      validate={(d) => (!String(d.name).trim() ? 'Name is required' : null)}
      onCreate={(d) => create.mutateAsync(d as Partial<GstTaxRate>)}
      onUpdate={(id, d) => update.mutateAsync({ id, patch: d as Partial<GstTaxRate> })}
      onDelete={(r) => remove.mutateAsync(r.id)}
      renderForm={(draft, patch) => (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Name" required className="col-span-2 sm:col-span-3">
            <Input
              value={String(draft.name ?? '')}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="GST 18%"
            />
          </Field>
          <Field label="Total %">
            <Input
              type="number"
              value={String(draft.totalRate ?? 0)}
              onChange={(e) => patch({ totalRate: Number(e.target.value) })}
            />
          </Field>
          <Field label="CGST %">
            <Input
              type="number"
              value={String(draft.cgst ?? 0)}
              onChange={(e) => patch({ cgst: Number(e.target.value) })}
            />
          </Field>
          <Field label="SGST %">
            <Input
              type="number"
              value={String(draft.sgst ?? 0)}
              onChange={(e) => patch({ sgst: Number(e.target.value) })}
            />
          </Field>
          <Field label="IGST %">
            <Input
              type="number"
              value={String(draft.igst ?? 0)}
              onChange={(e) => patch({ igst: Number(e.target.value) })}
            />
          </Field>
          <Field label="Cess %">
            <Input
              type="number"
              value={String(draft.cess ?? 0)}
              onChange={(e) => patch({ cess: Number(e.target.value) })}
            />
          </Field>
        </div>
      )}
    />
  )
}

function Hsn({ canManage }: { canManage: boolean }) {
  const { list, create, update, remove } = useHsnCodes()
  const rates = useGstTaxRates().list.data ?? []
  const rateName = (id?: string) => rates.find((r) => r.id === id)?.name ?? '—'
  const columns: DataTableColumn<HsnCode>[] = [
    { key: 'code', header: 'Code', cellClassName: 'font-mono text-xs', render: (h) => h.code },
    {
      key: 'kind',
      header: 'Kind',
      render: (h) => (
        <Badge tone={h.kind === 'hsn' ? 'blue' : 'violet'}>{h.kind.toUpperCase()}</Badge>
      ),
    },
    { key: 'desc', header: 'Description', render: (h) => h.description || '—' },
    { key: 'rate', header: 'Rate', render: (h) => rateName(h.taxRateId) },
  ]
  return (
    <MasterManager<HsnCode>
      title="HSN / SAC Codes"
      subtitle="Commodity/service codes with their default GST rate"
      addLabel="Add Code"
      rows={list.data ?? []}
      loading={list.isLoading}
      columns={columns}
      canWrite={canManage}
      search={(h, q) =>
        h.code.toLowerCase().includes(q) || (h.description ?? '').toLowerCase().includes(q)
      }
      emptyDraft={() => ({ code: '', kind: 'hsn', active: true })}
      toDraft={(h) => ({ ...h })}
      validate={(d) => (!String(d.code).trim() ? 'Code is required' : null)}
      onCreate={(d) => create.mutateAsync(d as Partial<HsnCode>)}
      onUpdate={(id, d) => update.mutateAsync({ id, patch: d as Partial<HsnCode> })}
      onDelete={(h) => remove.mutateAsync(h.id)}
      renderForm={(draft, patch) => (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Code" required>
            <Input
              value={String(draft.code ?? '')}
              onChange={(e) => patch({ code: e.target.value })}
              placeholder="8207"
            />
          </Field>
          <Field label="Kind">
            <Select
              value={String(draft.kind ?? 'hsn')}
              onChange={(e) => patch({ kind: e.target.value })}
            >
              <option value="hsn">HSN (goods)</option>
              <option value="sac">SAC (services)</option>
            </Select>
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Input
              value={String(draft.description ?? '')}
              onChange={(e) => patch({ description: e.target.value })}
            />
          </Field>
          <Field label="Default tax rate">
            <Select
              value={String(draft.taxRateId ?? '')}
              onChange={(e) => patch({ taxRateId: e.target.value || undefined })}
            >
              <option value="">—</option>
              {rates.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Unit">
            <Input
              value={String(draft.unit ?? '')}
              onChange={(e) => patch({ unit: e.target.value })}
              placeholder="NOS / KG"
            />
          </Field>
        </div>
      )}
    />
  )
}
