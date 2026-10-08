// Page updates without a full reload. AutoRefresh listens for db:refresh and calls
// router.refresh() (server re-render, scroll and client state kept); Toaster listens for db:toast.

export function softRefresh() {
  window.dispatchEvent(new Event('db:refresh'))
}

export type ToastOpts = {
  text: string
  undoLabel?: string
  onUndo?: () => void | Promise<void>
  // Runs when the toast closes without Undo. Lets a removal wait out the undo window
  // before it is actually deleted.
  onCommit?: () => void | Promise<void>
}

export function toast(opts: ToastOpts) {
  window.dispatchEvent(new CustomEvent<ToastOpts>('db:toast', { detail: opts }))
}

// Hide a section card at once while its removal waits in the undo window.
export function hideCard(id: string, hidden: boolean) {
  document.querySelectorAll<HTMLElement>(`[data-id="${CSS.escape(id)}"]`).forEach((el) => { el.hidden = hidden })
}

// Section order: the Today sections as they sit on the page, saved per reader.
export function sectionIds(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.db-sections > section[data-id]')).map((el) => el.dataset.id || '').filter(Boolean)
}
export async function saveOrder(ids: string[]) {
  await fetch('/api/news/prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: ids }) })
  softRefresh()
}
// Move one section up or down by one place. Returns false at either end.
export async function moveSection(id: string, dir: -1 | 1): Promise<boolean> {
  const ids = sectionIds()
  const i = ids.indexOf(id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= ids.length) return false
  ;[ids[i], ids[j]] = [ids[j], ids[i]]
  document.querySelector(`.db-sections > section[data-id="${CSS.escape(id)}"]`)?.classList.add('is-moving')
  await saveOrder(ids)
  return true
}
