// One number, written down, because it cost a day of Chris's recordings.
//
// The SDK refuses a NON-streaming request whose max_tokens implies a call that could exceed
// ten minutes. It computes that as (60min x max_tokens) / 128000, so the ceiling is:
//
//     max_tokens > 21333  ->  throws "Streaming is required for operations that may take
//                             longer than 10 minutes"
//
// It throws before the request is sent, so it fires on a two-minute recording as readily as a
// two-hour one — which is what made it look like a transcript-length problem when it was not.
//
// Raising a ceiling above this is fine; it just has to be streamed. messages.stream() +
// finalMessage() still returns a ParsedMessage, so structured output is preserved.
export const NONSTREAMING_MAX_TOKENS = 21333

/** True when a call with this ceiling must be streamed. */
export function mustStream(maxTokens: number): boolean {
  return maxTokens > NONSTREAMING_MAX_TOKENS
}
