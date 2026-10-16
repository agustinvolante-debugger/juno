// Client-safe (no Supabase import): does this recording have audio in our bucket that the
// 90-day rule applies to? Mirrors audioPaths in lib/pen/audio-retention.ts.
//   plain path or parts:  yes      aai: / text: / sample:  no (AssemblyAI storage, imports, the sample)
export const storedAudio = (storagePath: string | null | undefined): boolean =>
  !!storagePath && !/^(aai|text|sample)/.test(storagePath)

/** Audio is deleted this many days after upload (lib/pen/audio-retention.ts imports it). */
export const AUDIO_DAYS = 90
/** The recording page says nothing about it until this many days are left. */
export const AUDIO_WARN_DAYS = 5
