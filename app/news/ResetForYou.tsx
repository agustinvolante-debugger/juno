'use client'
import { softRefresh } from './soft'

// Clears the learned click-profile that powers For You. Lets the user "tune" by starting over.
// Labeled in words (not an ↺ icon) so nobody mistakes it for a refresh button —
// clearing the profile makes the whole For You section disappear until new clicks teach it again.
export default function ResetForYou({ lang = 'en' }: { lang?: string }) {
  const es = lang === 'es'
  return (
    <button
      title={es ? 'Empezar de cero: borra lo que Para ti aprendió de tus clics' : 'Start over: clears what For You learned from your clicks'}
      onClick={async () => {
        const ask = es
          ? '¿Reiniciar Para ti? Se BORRA lo que aprendió de tus clics; la sección desaparece hasta que hagas clic en más artículos.'
          : 'Reset For You? This ERASES what it learned from your clicks — the section will disappear until you click more articles.'
        if (!confirm(ask)) return
        await fetch('/api/news/profile', { method: 'DELETE' })
        softRefresh()
      }}
      type="button" className="db-textbtn"
    >
      {es ? 'reiniciar' : 'reset'}
    </button>
  )
}
