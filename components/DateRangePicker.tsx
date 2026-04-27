'use client'

import { useState, useRef, useEffect } from 'react'
import { DayPicker, DateRange } from 'react-day-picker'
import { format, subDays, subMonths } from 'date-fns'
import 'react-day-picker/dist/style.css'

interface DateRangePickerProps {
  value: DateRange
  onChange: (range: DateRange) => void
}

const PRESETS = [
  { label: 'Last 30 days', range: () => ({ from: subDays(new Date(), 30), to: new Date() }) },
  { label: 'Last 90 days', range: () => ({ from: subDays(new Date(), 90), to: new Date() }) },
  { label: 'Last 6 months', range: () => ({ from: subMonths(new Date(), 6), to: new Date() }) },
]

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const label =
    value.from && value.to
      ? `${format(value.from, 'MMM d, yyyy')} → ${format(value.to, 'MMM d, yyyy')}`
      : 'Select date range'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 bg-[#141412] border border-[#2a2a28] hover:border-[#c8f04a] text-sm px-4 py-2.5 rounded-lg transition-colors text-[#f0ead2]"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#8a8678]">
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <span>{label}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#4a4840]">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-2 z-50 bg-[#141412] border border-[#2a2a28] rounded-xl shadow-2xl p-4 flex gap-4">
          {/* Presets */}
          <div className="flex flex-col gap-1 pr-4 border-r border-[#222220]">
            <div className="text-[#4a4840] text-xs font-mono uppercase tracking-widest mb-2">Quick select</div>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => { onChange(p.range()); setOpen(false) }}
                className="text-left text-sm text-[#8a8678] hover:text-[#c8f04a] px-3 py-1.5 rounded-lg hover:bg-[#c8f04a]/5 transition-colors whitespace-nowrap"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Calendar */}
          <div>
            <style>{`
              .rdp { --rdp-accent-color: #c8f04a; --rdp-background-color: #c8f04a18; margin: 0; }
              .rdp-day_selected, .rdp-day_range_start, .rdp-day_range_end { background: #c8f04a !important; color: #0c0c0b !important; font-weight: 600; }
              .rdp-day_range_middle { background: #c8f04a18 !important; color: #f0ead2 !important; }
              .rdp-day { color: #8a8678; }
              .rdp-day:hover:not([disabled]) { background: #c8f04a18; color: #f0ead2; }
              .rdp-caption_label { color: #f0ead2; font-size: 14px; }
              .rdp-nav_button { color: #8a8678; }
              .rdp-head_cell { color: #4a4840; font-size: 11px; }
            `}</style>
            <DayPicker
              mode="range"
              selected={value}
              onSelect={(range) => { if (range) onChange(range) }}
              numberOfMonths={2}
              disabled={{ after: new Date(), before: subMonths(new Date(), 6) }}
              defaultMonth={subMonths(new Date(), 1)}
            />
            <div className="flex justify-end mt-2">
              <button
                onClick={() => setOpen(false)}
                className="bg-[#c8f04a] text-[#0c0c0b] text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
