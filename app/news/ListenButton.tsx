'use client'
import { useEffect, useRef, useState } from 'react'

// "▶ Listen" — reads a brief aloud with the browser's speechSynthesis (free, works
// offline on iOS; no server or AI cost). Long text is chunked by sentence because
// iOS silently drops utterances past ~4k chars.
function chunk(text: string, max = 240): string[] {
  const sentences = text.replace(/\s+/g, ' ').split(/(?<=[.!?…])\s+/)
  const out: string[] = []
  let cur = ''
  for (const s of sentences) {
    if ((cur + ' ' + s).trim().length > max && cur) { out.push(cur.trim()); cur = s }
    else cur = (cur + ' ' + s).trim()
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

export default function ListenButton({ text, lang = 'en', small }: { text: string; lang?: string; small?: boolean }) {
  const [playing, setPlaying] = useState(false)
  const [supported, setSupported] = useState(false)
  const startedRef = useRef(false)
  const es = lang === 'es'

  useEffect(() => { setSupported('speechSynthesis' in window) }, [])
  // stop speaking if the component unmounts mid-read (navigation, soft refresh)
  useEffect(() => () => { if (startedRef.current) window.speechSynthesis?.cancel() }, [])

  function stop() {
    window.speechSynthesis.cancel()
    startedRef.current = false
    setPlaying(false)
  }

  function play() {
    const synth = window.speechSynthesis
    synth.cancel() // don't stack on top of another read
    const wanted = es ? 'es' : 'en'
    const voice = synth.getVoices().find((v) => v.lang?.toLowerCase().startsWith(wanted) && /premium|enhanced|natural/i.test(v.name))
      || synth.getVoices().find((v) => v.lang?.toLowerCase().startsWith(wanted))
    const parts = chunk(text)
    parts.forEach((p, i) => {
      const u = new SpeechSynthesisUtterance(p)
      u.lang = es ? 'es-ES' : 'en-US'
      if (voice) u.voice = voice
      u.rate = 1.02
      if (i === parts.length - 1) { u.onend = stop; u.onerror = stop }
      synth.speak(u)
    })
    startedRef.current = true
    setPlaying(true)
  }

  if (!supported || !text.trim()) return null
  return (
    <button
      onClick={() => (playing ? stop() : play())}
      title={playing ? (es ? 'Detener' : 'Stop') : (es ? 'Escuchar el resumen' : 'Listen to the brief')}
      className={small
        ? 'font-normal normal-case text-[11px] text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
        : 'rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-bold transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800'}
    >{playing ? '■ ' + (es ? 'Detener' : 'Stop') : '▶ ' + (es ? 'Escuchar' : 'Listen')}</button>
  )
}
