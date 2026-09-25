// Which language a chat answer is written in.
//
// People switch languages between questions (English, then Spanish, then Portuguese) and
// their recordings are in yet others. The answer follows the question just asked, never the
// recordings or the earlier turns. Placed last in the system prompt so it wins over anything
// earlier that might pull toward the recordings' language.
export const REPLY_LANGUAGE =
  '\n\nLANGUAGE: Write your answer in the language of the user\'s LATEST question. English ' +
  'question, English answer; Spanish question, Spanish answer; Portuguese question, Portuguese ' +
  'answer. This holds even when the recordings, the notes or your previous answers are in a ' +
  'different language. Quotes from a recording stay word for word in the language they were ' +
  'spoken; you may add a short translation after one if it helps.'

/**
 * The same rule attached to the question itself. The system prompt alone lost to history: a
 * Portuguese question after a Spanish exchange was answered in Spanish. Right beside the
 * question it holds.
 */
export function inQuestionLanguage(question: string): string {
  return `${question}\n\n(Answer in the language this question is written in, even if the previous turns were in another language.)`
}
