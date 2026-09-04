// Centralized SEO barrel. Import site config, the metadata builder and the
// Schema.org JSON-LD builders from one place:
//   import { seoConfig, buildMetadata, graph, breadcrumbSchema } from '@/lib/seo'
export * from './config'
export * from './metadata'
export * from './schema'
