// Markdown stripping for answers rendered as plain text.
//
// Both chat surfaces render the answer as text nodes, so `**bold**`, `# headings` and `- ` list
// markers appear literally on screen. Asking the model not to use them works most of the time,
// which is the problem: a formatting guarantee that holds "most of the time" produces a UI bug
// nobody can reproduce on demand. So the instruction stays, and this makes it true.
//
// Deliberately conservative — it removes the syntax and keeps the words, never the reverse.

export function stripMarkdown(input: string): string {
  return input
    // Headings: keep the text, drop the hashes.
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    // Bullets and numbered items become sentences on their own line.
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    .replace(/^\s{0,3}\d+[.)]\s+/gm, '')
    // Emphasis. Bold first, since ** would otherwise be eaten as two italics.
    .replace(/\*\*([\s\S]+?)\*\*/g, '$1')
    .replace(/__([\s\S]+?)__/g, '$1')
    .replace(/(^|[\s(])\*(?!\s)([^*\n]+?)\*(?=[\s).,;:!?]|$)/g, '$1$2')
    .replace(/(^|[\s(])_(?!\s)([^_\n]+?)_(?=[\s).,;:!?]|$)/g, '$1$2')
    // Inline code and fences — keep the contents, lose the backticks.
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/`([^`\n]+)`/g, '$1')
    // Blockquotes.
    .replace(/^\s{0,3}>\s?/gm, '')
    // Horizontal rules leave an empty line rather than a row of dashes.
    .replace(/^\s{0,3}([-*_])\s*(\1\s*){2,}$/gm, '')
    // Collapse the gaps stripping can leave, without joining separate paragraphs.
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
