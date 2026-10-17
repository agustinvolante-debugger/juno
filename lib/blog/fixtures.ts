// Sample content, shown only when NOTION_BLOG_TOKEN / NOTION_BLOG_DATABASE_ID are not set
// (local previews before the integration exists). Every entry is marked `sample`, and the pages
// say so in a banner. The features described are real and shipped (Notes/juno-pen-overview-oct16.md);
// the people in the examples are the same invented ones the landing page and emails use.

import type { Block, PostWithBlocks, RichText } from './types'

let n = 0
const id = () => `sample-${++n}`

type Seg = string | { t: string; b?: boolean; i?: boolean; code?: boolean; href?: string }
const rt = (...segs: Seg[]): RichText[] =>
  segs.map((s) =>
    typeof s === 'string'
      ? { plain_text: s }
      : { plain_text: s.t, href: s.href ?? null, annotations: { bold: s.b, italic: s.i, code: s.code } },
  )

const p = (...s: Seg[]): Block => ({ id: id(), type: 'paragraph', data: { rich_text: rt(...s) } })
const h2 = (t: string): Block => ({ id: id(), type: 'heading_2', data: { rich_text: rt(t) } })
const h3 = (t: string): Block => ({ id: id(), type: 'heading_3', data: { rich_text: rt(t) } })
const li = (s: Seg | Seg[], kids?: Block[]): Block => ({
  id: id(), type: 'bulleted_list_item', data: { rich_text: rt(...(Array.isArray(s) ? s : [s])) }, children: kids,
})
const ol = (s: Seg | Seg[]): Block => ({ id: id(), type: 'numbered_list_item', data: { rich_text: rt(...(Array.isArray(s) ? s : [s])) } })
const quote = (...s: Seg[]): Block => ({ id: id(), type: 'quote', data: { rich_text: rt(...s) } })
const callout = (emoji: string, ...s: Seg[]): Block => ({ id: id(), type: 'callout', data: { rich_text: rt(...s), icon: { type: 'emoji', emoji } } })
const img = (url: string, caption: string): Block => ({ id: id(), type: 'image', data: { url, caption: rt(caption) } })
const toggle = (summary: string, kids: Block[]): Block => ({ id: id(), type: 'toggle', data: { rich_text: rt(summary) }, children: kids })
const code = (text: string, language = 'plain text'): Block => ({ id: id(), type: 'code', data: { rich_text: rt(text), language } })
const divider = (): Block => ({ id: id(), type: 'divider', data: {} })
const bookmark = (url: string, caption: string): Block => ({ id: id(), type: 'bookmark', data: { url, caption: rt(caption) } })

const base = { cover: null, seoTitle: null, seoDescription: null, sample: true as const }

export const FIXTURES: PostWithBlocks[] = [
  {
    ...base,
    id: 'sample-post-room',
    slug: 'the-assistant-that-was-in-the-room',
    title: 'The assistant that was in the room',
    type: 'post',
    date: '2026-10-14',
    lastEdited: '2026-10-14T16:00:00.000Z',
    summary: 'Most AI assistants know your inbox. Juno knows what was said across the table, and it asks before it does anything about it.',
    author: 'Agustin Volante',
    tags: ['Product'],
    blocks: [
      p('Every assistant on your phone has read your email. None of them heard the meeting. That gap is where most of the work actually gets promised: the second viewing on Saturday, the comps you said you would send, the name of the person who asked the hard question.'),
      p('Juno Pen starts from the conversation. You record it, with the pen, your phone or any recorder you already own, and Juno writes it up: a short summary, the decisions, the to-dos with who is waiting on each one, and the things that are easy to miss.'),
      h2('Notes are the start, not the product'),
      p('A good write-up is useful for a day. What changes your week is what happens next. So after every recording Juno looks for things it can do for you, and offers them one at a time:'),
      li(['A meeting someone proposed becomes ', { t: 'Add to calendar', b: true }, '.']),
      li('A promise with a date becomes a reminder, sent on WhatsApp at a sensible hour.'),
      li('A memo, a study plan or a prep sheet becomes a page in Notion or Google Docs.'),
      img('/email/calendar-en.png', 'Juno heard a time and offers to add it. One tap and it is on your calendar.'),
      h2('It asks first. Every time.'),
      p('Juno never acts on what it heard without asking. A plain ', { t: 'yes', i: true }, ' runs the waiting action. Anything that leaves your hands, like emailing someone or deleting a recording, gets its own question.'),
      quote('The bar we hold ourselves to: you should never be surprised by something Juno did.'),
      p('That is the whole idea. Not another inbox to check, but an assistant that was in the room with you, and that remembers what you said you would do.'),
    ],
  },
  {
    ...base,
    id: 'sample-post-showing',
    slug: 'a-showing-written-up-before-you-reach-the-car',
    title: 'A showing, written up before you reach the car',
    type: 'post',
    date: '2026-10-08',
    lastEdited: '2026-10-08T16:00:00.000Z',
    summary: 'How agents use Juno Pen on a busy Saturday: record the viewing, send the file on WhatsApp, and have the follow-ups ready before the next door.',
    author: 'Chris Dyas',
    tags: ['Real estate', 'How-to'],
    blocks: [
      p('Saturday is four viewings, two open houses and a lot of half-remembered details. Here is the routine we see working best with the agents trying Juno Pen.'),
      h2('Before you go in'),
      p('Clip the pen to your jacket and start recording. One recording per viewing keeps the notes clean, but a single long one works too: Juno splits it into conversations.'),
      callout('💡', 'Always tell people you are recording. In some states everyone in the conversation has to agree.'),
      h2('On the way to the car'),
      p('Plug the pen into your phone with the USB-C cable, or send the file to Juno on WhatsApp. Uploads run in the background, and Juno tells you when the notes are ready.'),
      img('/email/follow-up-en.gif', 'A viewing, from upload to calendar invite, inside WhatsApp.'),
      h2('What you get back'),
      ol([{ t: 'The short version.', b: true }, ' Who loved the kitchen, who balked at the price.']),
      ol([{ t: 'What you owe.', b: true }, ' Comps for the street by Friday, the HOA question on the carport.']),
      ol([{ t: 'What you might have missed.', b: true }, ' The offhand comment about schools that matters more than it sounded.']),
      ol([{ t: 'An offer.', b: true }, ' "Tom mentioned a second viewing Saturday at 11. Add it to your calendar?"']),
      h3('Ask it later'),
      p('A week on, text Juno ', { t: '"What do I still owe the Hendersons?"', i: true }, ' and it answers from every recording with them in it, not just the last one.'),
      toggle('What if two buyers talk over each other?', [
        p('Juno separates speakers and suggests who is who from the names it heard. You can correct a name once and it sticks for that recording.'),
      ]),
    ],
  },
  {
    ...base,
    id: 'sample-post-audio',
    slug: 'your-audio-90-days-and-the-button-that-keeps-it',
    title: 'Your audio, 90 days, and the button that keeps it',
    type: 'post',
    date: '2026-09-30',
    lastEdited: '2026-09-30T16:00:00.000Z',
    summary: 'We delete recordings 90 days after upload unless you ask us to keep them. Your notes and transcripts stay. Here is why, and what it means for you.',
    author: 'Agustin Volante',
    tags: ['Privacy'],
    blocks: [
      p('Audio is the most sensitive thing you give us. It holds voices, not just words, and most of its value is used up once the notes are written. So we decided not to keep it forever.'),
      h2('The rule'),
      li([{ t: 'Audio files are deleted 90 days after upload.', b: true }], [
        li('Transcripts, notes, to-dos and people stay in your account.'),
        li('In the last five days, the recording shows a Keep this audio button.'),
      ]),
      li('Audio you send on WhatsApp is never stored by us. Our transcription provider deletes it within about two days.'),
      li('You can delete any recording yourself, any time, from the website or by asking Juno on WhatsApp.'),
      h2('Why not keep everything?'),
      p('Because a copy we do not have is a copy nobody can lose. Keeping audio "just in case" is cheap for us and risky for you, and the trade only goes one way.'),
      divider(),
      p('The full details are in our ', { t: 'privacy policy', href: '/privacy' }, '. Questions go to ', { t: 'hello@tryjunoapp.com', href: 'mailto:hello@tryjunoapp.com' }, '.'),
    ],
  },
  {
    ...base,
    id: 'sample-post-texts',
    slug: 'five-things-to-text-juno-after-a-meeting',
    title: 'Five things to text Juno after a meeting',
    type: 'post',
    date: '2026-09-22',
    lastEdited: '2026-09-22T16:00:00.000Z',
    summary: 'Juno on WhatsApp can do everything the website does. These are the five messages people send most in their first week.',
    author: 'Chris Dyas',
    tags: ['How-to', 'WhatsApp'],
    blocks: [
      p('Once your number is connected, WhatsApp is the fastest way to use Juno. You do not need to learn commands. Write the way you would to a colleague who was there.'),
      ol([{ t: '"What did we decide?"', b: true }, ' A short answer from the last recording, with the decisions first.']),
      ol([{ t: '"Send me the briefing."', b: true }, ' The full write-up, by email, to you.']),
      ol([{ t: '"Remind me Friday to send the comps."', b: true }, ' Reminders work up to 30 days ahead and respect your quiet hours.']),
      ol([{ t: '"Put this in Notion."', b: true }, ' A page for the meeting in your own workspace.']),
      ol([{ t: '"Who was the woman from the bank?"', b: true }, ' Juno searches every recording, not just today’s.']),
      h2('A few things worth knowing'),
      li('Juno writes first only between 7:30 and 20:00 your time, and at most three times a day.'),
      li(['Reply ', { t: 'STOP', code: true }, ' to pause its messages, ', { t: 'START', code: true }, ' to turn them back on.']),
      li('Prefer iMessage? The same assistant works there too.'),
      bookmark('https://docs.tryjunoapp.com', 'The Juno Pen help center: every WhatsApp command, step by step.'),
    ],
  },
  {
    ...base,
    id: 'sample-update-texts-first',
    slug: 'juno-texts-first',
    title: 'Juno now texts first',
    type: 'update',
    date: '2026-10-16',
    lastEdited: '2026-10-16T16:00:00.000Z',
    summary: 'Offers right after an upload, a brief the evening before a meeting, and nudges on to-dos. Quiet hours and a daily limit are built in.',
    author: 'Agustin Volante',
    tags: ['WhatsApp'],
    blocks: [
      li('Offers right after each upload: add to calendar, remind me, create the page.'),
      li('A meeting brief the evening before, or the morning of, from your calendar.'),
      li('A morning brief, only on days that have meetings.'),
      li('Gentle nudges on to-dos you owe someone.'),
      p('Turn any of them off in ', { t: 'Settings → Messages from Juno', b: true }, '. Quiet hours are 7:30 to 20:00 local, and Juno sends at most three a day.'),
    ],
  },
  {
    ...base,
    id: 'sample-update-conference',
    slug: 'conference-mode',
    title: 'Conference mode: one day, one recording',
    type: 'update',
    date: '2026-10-14',
    lastEdited: '2026-10-14T16:00:00.000Z',
    summary: 'Recorded a whole event day in pieces? Combine it into one recording, split into conversations, and ask questions across all of it.',
    author: 'Chris Dyas',
    tags: ['Recordings'],
    blocks: [
      li([{ t: 'Combine this day', b: true }, ' joins every recording from one date into a single event, split by conversation.']),
      li([{ t: 'Who’s who', b: true }, ' suggests names for each speaker from the names Juno heard.']),
      li([{ t: 'Ask this meeting', b: true }, ' now answers across every part of the day.']),
    ],
  },
  {
    ...base,
    id: 'sample-update-given-pen',
    slug: 'given-pen-link',
    title: 'Were you handed a pen? There is a link for that',
    type: 'update',
    date: '2026-10-10',
    lastEdited: '2026-10-10T16:00:00.000Z',
    summary: 'If one of the founders gave you a Juno Pen, start with two months for $5, then $9.99 a month.',
    author: 'Agustin Volante',
    tags: ['Plans'],
    blocks: [
      p('Use this address to sign up. The offer is applied at checkout:'),
      code('https://www.tryjunoapp.com/pen/signup?offer=given-pen'),
    ],
  },
]
