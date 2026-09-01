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
  return <script type="application/ld+json">{safe}</script>
}
