'use client'
import { useEffect } from 'react'
import { initSaved, subscribeSaved, toggleSaved, type SavedItem } from './savedStore'

// Page-wide reader behaviour, delegated so no headline mounts its own component:
//  · read state (localStorage, per device): opened rows dim; Top 7 shows "Caught up" when all read
//  · save (★ button or "s") and share (native sheet, clipboard fallback)
//  · keyboard: j/k move between rows, o opens, s saves, / or ⌘K focuses the command bar, Esc closes
const READ = 'db:read'

function loadRead(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(READ) || '[]')) } catch { return new Set() }
}
function saveRead(s: Set<string>) {
  try { localStorage.setItem(READ, JSON.stringify(Array.from(s).slice(-800))) } catch { /* private mode */ }
}

export default function ReaderState({ saved, authed, lang = 'en' }: { saved: SavedItem[]; authed: boolean; lang?: string }) {
  useEffect(() => {
    const es = lang === 'es'
    initSaved(saved, authed)
    const read = loadRead()

    const rows = () => Array.from(document.querySelectorAll<HTMLElement>('[data-row]')).filter((r) => r.offsetParent !== null)

    function paintRead() {
      document.querySelectorAll<HTMLElement>('[data-row]').forEach((r) => r.classList.toggle('is-read', read.has(r.dataset.l || '')))
      const top = Array.from(document.querySelectorAll<HTMLElement>('#db-top [data-row]'))
      const caught = document.getElementById('db-caught')
      if (caught && top.length) {
        const n = top.filter((r) => read.has(r.dataset.l || '')).length
        const all = n === top.length
        caught.hidden = !all
        caught.textContent = es ? `Al día · ${n} leídas` : `Caught up · ${n} read`
      }
    }
    function markRead(l: string) {
      if (!l || read.has(l)) return
      read.add(l)
      saveRead(read)
      paintRead()
    }
    function paintSaved(list: SavedItem[]) {
      const set = new Set(list.map((x) => x.l))
      document.querySelectorAll<HTMLElement>('.db-save').forEach((b) => {
        const on = set.has(b.dataset.l || '')
        b.setAttribute('aria-pressed', on ? 'true' : 'false')
        b.setAttribute('aria-label', on ? (es ? 'Quitar de guardados' : 'Remove from saved') : (es ? 'Guardar' : 'Save'))
      })
    }
    function save(b: HTMLElement) {
      toggleSaved({ l: b.dataset.l || '', t: b.dataset.t || '', s: b.dataset.s || '', d: b.dataset.d || null })
    }
    async function share(b: HTMLElement) {
      const url = b.dataset.l || ''
      if (!url) return
      try {
        if (navigator.share) await navigator.share({ title: b.dataset.t || '', url })
        else {
          await navigator.clipboard.writeText(url)
          b.classList.add('is-done')
          setTimeout(() => b.classList.remove('is-done'), 1200)
        }
      } catch { /* share sheet dismissed */ }
    }

    const unsub = subscribeSaved(paintSaved)
    paintRead()

    function onClick(e: MouseEvent) {
      const t = e.target as HTMLElement
      const sv = t.closest<HTMLElement>('.db-save')
      if (sv) { e.preventDefault(); e.stopPropagation(); save(sv); return }
      const sh = t.closest<HTMLElement>('.db-share')
      if (sh) { e.preventDefault(); e.stopPropagation(); share(sh); return }
      const a = t.closest<HTMLAnchorElement>('a[href]')
      const row = a?.closest<HTMLElement>('[data-row]')
      if (row) markRead(row.dataset.l || '')
    }
    // Middle-click / cmd-click also count as opening.
    function onAux(e: MouseEvent) {
      const row = (e.target as HTMLElement).closest<HTMLElement>('[data-row]')
      if (row && (e.target as HTMLElement).closest('a[href]')) markRead(row.dataset.l || '')
    }

    let cur = -1
    function focusRow(i: number) {
      const list = rows()
      if (!list.length) return
      cur = Math.max(0, Math.min(list.length - 1, i))
      list.forEach((r) => r.classList.remove('is-focus'))
      const r = list[cur]
      r.classList.add('is-focus')
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      r.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' })
    }
    function currentRow(): HTMLElement | null {
      const list = rows()
      const f = document.querySelector<HTMLElement>('[data-row].is-focus')
      if (f && list.includes(f)) { cur = list.indexOf(f); return f }
      return null
    }
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName) || t?.isContentEditable
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); window.dispatchEvent(new Event('db:cmd-focus')); return
      }
      if (e.key === 'Escape') {
        window.dispatchEvent(new Event('db:esc'))
        document.querySelectorAll('[data-row].is-focus').forEach((r) => r.classList.remove('is-focus'))
        if (typing) (t as HTMLElement).blur()
        return
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '/') { e.preventDefault(); window.dispatchEvent(new Event('db:cmd-focus')); return }
      if (e.key === 'j' || e.key === 'k') {
        e.preventDefault()
        const f = currentRow()
        focusRow(f ? cur + (e.key === 'j' ? 1 : -1) : 0)
        return
      }
      if (e.key === 'Enter' && /^(BUTTON|A|SUMMARY)$/.test(t?.tagName)) return
      const r = currentRow()
      if (!r) return
      if (e.key === 'o' || e.key === 'Enter') {
        const a = r.querySelector<HTMLAnchorElement>('a[href]')
        if (a) { e.preventDefault(); markRead(r.dataset.l || ''); window.open(a.href, '_blank', 'noopener') }
      } else if (e.key === 's') {
        const b = r.querySelector<HTMLElement>('.db-save')
        if (b) { e.preventDefault(); save(b) }
      }
    }

    document.addEventListener('click', onClick)
    document.addEventListener('auxclick', onAux)
    document.addEventListener('keydown', onKey)
    return () => {
      unsub()
      document.removeEventListener('click', onClick)
      document.removeEventListener('auxclick', onAux)
      document.removeEventListener('keydown', onKey)
    }
  }, [saved, authed, lang])
  return null
}
