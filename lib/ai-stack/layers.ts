/** The 16-layer taxonomy — the content spine. Order matters: 1 = closest to the electron. */

export type LayerDepth = "deep" | "summary";

export interface Layer {
  n: number;
  slug: string;
  name: string;
  short: string;
  depth: LayerDepth;
  /** CSS custom property for this layer's hue, e.g. "var(--layer-5)" */
  color: string;
}

export const LAYERS: Layer[] = [
  {
    n: 1,
    slug: "primary-energy",
    name: "Primary Energy",
    short: "Gas turbines, nuclear & SMRs, solar+storage, fuel supply",
    depth: "deep",
    color: "var(--layer-1)",
  },
  {
    n: 2,
    slug: "grid",
    name: "Grid & Interconnect",
    short: "Transformers, HV switchgear, ISO queues, PPAs, utilities",
    depth: "deep",
    color: "var(--layer-2)",
  },
  {
    n: 3,
    slug: "datacenter",
    name: "Datacenter Physical",
    short: "Shells, land, water, cooling, DC REITs, construction",
    depth: "summary",
    color: "var(--layer-3)",
  },
  {
    n: 4,
    slug: "fab-tooling",
    name: "Fab & Tooling",
    short: "ASML, TSMC, deposition/etch/metrology, advanced packaging",
    depth: "deep",
    color: "var(--layer-4)",
  },
  {
    n: 5,
    slug: "compute-silicon",
    name: "Compute Silicon",
    short: "GPUs, TPUs, custom ASICs, accelerator challengers",
    depth: "deep",
    color: "var(--layer-5)",
  },
  {
    n: 6,
    slug: "memory-interconnect",
    name: "Memory & Interconnect",
    short: "HBM, NVLink, InfiniBand vs Ethernet, optics",
    depth: "summary",
    color: "var(--layer-6)",
  },
  {
    n: 7,
    slug: "systems",
    name: "Systems & Integration",
    short: "OEMs/ODMs, rack-scale, Supermicro, Foxconn, Quanta",
    depth: "summary",
    color: "var(--layer-7)",
  },
  {
    n: 8,
    slug: "cloud",
    name: "Cloud & Neoclouds",
    short: "Hyperscalers, CoreWeave-class, capex, depreciation, SPVs",
    depth: "deep",
    color: "var(--layer-8)",
  },
  {
    n: 9,
    slug: "data-supply",
    name: "Data Supply",
    short: "Licensing, labeling, synthetic data, RL environments",
    depth: "summary",
    color: "var(--layer-9)",
  },
  {
    n: 10,
    slug: "foundation-models",
    name: "Foundation Models",
    short: "Frontier labs, open weights, training economics",
    depth: "deep",
    color: "var(--layer-10)",
  },
  {
    n: 11,
    slug: "inference",
    name: "Inference & Serving",
    short: "Token economics, batching, KV cache, price deflation",
    depth: "summary",
    color: "var(--layer-11)",
  },
  {
    n: 12,
    slug: "agent-infra",
    name: "Middleware & Agent Infra",
    short: "Orchestration, MCP, retrieval, evals, observability, sandboxes",
    depth: "summary",
    color: "var(--layer-12)",
  },
  {
    n: 13,
    slug: "applications",
    name: "Applications",
    short: "Horizontal assistants + vertical apps, seat vs outcome pricing",
    depth: "deep",
    color: "var(--layer-13)",
  },
  {
    n: 14,
    slug: "distribution",
    name: "Distribution & GTM",
    short: "Marketplaces, SIs, incumbent bundling, agent commerce",
    depth: "summary",
    color: "var(--layer-14)",
  },
  {
    n: 15,
    slug: "end-customer",
    name: "End Customer",
    short: "Enterprise budgets, ROI evidence, willingness to pay, churn",
    depth: "summary",
    color: "var(--layer-15)",
  },
  {
    n: 16,
    slug: "capital-policy",
    name: "Capital & Policy",
    short: "Circular deals, private credit, export controls, sovereign AI",
    depth: "deep",
    color: "var(--layer-16)",
  },
];

export function layerBySlug(slug: string): Layer | undefined {
  return LAYERS.find((l) => l.slug === slug);
}
