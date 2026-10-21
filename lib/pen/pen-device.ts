// The Juno Pen as a USB drive (21 Oct): the shapes the browser and the /api/pen/pen-* routes
// share. Pure types and constants, no server imports, so app/pen/* can import it.
//
// The pen: FAT32 drive "JUNO", recordings in RECORD/ named R<YYYYMMDD>-<HHMMSS>.WAV = the START
// time on the pen's clock (the file's mtime is the start too, not the end). Settings live in
// MRECSET.TXT at the root, one "KEY:value<TAB>// comment" line each, CRLF, the file padded to 512
// bytes with \n; the pen reads it when it powers on (unplugged):
//   TIME:HH:MM YYYY/MM/DD   sets the clock (the maker's Windows tool writes only this line)
//   VOR:0..7                voice-activated recording: 0 off, 1-7 on (higher = more sensitive)
//   BIT:1..4                1 32k, 2 64k, 3 128k (32 kHz), 4 192k (48 kHz) IMA-ADPCM mono
//   GAIN:1..7               microphone sensitivity (higher = louder)
//   PART:10..240            minutes per file
// Only Chrome / Edge on a computer can write to the pen (showDirectoryPicker readwrite); Safari
// and phones upload by picking files and can't set the clock, change settings or delete.
//
// Routes:
//   GET  /api/pen/pen-settings                 → PenSettingsGet: { settings (EFFECTIVE: what to write
//                                                onto the pen now), saved?, savedAt, preset? }
//   PUT  /api/pen/pen-settings   PenSettings   → PenSettingsPut: { settings (SAVED), savedAt,
//                                                effective?, preset? }
//     While a conference on the user's calendar is coming (from 18:00 the day before) or on,
//     `preset` is set and the effective settings are the saved ones with the conference set-up
//     over them (lib/pen/event-prep.ts, behind PEN_EVENT_PREP=1). The saved ones never change:
//     after the event, effective = saved again. Settings forms edit `saved`, never `settings`.
//   POST /api/pen/pen-files      { files: PenFileInfo[] } → PenFilesState
//     Which of the pen's files Juno already has (skip them) and which are SAFE to delete from the
//     pen (the audio is stored in Juno with the same size, and not failed).

export type PenQuality = 'standard' | 'high'
export type PenSensitivity = 'soft' | 'normal' | 'loud'

export type PenSettings = {
  /** standard = BIT 3 (128 kbps), high = BIT 4 (192 kbps, default). */
  quality: PenQuality
  /** soft voices / far away = GAIN 7, normal = 5 (default), loud room = 3. */
  sensitivity: PenSensitivity
  /** Voice-activated recording (VOR): off (default) or on at `voiceLevel`. */
  voiceActivated: boolean
  /** 1..7, used when voiceActivated (default 4). */
  voiceLevel: number
  /** Minutes per file, 10..240 (default 60: keeps files under WhatsApp's 100 MB at High). */
  splitMin: number
  /** "Remove recordings from the pen after they're safely in Juno": null = not asked yet. */
  autoClear: boolean | null
}

export const PEN_DEFAULTS: PenSettings = { quality: 'high', sensitivity: 'normal', voiceActivated: false, voiceLevel: 4, splitMin: 60, autoClear: null }

export const BIT_OF: Record<PenQuality, number> = { standard: 3, high: 4 }
export const GAIN_OF: Record<PenSensitivity, number> = { soft: 7, normal: 5, loud: 3 }

/** A temporary set-up Juno puts on the pen for an event (the saved settings come back after `end`). */
export type PenPreset = { kind: 'conference'; event: string; start: string; end: string }

export type PenSettingsGet = {
  /** What to write onto the pen now (the saved settings, or the preset over them). */
  settings: PenSettings
  /** The user's own choices (what Settings → Your pen shows and edits). Absent on older servers: = settings. */
  saved?: PenSettings
  savedAt: string | null
  preset?: PenPreset | null
}

export type PenSettingsPut = { settings: PenSettings; savedAt: string; effective?: PenSettings; preset?: PenPreset | null }

/** One recording on the pen, as the browser sees it. */
export type PenFileInfo = { name: string; size: number; lastModified: number }

export type PenFilesState = {
  /** Names Juno already has for this user (don't upload again). */
  uploaded: string[]
  /** Names whose audio is safely stored in Juno (same size, not failed): OK to delete from the pen. */
  safe: string[]
}

/** R20261021-145802.WAV → its start on the pen's clock, read as the browser's local time. */
export const PEN_NAME_RE = /^R(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.(wav|mp3)$/i
