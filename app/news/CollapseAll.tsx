'use client'

// One header button to minimize every section at once (and expand them all back).
// LayoutEnhancer owns the mini state + persistence; this just asks it to toggle.
export default function CollapseAll() {
  return (
    <button
      title="collapse / expand all sections"
      onClick={() => window.dispatchEvent(new Event('db:collapse-all'))}
      className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-semibold dark:border-neutral-700"
    >
      ⊟
    </button>
  )
}
