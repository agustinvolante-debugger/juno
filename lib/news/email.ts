// Thin email helper for the news module (suggestions + daily digest) and the pen briefing.
// Reuses the Resend SDK already in the project.
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export type SendResult = { ok: boolean; error?: string }

/**
 * Sends, and REPORTS WHY IT FAILED.
 *
 * The previous version returned a bare false, which made a real failure indistinguishable
 * from a config gap — the pen briefing was silently failing for every user except the Resend
 * account owner, and the UI could only guess at the reason. Resend's own message is specific
 * and actionable ("verify a domain…"), so it is passed through rather than swallowed.
 */
export async function sendEmailResult({
  to,
  subject,
  html,
  replyTo,
}: {
  to: string | string[]
  subject: string
  html: string
  replyTo?: string
}): Promise<SendResult> {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    return { ok: false, error: 'Email is not configured (RESEND_API_KEY / RESEND_FROM_EMAIL).' }
  }
  try {
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to,
      subject,
      html,
      ...(replyTo ? { replyTo } : {}),
    })
    if (error) return { ok: false, error: error.message || 'The mail provider rejected it.' }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message || 'The mail provider could not be reached.' }
  }
}

/** Boolean form, for the existing news callers that only branch on success. */
export async function sendEmail(args: {
  to: string | string[]
  subject: string
  html: string
}): Promise<boolean> {
  return (await sendEmailResult(args)).ok
}
