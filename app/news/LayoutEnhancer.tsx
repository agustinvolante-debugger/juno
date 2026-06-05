'use client'
import { useEffect } from 'react'

type Layout = { order?: string[]; wide?: string[]; mini?: string[] }

// Ports the prototype's layout interactions over the server-rendered cards:
// Tetris/masonry packing, drag-reorder, minimize, resize-to-wide. Persists to the account.
export default function LayoutEnhancer({ initial }: { initial: Layout }) {
  useEffect(() => {
    const grid = document.getElementById('db-grid')
    if (!grid) return
    const cards = () => Array.from(grid.querySelectorAll<HTMLElement>('.db-card'))

    // scoped styles
    if (!document.getElementById('db-layout-css')) {
      const st = document.createElement('style')
      st.id = 'db-layout-css'
      st.textContent =
        '.db-card.db-mini li:nth-child(n+4),.db-card.db-mini .db-meta{display:none}' +
        '.db-card.db-wide{grid-column:span 2}.db-card.db-drag{opacity:.35}' +
        '.db-ctl{display:inline-flex;gap:4px;margin-left:auto}' +
        '.db-ctl button{background:rgba(125,125,125,.18);border:none;border-radius:5px;cursor:pointer;font-size:12px;line-height:1;padding:2px 7px;color:inherit}' +
        '.db-card h2{cursor:grab}'
      document.head.appendChild(st)
    }

    // apply saved layout
    ;(initial.wide || []).forEach((id) => grid.querySelector(`[data-id="${CSS.escape(id)}"]`)?.classList.add('db-wide'))
    ;(initial.mini || []).forEach((id) => grid.querySelector(`[data-id="${CSS.escape(id)}"]`)?.classList.add('db-mini'))
    ;(initial.order || []).forEach((id) => {
      const c = grid.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)
      if (c) grid.appendChild(c)
    })

    function relayout() {
      const rh = 8, gap = 18
      cards().forEach((c) => (c.style.gridRowEnd = 'auto'))
      cards().forEach((c) => {
        const h = c.getBoundingClientRect().height
        c.style.gridRowEnd = 'span ' + Math.max(1, Math.ceil((h + gap) / (rh + gap)))
      })
    }

    let timer: any
    function persist() {
      clearTimeout(timer)
      timer = setTimeout(() => {
        const order = cards().map((c) => c.dataset.id)
        const wide = cards().filter((c) => c.classList.contains('db-wide')).map((c) => c.dataset.id)
        const mini = cards().filter((c) => c.classList.contains('db-mini')).map((c) => c.dataset.id)
        fetch('/api/news/prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ layout: { grid: { order, wide, mini } } }) }).catch(() => {})
      }, 600)
    }

    cards().forEach((c) => {
      const h2 = c.querySelector('h2')
      if (h2 && !h2.querySelector('.db-ctl')) {
        const ctl = document.createElement('span')
        ctl.className = 'db-ctl'
        const mini = document.createElement('button'); mini.textContent = '–'; mini.title = 'minimize'
        mini.onclick = (e) => { e.stopPropagation(); e.preventDefault(); c.classList.toggle('db-mini'); persist(); relayout() }
        const wide = document.createElement('button'); wide.textContent = '↔'; wide.title = 'resize'
        wide.onclick = (e) => { e.stopPropagation(); e.preventDefault(); c.classList.toggle('db-wide'); persist(); relayout() }
        ctl.append(mini, wide)
        h2.appendChild(ctl)
      }
      c.setAttribute('draggable', 'true')
      c.addEventListener('dragstart', () => c.classList.add('db-drag'))
      c.addEventListener('dragend', () => { c.classList.remove('db-drag'); persist(); relayout() })
      c.addEventListener('dragover', (e) => {
        e.preventDefault()
        const d = grid.querySelector<HTMLElement>('.db-drag')
        if (!d || d === c) return
        const r = c.getBoundingClientRect()
        grid.insertBefore(d, (e.clientY - r.top) / r.height > 0.5 ? c.nextSibling : c)
      })
    })

    grid.addEventListener('click', (e) => {
      const t = e.target as HTMLElement
      if (t?.tagName === 'BUTTON' || t?.tagName === 'A') setTimeout(relayout, 0)
    })

    relayout()
    const onResize = () => relayout()
    window.addEventListener('resize', onResize)
    const t2 = setTimeout(relayout, 300)
    return () => { window.removeEventListener('resize', onResize); clearTimeout(t2) }
  }, [])

  return null
}
