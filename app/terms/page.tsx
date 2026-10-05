// Public /terms route — Terms & Conditions. Server-rendered legal content in the
// site shell, with SEO metadata + WebPage JSON-LD. Linked from the sign-in page
// (next to the password field), the landing auth card and the footer.

import type { Metadata } from 'next'
import { SiteChrome } from '../_site/site-chrome'
import { JsonLd } from '../_site/json-ld'
import { SITE } from '@/lib/site-meta'
import { BRAND } from '@/lib/brand'
import '@/index.css'

const TITLE = `Terms & Conditions — ${BRAND.product}`
const DESCRIPTION = `The terms and conditions governing your use of ${BRAND.product}, the machine-shop management platform for job orders, inventory, invoicing, payments and operations.`

// Human-readable effective date. Update this whenever the terms materially change.
const LAST_UPDATED = '5 October 2026'

export const metadata: Metadata = {
  metadataBase: new URL(SITE.BASE_URL),
  title: TITLE,
  description: DESCRIPTION,
  keywords: BRAND.keywords,
  alternates: { canonical: `${SITE.BASE_URL}/terms` },
  robots: 'index,follow',
  openGraph: {
    siteName: SITE.SITE_NAME,
    title: TITLE,
    description: DESCRIPTION,
    type: 'website',
    url: `${SITE.BASE_URL}/terms`,
    images: [SITE.DEFAULT_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [SITE.DEFAULT_IMAGE],
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: TITLE,
  description: DESCRIPTION,
  url: `${SITE.BASE_URL}/terms`,
  inLanguage: 'en',
  publisher: {
    '@type': 'Organization',
    name: BRAND.legalName,
    alternateName: BRAND.product,
    url: SITE.BASE_URL,
    email: BRAND.contact.email,
  },
}

// Each section renders as a titled block. `body` paragraphs and optional `bullets`
// keep the markup consistent and the copy easy to maintain.
interface Clause {
  h: string
  body: string[]
  bullets?: string[]
}

const CLAUSES: Clause[] = [
  {
    h: '1. Acceptance of these Terms',
    body: [
      `These Terms & Conditions ("Terms") form a binding agreement between you (and the organisation you represent) and ${BRAND.legalName} ("${BRAND.product}", "we", "us" or "our") and govern your access to and use of the ${BRAND.product} web application, together with its features, modules and related services (collectively, the "Service").`,
      'By registering for, signing in to, or otherwise using the Service, you confirm that you have read, understood and agree to be bound by these Terms. If you do not agree, you must not access or use the Service.',
    ],
  },
  {
    h: '2. Definitions',
    body: ['In these Terms:'],
    bullets: [
      '"Account" means the credentials and profile used to access the Service.',
      '"Workspace" or "Tenant" means the isolated environment that holds your organisation’s records within the Service.',
      '"Customer Data" means all data, records and content that you or your users enter into, upload to, or generate within the Service — including job orders, inventory, invoices, payments, expenses, employee and customer records.',
      '"Users" means the individuals you authorise to access your Workspace.',
    ],
  },
  {
    h: '3. Eligibility and registration',
    body: [
      'You must be at least 18 years old and capable of entering into a legally binding contract to use the Service. If you use the Service on behalf of a business, you represent that you are authorised to bind that business to these Terms.',
      'Access to the Service is granted through a registration and approval process. Submitting a registration does not by itself create an active account — access begins only after your registration is approved by an administrator. We may decline, delay or revoke access at our discretion.',
    ],
  },
  {
    h: '4. Accounts, access and security',
    body: [
      'You are responsible for maintaining the confidentiality of your login credentials and for all activity that occurs under your Account. You agree to keep your password secure, to use a strong password, and to notify us promptly of any unauthorised use of your Account.',
      'The Service uses role-based access controls. Where you grant other Users access to your Workspace, you are responsible for their use of the Service and for assigning appropriate permissions. We are not liable for loss arising from your failure to safeguard credentials or manage access.',
    ],
  },
  {
    h: '5. Your data and ownership',
    body: [
      'As between you and us, you retain all right, title and interest in and to your Customer Data. We do not claim ownership of your Customer Data.',
      'You grant us a limited, non-exclusive licence to host, process, transmit, back up and display your Customer Data solely as necessary to provide, maintain, secure and improve the Service for you.',
      'The Service is multi-tenant: your Workspace is logically isolated from other organisations’ data. You are responsible for the accuracy, quality and legality of the Customer Data you enter and for having the right to use it.',
    ],
  },
  {
    h: '6. Acceptable use',
    body: ['You agree that you will not, and will not permit your Users to:'],
    bullets: [
      'use the Service in violation of any applicable law or regulation;',
      'upload or process data you do not have the right to use, or that infringes the rights of others;',
      'attempt to gain unauthorised access to the Service, other tenants’ data, or related systems or networks;',
      'probe, scan, reverse-engineer, decompile or disrupt the Service, or circumvent its security or access controls;',
      'introduce malware, or use the Service to store or transmit unlawful, infringing or harmful content;',
      'resell, sublicense or provide the Service to third parties except your authorised Users.',
    ],
  },
  {
    h: '7. Service, licence and modules',
    body: [
      'Subject to these Terms, we grant you a limited, non-exclusive, non-transferable right to access and use the Service for your internal business operations. The Service may include modules such as production and job orders, inventory and stock, purchases, sales and invoicing, payments, accounting and GST, job work, tool room, workforce/HR and reporting.',
      'The Service is provided on an evolving basis. We may add, change, or remove features and modules over time to improve the product. We will aim to avoid materially reducing core functionality you rely on without reasonable notice.',
    ],
  },
  {
    h: '8. Trials, subscriptions and fees',
    body: [
      'We may offer free trials and paid subscription plans. Where a plan carries fees, those fees, the billing cycle and any applicable taxes will be communicated to you before you subscribe. Unless stated otherwise, fees are non-refundable except where required by law.',
      'We may change our pricing or plans on a prospective basis with reasonable notice. Continuing to use a paid Service after a price change takes effect constitutes acceptance of the new fees.',
    ],
  },
  {
    h: '9. Tax, GST and compliance documents',
    body: [
      'The Service can help you prepare business documents such as invoices, delivery challans, and GST-related outputs including e-invoice and e-way bill data. These features are provided as tools to assist you.',
      'You remain solely responsible for the accuracy of the information you enter and for ensuring that your documents, filings and tax treatment comply with the laws and statutory requirements applicable to you. Always verify statutory details against current government requirements. We do not provide legal, accounting or tax advice.',
    ],
  },
  {
    h: '10. Third-party services',
    body: [
      'The Service relies on third-party infrastructure and service providers (for example, cloud hosting, database and authentication providers) to operate. Your use of the Service may therefore be subject to those providers’ availability and terms. We are not responsible for the acts or omissions of third-party providers beyond our reasonable control.',
    ],
  },
  {
    h: '11. Intellectual property',
    body: [
      `All intellectual property rights in and to the Service — including its software, design, interfaces, trademarks and documentation — are and remain owned by ${BRAND.legalName} and its licensors. Except for the limited rights expressly granted to you, nothing in these Terms transfers any such rights to you.`,
    ],
  },
  {
    h: '12. Privacy and data protection',
    body: [
      'We process personal data contained in your Account and Customer Data to provide and support the Service. We apply reasonable technical and organisational measures designed to protect data against unauthorised access, loss or disclosure. No method of transmission or storage is completely secure, and we cannot guarantee absolute security.',
      'You are responsible for complying with any privacy and data-protection obligations that apply to the personal data you upload about your own employees, customers and contacts.',
    ],
  },
  {
    h: '13. Availability, backups and support',
    body: [
      'We aim to keep the Service available and reliable, but we do not guarantee uninterrupted or error-free operation. The Service may be unavailable from time to time for maintenance, updates or reasons outside our control.',
      'While the Service maintains cloud-hosted records, you are encouraged to export and retain your own copies of important data. We are not liable for any loss of data except to the extent caused by our gross negligence.',
    ],
  },
  {
    h: '14. Disclaimers',
    body: [
      'To the maximum extent permitted by law, the Service is provided "as is" and "as available", without warranties of any kind, whether express, implied or statutory, including any implied warranties of merchantability, fitness for a particular purpose, accuracy, or non-infringement. We do not warrant that the Service will meet your specific requirements or that results obtained from it will be accurate or reliable.',
    ],
  },
  {
    h: '15. Limitation of liability',
    body: [
      'To the maximum extent permitted by law, we will not be liable for any indirect, incidental, special, consequential or punitive damages, or for any loss of profits, revenue, goodwill or data, arising out of or relating to your use of (or inability to use) the Service.',
      'To the maximum extent permitted by law, our total aggregate liability arising out of or relating to these Terms or the Service will not exceed the amount you paid to us for the Service in the twelve (12) months immediately preceding the event giving rise to the claim (or, where the Service was provided free of charge, a nominal sum).',
    ],
  },
  {
    h: '16. Indemnification',
    body: [
      'You agree to indemnify and hold us harmless from and against any claims, liabilities, damages, losses and expenses (including reasonable legal fees) arising out of or related to your Customer Data, your use of the Service, or your breach of these Terms or of any applicable law.',
    ],
  },
  {
    h: '17. Suspension and termination',
    body: [
      'We may suspend or terminate your access to the Service if you breach these Terms, if required by law, or to protect the security and integrity of the Service or other users. You may stop using the Service at any time.',
      'On termination, your right to access the Service ceases. We may delete or de-provision your Workspace and Customer Data after a reasonable period, unless a longer retention is required by law. Please export any data you wish to keep before terminating.',
    ],
  },
  {
    h: '18. Changes to these Terms',
    body: [
      'We may update these Terms from time to time. When we make material changes, we will update the "Last updated" date above and, where appropriate, provide additional notice. Your continued use of the Service after changes take effect constitutes acceptance of the revised Terms.',
    ],
  },
  {
    h: '19. Governing law',
    body: [
      'These Terms are governed by and construed in accordance with the laws of India, without regard to its conflict-of-laws principles. Subject to any mandatory rights you may have, the courts of India will have jurisdiction over any dispute arising out of or relating to these Terms or the Service.',
    ],
  },
  {
    h: '20. Contact us',
    body: [
      `If you have any questions about these Terms, please contact us at ${BRAND.contact.email}.`,
    ],
  },
]

export default function TermsPage() {
  return (
    <SiteChrome showFooter>
      <JsonLd data={jsonLd} />

      {/* Hero */}
      <section className="blueprint relative overflow-hidden border-b border-[var(--line)]">
        <div className="glow-amber pointer-events-none absolute inset-x-0 top-0 h-[320px]" />
        <div className="relative mx-auto max-w-4xl px-5 py-20 text-center">
          <p className="kicker rise d1">Legal</p>
          <h1 className="display rise d2 mt-4 text-4xl font-bold leading-[1.05] text-[var(--ink)] sm:text-5xl">
            Terms &amp; <span className="grad">Conditions</span>
          </h1>
          <p className="rise d3 mx-auto mt-5 max-w-2xl text-base leading-relaxed text-[var(--ink-dim)]">
            Please read these terms carefully. They govern your access to and use of {BRAND.product}
            .
          </p>
          <p className="rise d4 mono mt-4 text-xs text-[var(--ink-faint)]">
            Last updated: {LAST_UPDATED}
          </p>
        </div>
      </section>

      {/* Body */}
      <section className="border-t border-[var(--line)] bg-white/50">
        <div className="mx-auto max-w-3xl px-5 py-16">
          <div className="space-y-10">
            {CLAUSES.map((c) => (
              <div key={c.h} className="reveal">
                <h2 className="display text-xl font-bold text-[var(--ink)] sm:text-2xl">{c.h}</h2>
                {c.body.map((p, i) => (
                  <p
                    key={i}
                    className="mt-3 text-sm leading-relaxed text-[var(--ink-dim)] sm:text-base"
                  >
                    {p}
                  </p>
                ))}
                {c.bullets && (
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-[var(--ink-dim)] sm:text-base">
                    {c.bullets.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          <p className="mt-12 border-t border-[var(--line)] pt-6 text-xs leading-relaxed text-[var(--ink-faint)]">
            These Terms are provided for general informational purposes and do not constitute legal
            advice. You may wish to seek independent legal counsel before relying on them.
          </p>
        </div>
      </section>
    </SiteChrome>
  )
}
