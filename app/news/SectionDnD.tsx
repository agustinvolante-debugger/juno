'use client'
import { useEffect } from 'react'
import { sectionIds, saveOrder, moveSection, toast } from './soft'

// Drag a Today section by its grip (desktop) to change the order; arrow keys on the grip move it
// one place. One listener for the whole page. The page re-renders from the saved order, so the
// DOM is never rearranged by hand (React would then put sections in the wrong place).
export default function SectionDnD({ lang = 'en' }: { lang?: string }) {
  useEffect(() => {
    const es = lang === 'es'
    let drag: { id: string; el: HTMLElement; line: HTMLDivElement; target: string | null; after: boolean } | null = null

    const onDown = (e: PointerEvent) => {
      const grip = (e.target as Element).closest<HTMLElement>('.db-grip')
      if (!grip || e.button !== 0) return
      const el = grip.closest<HTMLElement>('.db-sections > section[data-id]')
      if (!el) return
      e.preventDefault()
      const line = document.createElement('div')
      line.className = 'db-drop-line'
      document.body.appendChild(line)
      el.classList.add('is-dragging')
      document.documentElement.classList.add('db-is-dragging')
      drag = { id: el.dataset.id!, el, line, target: null, after: false }
    }
    const onMove = (e: PointerEvent) => {
      if (!drag) return
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('.db-sections > section[data-id]')
      if (!over || over === drag.el) { drag.target = null; drag.line.style.display = 'none'; return }
      const r = over.getBoundingClientRect()
      drag.after = e.clientY > r.top + r.height / 2
      drag.target = over.dataset.id!
      Object.assign(drag.line.style, { display: 'block', left: `${r.left}px`, width: `${r.width}px`, top: `${(drag.after ? r.bottom + 14 : r.top - 16) + window.scrollY}px` })
    }
    const onUp = async () => {
      if (!drag) return
      const { id, el, line, target, after } = drag
      drag = null
      line.remove()
      el.classList.remove('is-dragging')
      document.documentElement.classList.remove('db-is-dragging')
      if (!target) return
      const ids = sectionIds().filter((x) => x !== id)
      ids.splice(ids.indexOf(target) + (after ? 1 : 0), 0, id)
      el.classList.add('is-moving')
      await saveOrder(ids)
      toast({ text: es ? 'Orden guardado' : 'Order saved' })
    }
    const onKey = (e: KeyboardEvent) => {
      const grip = (e.target as Element)?.closest?.('.db-grip')
      if (!grip || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
      const id = grip.closest<HTMLElement>('section[data-id]')?.dataset.id
      if (!id) return
      e.preventDefault()
      void moveSection(id, e.key === 'ArrowUp' ? -1 : 1)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
      document.removeEventListener('keydown', onKey)
    }
  }, [lang])
  return null
}
