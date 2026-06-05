'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import type { Place } from '@/lib/news/places'
import { CATEGORIES, type CategoryKey } from '@/lib/news/geo'

// react-globe.gl touches `window` at import time → must never SSR.
const Globe = dynamic(() => import('react-globe.gl'), { ssr: false })

// ── Real-time day/night terminator ──────────────────────────────────────────
// Custom globe material that blends a blue-marble DAY texture with a city-lights NIGHT texture
// based on the sun's real position, so the lit hemisphere matches the actual time of day and
// advances as the day moves on. (Canonical react-globe.gl day-night-cycle shader.)
// earth-day.jpg is only 1600×800; earth-blue-marble.jpg on the same CDN is 4096×2048 (CORS-clean).
const DAY_TEX = 'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-blue-marble.jpg'
const NIGHT_TEX = 'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-night.jpg'

const VERT_SHADER = `
  varying vec3 vNormal;
  varying vec2 vUv;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const FRAG_SHADER = `
  #define PI 3.141592653589793
  uniform sampler2D dayTexture;
  uniform sampler2D nightTexture;
  uniform vec2 sunPosition;
  uniform vec2 globeRotation;
  varying vec3 vNormal;
  varying vec2 vUv;
  float toRad(in float a) { return a * PI / 180.0; }
  vec3 Polar2Cartesian(in vec2 c) { // [lng, lat]
    float theta = toRad(90.0 - c.x);
    float phi = toRad(90.0 - c.y);
    return vec3(sin(phi) * cos(theta), cos(phi), sin(phi) * sin(theta));
  }
  void main() {
    float invLon = toRad(globeRotation.x);
    float invLat = -toRad(globeRotation.y);
    mat3 rotX = mat3(1, 0, 0, 0, cos(invLat), -sin(invLat), 0, sin(invLat), cos(invLat));
    mat3 rotY = mat3(cos(invLon), 0, sin(invLon), 0, 1, 0, -sin(invLon), 0, cos(invLon));
    vec3 rotatedSunDirection = rotX * rotY * Polar2Cartesian(sunPosition);
    float intensity = dot(normalize(vNormal), normalize(rotatedSunDirection));
    vec4 dayColor = texture2D(dayTexture, vUv);
    vec4 nightColor = texture2D(nightTexture, vUv);
    float blendFactor = smoothstep(-0.1, 0.1, intensity);
    gl_FragColor = mix(nightColor, dayColor, blendFactor);
  }
`

// Subsolar point [lng, lat] at a given time — where the sun is directly overhead. Longitude from
// UTC time of day, latitude = solar declination (good visual approximation; ignores equation of time).
function sunPosAt(dt: number): [number, number] {
  const dayStart = new Date(dt).setUTCHours(0, 0, 0, 0)
  const lng = ((dayStart - dt) / 864e5) * 360 - 180
  const date = new Date(dt)
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 0)
  const dayOfYear = Math.floor((dt - yearStart) / 864e5)
  const decl = -23.44 * Math.cos((2 * Math.PI / 365) * (dayOfYear + 10))
  return [lng, decl]
}

type Item = { t: string; l: string; s: string; d: string | null }
type Buckets = Record<CategoryKey, Item[]>
const CAT_BY_KEY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]))

function rel(d: string | null): string {
  if (!d) return ''
  const t = Date.parse(d)
  if (isNaN(t)) return ''
  const s = Math.max(0, (Date.now() - t) / 1000)
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

export default function GlobeExplorer({ places }: { places: Place[] }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const globeRef = useRef<any>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [active, setActive] = useState<Place | null>(null)
  const [buckets, setBuckets] = useState<Buckets | null>(null)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'all' | CategoryKey>('all')
  const [globeMaterial, setGlobeMaterial] = useState<any>(null)
  const reqId = useRef(0)

  // Build the day/night shader material (async texture load). `three` is imported inside the effect
  // so it never runs during SSR.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const THREE = await import('three')
      const [day, night] = await Promise.all([
        new THREE.TextureLoader().loadAsync(DAY_TEX),
        new THREE.TextureLoader().loadAsync(NIGHT_TEX),
      ])
      if (cancelled) return
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          dayTexture: { value: day },
          nightTexture: { value: night },
          sunPosition: { value: new THREE.Vector2() },
          globeRotation: { value: new THREE.Vector2() },
        },
        vertexShader: VERT_SHADER,
        fragmentShader: FRAG_SHADER,
      })
      mat.uniforms.sunPosition.value.set(...sunPosAt(Date.now()))
      setGlobeMaterial(mat)
    })()
    return () => { cancelled = true }
  }, [])

  // Advance the sun in real time so the terminator tracks the actual day.
  useEffect(() => {
    if (!globeMaterial) return
    const id = setInterval(() => {
      globeMaterial.uniforms.sunPosition.value.set(...sunPosAt(Date.now()))
    }, 60_000)
    return () => clearInterval(id)
  }, [globeMaterial])

  // Size the globe canvas to its container (left ~62% of the viewport).
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  // Deep link: /news/globe?place=<id> auto-selects on load (shareable, region-routed-style URLs).
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('place')
    const p = id && places.find((x) => x.id === id)
    if (p) pick(p)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Gentle auto-rotate until the user picks a place.
  useEffect(() => {
    const g = globeRef.current
    if (!g) return
    const controls = g.controls?.()
    if (controls) { controls.autoRotate = !active; controls.autoRotateSpeed = 0.4 }
  }, [active, size])

  const points = useMemo(() => places.map((p) => ({ ...p })), [places])

  async function pick(p: Place) {
    setActive(p)
    setBuckets(null)
    setTab('all')
    setLoading(true)
    const id = ++reqId.current
    try { window.history.replaceState(null, '', `/news/globe?place=${p.id}`) } catch {}
    globeRef.current?.pointOfView?.({ lat: p.lat, lng: p.lng, altitude: 1.7 }, 800)
    try {
      const r = await fetch(`/api/news/place?id=${encodeURIComponent(p.id)}`)
      const j = await r.json()
      if (id !== reqId.current) return // a newer click superseded this one
      setBuckets(j.buckets || null)
    } catch {
      if (id === reqId.current) setBuckets(null)
    } finally {
      if (id === reqId.current) setLoading(false)
    }
  }

  // Flatten for the "All" tab, tagging each item with its category.
  const allTagged = useMemo(() => {
    if (!buckets) return [] as (Item & { cat: CategoryKey })[]
    const out: (Item & { cat: CategoryKey })[] = []
    for (const c of CATEGORIES) for (const it of buckets[c.key] || []) out.push({ ...it, cat: c.key })
    out.sort((a, b) => (Date.parse(b.d || '') || 0) - (Date.parse(a.d || '') || 0))
    return out
  }, [buckets])

  const total = allTagged.length

  return (
    <div className="flex h-[calc(100vh-57px)] w-full bg-[#05070d] text-neutral-100">
      {/* Globe */}
      <div ref={wrapRef} className="relative flex-1 overflow-hidden">
        {size.w > 0 && (
          <Globe
            ref={globeRef}
            width={size.w}
            height={size.h}
            globeImageUrl={NIGHT_TEX}
            {...(globeMaterial ? { globeMaterial } : {})}
            onZoom={(pov: any) => globeMaterial?.uniforms.globeRotation.value.set(pov.lng, pov.lat)}
            backgroundColor="#05070d"
            atmosphereColor="#3a6ea5"
            atmosphereAltitude={0.18}
            pointsData={points}
            pointLat="lat"
            pointLng="lng"
            pointAltitude={(d: any) => (active?.id === d.id ? 0.12 : 0.04)}
            pointRadius={(d: any) => (active?.id === d.id ? 0.5 : d.kind === 'city' ? 0.28 : 0.34)}
            pointColor={(d: any) => (active?.id === d.id ? '#f59e0b' : d.kind === 'city' ? '#38bdf8' : '#22d3ee')}
            pointLabel={(d: any) => `${d.flag} ${d.name}`}
            onPointClick={(d: any) => pick(d)}
          />
        )}
        <div className="pointer-events-none absolute left-5 top-4 select-none">
          <div className="text-[13px] font-bold tracking-wide text-cyan-300/90">🌍 WORLD EXPLORER</div>
          <div className="mt-0.5 text-[11px] text-neutral-400">Click a place — sports to funding</div>
        </div>
      </div>

      {/* Sidebar feed */}
      <aside className="flex w-[clamp(340px,38%,520px)] flex-col border-l border-neutral-800 bg-[#0a0d16]">
        {!active ? (
          <div className="flex flex-1 flex-col items-center justify-center px-8 text-center text-neutral-500">
            <div className="text-4xl">🛰️</div>
            <p className="mt-3 text-sm">Spin the globe and click a country or city to pull its latest news, by category.</p>
          </div>
        ) : (
          <>
            <div className="border-b border-neutral-800 px-5 py-4">
              <div className="flex items-center gap-2 text-lg font-bold">
                <span>{active.flag}</span>
                <span>{active.name}</span>
                {loading && <span className="ml-1 text-[11px] font-normal text-cyan-400">loading…</span>}
              </div>
              {/* Tabs */}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(['all', ...CATEGORIES.map((c) => c.key)] as const).map((k) => {
                  const c = k === 'all' ? null : CAT_BY_KEY[k]
                  const count = k === 'all' ? total : (buckets?.[k]?.length || 0)
                  const on = tab === k
                  return (
                    <button
                      key={k}
                      onClick={() => setTab(k)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${on ? 'bg-neutral-100 text-neutral-900' : 'bg-neutral-800/70 text-neutral-300 hover:bg-neutral-700'}`}
                    >
                      {c && <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: c.color }} />}
                      {k === 'all' ? 'All' : c!.label}
                      {!loading && <span className="ml-1 opacity-60">{count}</span>}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="px-5 py-10 text-center text-sm text-neutral-500">Pulling the latest from {active.name}…</div>
              ) : tab === 'all' ? (
                allTagged.length ? (
                  <Feed items={allTagged} />
                ) : (
                  <Empty name={active.name} />
                )
              ) : (buckets?.[tab]?.length ? (
                <Feed items={(buckets[tab] || []).map((it) => ({ ...it, cat: tab }))} />
              ) : (
                <Empty name={active.name} />
              ))}
            </div>
          </>
        )}
      </aside>
    </div>
  )
}

function Feed({ items }: { items: (Item & { cat: CategoryKey })[] }) {
  return (
    <ul>
      {items.map((it, i) => {
        const c = CAT_BY_KEY[it.cat]
        return (
          <li key={i} className="border-b border-neutral-800/70 px-5 py-3 hover:bg-neutral-800/30">
            <div className="flex items-start gap-2">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: c.color }} title={c.label} />
              <div className="min-w-0">
                <a href={it.l} target="_blank" rel="noopener noreferrer" className="text-[14px] font-semibold leading-snug text-neutral-100 hover:underline">{it.t}</a>
                <div className="mt-0.5 text-[11px] text-neutral-500">
                  <span className="font-bold text-neutral-400">{it.s}</span>{rel(it.d) ? ` · ${rel(it.d)}` : ''}
                  <span className="ml-1.5" style={{ color: c.color }}>· {c.label}</span>
                </div>
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function Empty({ name }: { name: string }) {
  return <div className="px-5 py-10 text-center text-sm text-neutral-500">No recent news found for {name} in this category.</div>
}
