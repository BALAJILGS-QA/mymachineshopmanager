// Blog content for the marketing site. Kept as structured data so posts render
// consistently and feed SEO metadata + JSON-LD (BlogPosting).

export type Block =
  | { t: 'p'; text: string }
  | { t: 'h2'; text: string }
  | { t: 'ul'; items: string[] }
  | { t: 'quote'; text: string }

export interface Post {
  slug: string
  title: string
  excerpt: string
  date: string // ISO
  author: string
  readMins: number
  tags: string[]
  accent: string // hex for cover motif
  body: Block[]
}

export const POSTS: Post[] = [
  {
    slug: 'complete-guide-to-cnc-machining-services',
    title: 'A Complete Guide to CNC Machining Services in 2026',
    excerpt:
      'What CNC machining actually involves, when to use it, and how to get precise, repeatable parts made without wasting time or money.',
    date: '2026-08-10',
    author: 'Sree Balaji Industries',
    readMins: 7,
    tags: ['CNC', 'Manufacturing', 'Guide'],
    accent: '#ff7a1a',
    body: [
      { t: 'p', text: 'CNC (Computer Numerical Control) machining turns a digital design into a physical metal or plastic part by removing material with high-speed cutting tools. Because the machine follows a program rather than a human hand, it delivers the two things every engineer wants: precision and repeatability.' },
      { t: 'h2', text: 'When CNC machining is the right choice' },
      { t: 'p', text: 'CNC is ideal when you need tight tolerances, excellent surface finish, and parts that are identical from the first piece to the thousandth. It suits prototypes and production runs alike.' },
      { t: 'ul', items: ['Functional prototypes that must match final material properties', 'Low-to-medium volume production of precision components', 'Complex geometries that casting or 3D printing cannot hold to tolerance', 'Replacement parts for legacy machinery'] },
      { t: 'h2', text: 'The core processes' },
      { t: 'p', text: 'Most shops combine turning (rotating the part against a fixed tool, ideal for shafts and cylindrical work) and milling (rotating the tool against a fixed part, ideal for prismatic features, slots and pockets). Secondary operations such as drilling, tapping, grinding and inspection complete the part.' },
      { t: 'quote', text: 'A good CNC partner is measured less by the machine and more by the process discipline around it — fixturing, inspection and traceability.' },
      { t: 'h2', text: 'What to send your machine shop' },
      { t: 'p', text: 'Provide a 2D drawing with critical dimensions and tolerances, or a 3D model (STEP/IGES). Call out the material grade, quantity, surface finish, and any heat or batch traceability requirements. The clearer the brief, the faster and cheaper the quote.' },
    ],
  },
  {
    slug: 'cnc-turning-vs-milling',
    title: 'CNC Turning vs. Milling: Which Process Fits Your Part?',
    excerpt:
      'Turning and milling solve different problems. Here is a practical way to decide which one — or both — your component needs.',
    date: '2026-07-28',
    author: 'Sree Balaji Industries',
    readMins: 5,
    tags: ['CNC', 'Turning', 'Milling'],
    accent: '#38bdf8',
    body: [
      { t: 'p', text: 'The quickest way to choose between turning and milling is to look at the shape of your part and how its features are arranged around it.' },
      { t: 'h2', text: 'Choose turning when the part is round' },
      { t: 'p', text: 'Turning rotates the workpiece against a single-point tool. It excels at cylindrical geometry — shafts, bushes, pulleys, threaded studs and pump components — producing excellent concentricity and surface finish.' },
      { t: 'h2', text: 'Choose milling for prismatic features' },
      { t: 'p', text: 'Milling rotates the cutter against a fixed part, carving slots, pockets, faces, holes and 3D contours. Brackets, housings, manifolds and plates are natural milling jobs.' },
      { t: 'ul', items: ['Round, symmetrical part → turning', 'Flat, boxy or contoured part → milling', 'Round body with off-axis holes or flats → turning plus live tooling or a second milling operation'] },
      { t: 'p', text: 'Many real components need both. A pump shaft may be turned for its diameters, then milled for a keyway. A capable shop plans the operation sequence so the part is held accurately at every step.' },
    ],
  },
  {
    slug: 'choosing-the-right-material-for-cnc-parts',
    title: 'How to Choose the Right Material for Your CNC Parts',
    excerpt:
      'Steel, stainless, aluminium or brass? A simple framework for matching material to function, cost and machinability.',
    date: '2026-07-12',
    author: 'Sree Balaji Industries',
    readMins: 6,
    tags: ['Materials', 'Engineering'],
    accent: '#a3e635',
    body: [
      { t: 'p', text: 'Material selection drives strength, corrosion resistance, weight, cost and how easily the part can be machined. Start from the function, then balance the trade-offs.' },
      { t: 'h2', text: 'Common CNC materials at a glance' },
      { t: 'ul', items: ['Mild steel (EN8, IS 2062): strong, economical, general engineering parts', 'Alloy steel (EN19, EN24): higher strength for shafts and gears', 'Stainless steel (304, 316): corrosion resistance for food, marine and chemical use', 'Aluminium (6061): light, excellent machinability, good for housings and brackets', 'Brass: easy to machine, great for fittings and electrical components'] },
      { t: 'h2', text: 'A quick selection framework' },
      { t: 'p', text: 'Ask three questions: What loads and environment will the part see? What weight and finish does it need? What is the budget per piece? Corrosion or hygiene points to stainless; weight-critical parts point to aluminium; high mechanical load points to alloy steel.' },
      { t: 'quote', text: 'The cheapest material is rarely the cheapest part — machinability and scrap rates matter just as much as raw stock price.' },
    ],
  },
  {
    slug: 'understanding-machining-tolerances',
    title: 'Understanding Tolerances: What ±0.01 mm Really Means',
    excerpt:
      'Tolerances decide whether parts fit and function. Learn how to specify them so you get precision where it matters — and pay for it only there.',
    date: '2026-06-30',
    author: 'Sree Balaji Industries',
    readMins: 5,
    tags: ['Quality', 'Tolerances'],
    accent: '#f472b6',
    body: [
      { t: 'p', text: 'A tolerance is the allowable deviation from a nominal dimension. A 20 mm shaft with a ±0.01 mm tolerance may measure between 19.99 and 20.01 mm and still be correct.' },
      { t: 'h2', text: 'Tighter is not always better' },
      { t: 'p', text: 'Every extra decimal place of precision costs time in machining, tooling and inspection. Specify tight tolerances only on the features that mate or seal, and open up the rest.' },
      { t: 'ul', items: ['Mating diameters, bearing seats and sealing faces: tight', 'Clearance holes and cosmetic surfaces: standard', 'Non-functional edges: general tolerance per the drawing block'] },
      { t: 'h2', text: 'How we hold and verify tolerance' },
      { t: 'p', text: 'Consistent fixturing, sharp tooling, temperature-stable measurement and documented inspection keep parts inside tolerance batch after batch. Ask your shop how they inspect and whether they provide measurement records for critical dimensions.' },
    ],
  },
  {
    slug: 'reduce-cnc-machining-costs',
    title: '5 Ways to Reduce CNC Machining Costs Without Losing Quality',
    excerpt:
      'Small design and ordering decisions can cut machining cost significantly. Here are five that consistently pay off.',
    date: '2026-06-15',
    author: 'Sree Balaji Industries',
    readMins: 4,
    tags: ['Cost', 'Design for Manufacturing'],
    accent: '#facc15',
    body: [
      { t: 'p', text: 'Machining cost is driven by material, machine time and setups. A few upfront choices reduce all three without compromising the part.' },
      { t: 'h2', text: 'Design and order smarter' },
      { t: 'ul', items: ['Loosen non-critical tolerances so the shop can run faster', 'Avoid deep pockets and thin walls that need special tooling', 'Standardise hole sizes to common drill and tap dimensions', 'Batch parts together to amortise setup time across quantity', 'Provide a clean 3D model and drawing to avoid back-and-forth'] },
      { t: 'p', text: 'A shop that understands design for manufacturing will flag cost drivers early. Share your intent, not just the drawing — often a small change saves a large amount.' },
    ],
  },
]

export function getPost(slug: string): Post | undefined {
  return POSTS.find((p) => p.slug === slug)
}
