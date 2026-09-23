// What to put in the file input's `accept`, which is not the innocuous attribute it looks like.
//
// On a laptop `accept` is a helpful filter: the picker greys out everything that isn't audio
// and you can't choose the wrong thing. On iOS it is the opposite. Safari hands `accept` to
// the Files provider, which matches on UTIs rather than on the extensions listed, and an
// external USB drive exposes the pen's files with whatever type the drive reports — often
// nothing at all. The result is a picker where the recordings are visible but greyed out, or
// a picker that opens and closes having selected nothing. Which is exactly the report we
// have: "selecting files from the pen and hitting open currently does nothing."
//
// The pen also writes uppercase .WAV, and extension matching is case-sensitive in some
// implementations, so every listed extension here is a second way to fail.
//
// So: filter where filtering helps and is safe, and get out of the way where it does not.
// A wrong file picked on a phone produces a clear error from prepareAudio. A right file that
// cannot be picked at all produces a user who thinks the product is broken.

/** The full list. Useful on a desktop picker, load-bearing nowhere. */
export const ACCEPT_DESKTOP = [
  'audio/*',
  'audio/wav', 'audio/wave', 'audio/x-wav', 'audio/x-pn-wav', 'audio/vnd.wave',
  'video/mp4', 'video/quicktime', 'video/x-m4v',
  '.wav', '.wave', '.mp3', '.m4a', '.aac', '.ogg', '.opus', '.webm', '.amr', '.3gp', '.wma',
  '.flac', '.aif', '.aiff', '.mp4', '.m4v', '.mov', '.qt',
].join(',')

/** iPadOS reports itself as a Mac, so touch points are the only reliable tell. */
export function isIOS(ua: string, maxTouchPoints = 0, platform = ''): boolean {
  if (/iPhone|iPad|iPod/i.test(ua)) return true
  return platform === 'MacIntel' && maxTouchPoints > 1
}

/**
 * `undefined` means the attribute is omitted entirely — every file selectable. That is the
 * intended answer on iOS, not a fallback.
 */
export function acceptFor(ua: string, maxTouchPoints = 0, platform = ''): string | undefined {
  return isIOS(ua, maxTouchPoints, platform) ? undefined : ACCEPT_DESKTOP
}
