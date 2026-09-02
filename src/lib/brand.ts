// Product identity for the login / marketing surface. The *shop* name shown
// inside the authenticated app is configurable (Settings → Shop Profile) and
// read from settings.company.name; this constant is the fixed product brand
// used pre-authentication where no shop settings are loaded yet.
export const BRAND = {
  product: 'Machine Shop Management',
  legalName: 'Sree Balaji Industries',
  description:
    'Machine Shop Management — track job orders, materials, delivery challans, invoices, payments and expenses for your machine shop, company-wise, from order to dispatch.',
  keywords:
    'machine shop management, CNC shop software, job order tracking, delivery challan, invoicing, materials stock, payments, machine shop ERP',
  // Contact details surfaced on the marketing/login page (Contact Us section,
  // footer and Organization JSON-LD). Keep in one place so the visible copy and
  // the structured data never drift apart.
  contact: {
    email: 'mymachineshopmanager@gmail.com',
    location: 'India',
  },
}
