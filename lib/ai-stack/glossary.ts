/** The glossary is data, not prose — <Term> resolves against it and /glossary
 *  renders it, so a term can never be defined in two places and drift. */
export interface GlossaryEntry {
  /** kebab id, used as the anchor and the <Term id> */
  id: string;
  term: string;
  /** other spellings/abbreviations a reader might arrive with — DISPLAYED on /glossary */
  aka?: string[];
  /** retrieval-only phrasings: natural-language fragments a reader might type
   *  that should route here, but which would read as wrong if printed as an
   *  alias. Used by expandQuery; never rendered. */
  searchAliases?: string[];
  /** one sentence, plain language, no jargon of its own */
  short: string;
  /** why it matters on this site specifically */
  why?: string;
  /** layer slugs where it does the most work */
  layers?: string[];
}

export const GLOSSARY: GlossaryEntry[] = [
  {
    id: "capex",
    term: "Capital expenditure",
    aka: ["capex"],
    short:
      "Cash spent on long-lived physical assets — land, buildings, servers, transformers — rather than on running the business day to day.",
    why: "The whole AI buildout is a capex story. It hits cash immediately but earnings only gradually, through depreciation, which is why the gap between the two is the argument.",
    layers: ["cloud", "capital-policy"],
  },
  {
    id: "depreciation",
    term: "Depreciation",
    short:
      "Spreading the cost of an asset across the years it is expected to be useful, instead of expensing it all at once.",
    why: "The single most consequential estimate in the stack. Assume a GPU lasts six years instead of five and billions of dollars of operating income appear, without anything physical changing.",
    layers: ["cloud", "capital-policy"],
  },
  {
    id: "useful-life",
    term: "Useful life",
    aka: ["server life", "asset life", "depreciation schedule"],
    searchAliases: [
      "server lasts",
      "servers last",
      "how long a server",
      "lifespan",
    ],
    short:
      "How long a company assumes an asset will earn its keep — the number that sets the depreciation schedule.",
    why: "In January 2025 Amazon shortened server lives while Meta extended them. Same hardware, same quarter, opposite directions: the consensus broke in public.",
    layers: ["cloud"],
  },
  {
    id: "rpo",
    term: "Remaining performance obligation",
    aka: ["RPO", "backlog"],
    short:
      "Revenue a company has contracted for but not yet delivered or recognised.",
    why: "The best available evidence that AI demand is real rather than hoped for — but it measures obligations, not cash, and says nothing about cancellation terms.",
    layers: ["cloud", "distribution"],
  },
  {
    id: "run-rate",
    term: "Run rate",
    aka: ["ARR", "annualised revenue"],
    short:
      "A recent short period of revenue multiplied out to a year, as if it continued unchanged.",
    why: "Not the same thing as annual revenue, and the difference is where most AI-revenue confusion lives. A company can have a $47bn run rate and a much smaller recognised year.",
    layers: ["foundation-models", "applications"],
  },
  {
    id: "gross-vs-operating-margin",
    term: "Gross margin vs operating margin",
    short:
      "Gross margin is revenue less the direct cost of delivery. Operating margin subtracts everything else it takes to run the company.",
    why: "Comparing one to the other flatters whoever gets the gross figure. This site cut a headline for doing exactly that.",
    layers: ["memory-interconnect", "compute-silicon"],
  },
  {
    id: "cowos",
    term: "CoWoS",
    aka: ["chip-on-wafer-on-substrate", "advanced packaging"],
    short:
      "TSMC's advanced packaging process, which bonds logic dies and memory stacks onto a single substrate.",
    why: "The chokepoint moved here from wafer fabrication. TSMC's own CEO says packaging capacity is limiting his customers' growth.",
    layers: ["fab-tooling"],
  },
  {
    id: "hbm",
    term: "High-bandwidth memory",
    aka: ["HBM"],
    short:
      "DRAM stacked vertically and wired directly to a processor, trading cost for enormous memory bandwidth.",
    why: "The scarce input inside the scarce input. It is why a 'commodity' memory maker ran a 72% operating margin.",
    layers: ["memory-interconnect"],
  },
  {
    id: "euv",
    term: "Extreme ultraviolet lithography",
    aka: ["EUV", "Low-NA EUV", "High-NA EUV"],
    short:
      "The only production technique for printing the smallest chip features, sold by exactly one company.",
    why: "ASML ships on the order of 65 Low-NA systems a year. That integer is the physical ceiling on how fast leading-edge capacity can grow.",
    layers: ["fab-tooling"],
  },
  {
    id: "tpp",
    term: "Total processing performance",
    aka: ["TPP"],
    short:
      "A compute metric US export rules use to decide whether a chip may be sold to a restricted destination.",
    why: "The January 2026 rule caps China exports at 50% of cumulative TPP shipped to US customers — a compute-weighted, lifetime measure, not a unit count.",
    layers: ["capital-policy"],
  },
  {
    id: "neocloud",
    term: "Neocloud",
    short:
      "A cloud provider that rents GPUs and does essentially nothing else — CoreWeave, Nebius, Crusoe, Lambda.",
    why: "The hyperscaler business model without the other revenue to absorb a bad year, which makes it the layer's price-discovery mechanism.",
    layers: ["cloud"],
  },
  {
    id: "spv",
    term: "Special purpose vehicle",
    aka: ["SPV", "bankruptcy-remote subsidiary"],
    short:
      "A separate legal entity created to hold specific assets and debts, ring-fenced from its parent.",
    why: "How tens of billions of datacenter capex stays off the parent's balance sheet. Meta discloses $45.95bn of maximum exposure to loss against $1.83bn of carried equity in one such venture.",
    layers: ["capital-policy", "cloud"],
  },
  {
    id: "dscr",
    term: "Debt-service coverage ratio",
    aka: ["DSCR"],
    short:
      "Cash available to pay debt, divided by the debt payments due. A covenant sets the minimum.",
    why: "CoreWeave's 1.15x covenant binds on cash flow, not asset value — so it is the first thing a demand pause would touch.",
    layers: ["capital-policy"],
  },
  {
    id: "interconnection-queue",
    term: "Interconnection queue",
    short:
      "The waiting list to connect a new generator or a large load to the electricity grid.",
    why: "The bottleneck inverted: the queue that matters is now for large loads, not new generation. ERCOT's is about 5.1 times its all-time peak demand.",
    layers: ["grid"],
  },
  {
    id: "nameplate",
    term: "Nameplate capacity",
    short:
      "The maximum rated output of a plant or project, as opposed to what it actually delivers or whether it gets built.",
    why: "Queue totals are nameplate. Only a fraction of applicants ever sign an interconnection agreement — in one PJM cohort, 24%.",
    layers: ["grid", "primary-energy"],
  },
  {
    id: "ppa",
    term: "Power purchase agreement",
    aka: ["PPA"],
    short:
      "A long-term contract to buy electricity at an agreed price, usually from a specific plant.",
    why: "How hyperscalers lock in power. Watch for 'up to' — a headline megawatt figure is often a ceiling on a development framework, not contracted supply.",
    layers: ["primary-energy"],
  },
  {
    id: "slot-reservation",
    term: "Slot reservation agreement",
    aka: ["SRA"],
    short:
      "A non-binding hold on a future manufacturing slot, reported separately from firm orders and from backlog.",
    why: "Mixing reservations into orders is how a 3.7x book-to-ship ratio gets reported as 7x.",
    layers: ["primary-energy"],
  },
  {
    id: "consignment",
    term: "Consignment",
    short:
      "An arrangement where the customer owns the components and the manufacturer is paid only to assemble them.",
    why: "It never enters the assembler's revenue or costs, so identical work reports a higher margin on a smaller base. Nobody discloses the mix, which contaminates every margin comparison in the systems layer.",
    layers: ["systems"],
  },
  {
    id: "intersegment",
    term: "Intersegment revenue",
    short: "Revenue one division of a company books from another division.",
    why: "About 95% of Intel Foundry's revenue is Intel selling to Intel — the number that decides whether it is a merchant foundry yet.",
    layers: ["fab-tooling"],
  },
  {
    id: "macc",
    term: "Committed spend agreement",
    aka: ["MACC", "committed spend", "cloud commitment"],
    short:
      "A customer's contractual promise to spend a minimum amount with a cloud provider over several years.",
    why: "The real distribution moat. An eligible marketplace purchase can draw down 100% of the commitment, which moves procurement far more than a low marketplace fee does.",
    layers: ["distribution"],
  },
  {
    id: "mcp",
    term: "Model Context Protocol",
    aka: ["MCP"],
    short:
      "An open protocol for connecting models to external tools and data, donated to the Linux Foundation in December 2025.",
    why: "The clearest test of absorption: the protocol's own steward published research showing code execution collapsing its tool-calling overhead by 98.7%.",
    layers: ["agent-infra"],
  },
  {
    id: "first-token-economics",
    term: "Tokens",
    aka: ["token", "per-token pricing", "MTok"],
    short:
      "The unit models read and write in — roughly a word fragment. Inference is sold per million of them.",
    why: "The stack's meter. Per-capability token prices fall roughly an order of magnitude a year while training costs rise, and that scissors defines the model layer.",
    layers: ["inference", "foundation-models"],
  },
  {
    id: "t1-source",
    term: "Source tiers",
    aka: ["T1", "T2", "T3", "tier 1"],
    short:
      "This site's grading of evidence: T1 is filings, regulators and primary company documents; T2 is quality press and research shops; T3 is named-expert transcripts.",
    why: "53% of the corpus carries at least one T1 source. Where a claim rests on something weaker, the page says so rather than hiding it.",
  },
  {
    id: "steelman",
    term: "Steelman",
    short:
      "The strongest version of the argument against your own position, stated by someone who holds it.",
    why: "Every verdict on this site is followed immediately by one, attributed. A verdict without a named counterargument is an opinion wearing evidence.",
  },
];

export const glossaryById = new Map(GLOSSARY.map((g) => [g.id, g]));
