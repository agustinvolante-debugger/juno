// The blog's own shapes. Posts come from a Notion database (lib/blog/notion.ts) or, when the
// integration is not configured, from lib/blog/fixtures.ts. Everything downstream reads these
// types only, so the pages never know which source they were given.

export type RichText = {
  plain_text: string
  href?: string | null
  annotations?: {
    bold?: boolean
    italic?: boolean
    strikethrough?: boolean
    underline?: boolean
    code?: boolean
    color?: string
  }
}

/**
 * A Notion block, trimmed to what the renderer reads. `data` is the block's type-specific payload
 * (Notion's `block[block.type]`), and `children` is filled in for blocks that have them (nested
 * list items, toggles, callouts, quotes). Image and file URLs are already rewritten to our media
 * route, so a cached page never holds one of Notion's expiring links.
 */
export type Block = {
  id: string
  type: string
  data: {
    rich_text?: RichText[]
    caption?: RichText[]
    language?: string
    checked?: boolean
    url?: string
    icon?: { type: 'emoji'; emoji: string } | null
    color?: string
  }
  children?: Block[]
}

export type PostType = 'post' | 'update'

export type Post = {
  id: string
  slug: string
  title: string
  type: PostType
  /** ISO date (yyyy-mm-dd or full ISO). */
  date: string
  summary: string
  author: string
  tags: string[]
  /** Already a stable URL (our media route or an external link), never a signed Notion URL. */
  cover: string | null
  seoTitle: string | null
  seoDescription: string | null
  lastEdited: string
  /** True for the built-in samples shown when Notion is not configured. */
  sample?: boolean
}

export type PostWithBlocks = Post & { blocks: Block[] }
