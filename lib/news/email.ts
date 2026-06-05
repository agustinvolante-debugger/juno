// Thin email helper for the news module (suggestions + daily digest). Reuses the Resend SDK
// already in the project. Returns false (never throws) if Resend isn't configured.
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendEmail({ to, subject, html }: { to: string | string[]; subject: string; html: string }): Promise<boolean> {
  try {
    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return false
    const { error } = await resend.emails.send({ from: process.env.RESEND_FROM_EMAIL!, to, subject, html })
    return !error
  } catch {
    return false
  }
}
