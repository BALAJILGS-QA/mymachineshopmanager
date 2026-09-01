// Renders a JSON-LD <script> tag safely, using escaped text children (no raw
// HTML injection API).
//
// `<`, `>` and `&` are pre-escaped to their JSON unicode forms (< etc.),
// which (a) keeps the payload valid JSON that crawlers decode correctly, and
// (b) makes a "</script>" breakout impossible — so this is XSS-safe even if a
// value ever contained markup. Because the escaped string has no raw <, > or &,
// React emits it verbatim as text children (no entity mangling).
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  const safe = JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
  // id kept identical to the Vite app's useSeo() so SEO checks (and the e2e
  // spec asserting script#route-jsonld) hold across both builds. Exactly one
  // page (and thus one JsonLd) is mounted at a time.
  return (
    <script id="route-jsonld" type="application/ld+json">
      {safe}
    </script>
  )
}
