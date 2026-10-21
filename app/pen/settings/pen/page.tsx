import PenSettingsForm from './PenSettingsForm'

export const dynamic = 'force-dynamic'

// Settings → Pen (21 Oct): how the Juno Pen records (quality, microphone, voice-activated, split
// length) and whether recordings come off it once they're safely in Juno. Saved to the account
// (/api/pen/pen-settings); written onto the pen in Chrome / Edge when it's plugged in. The layout
// already sent anyone signed out back to /pen.
export default function PenSettingsPage() {
  return <PenSettingsForm />
}
