'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { docsManifest, DocCategory, DocItem } from '@/docs/manifest'

export default function DocsPage() {
  const { status } = useSession()
  const router = useRouter()
  const [selectedDoc, setSelectedDoc] = useState<DocItem | null>(null)
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => {
    const slugs: string[] = []
    function collect(cats: DocCategory[]) {
      for (const c of cats) {
        slugs.push(c.slug)
        if (c.subcategories) collect(c.subcategories)
      }
    }
    collect(docsManifest)
    return new Set(slugs)
  })

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/signin')
  }, [status, router])

  const loadDoc = async (doc: DocItem) => {
    setSelectedDoc(doc)
    setLoading(true)
    try {
      const res = await fetch(`/api/docs?file=${encodeURIComponent(doc.file)}`)
      const data = await res.json()
      setContent(data.content || 'Failed to load document.')
    } catch {
      setContent('Failed to load document.')
    }
    setLoading(false)
  }

  const toggleSection = (slug: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }

  if (status === 'loading' || status === 'unauthenticated') {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.loadingText}>Loading...</div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      {/* Sidebar */}
      <aside style={styles.sidebar}>
        <a href="/dashboard" style={styles.logo}>juno<span style={{ color: '#c8f04a' }}>.</span></a>
        <div style={styles.sidebarLabel}>Documentation</div>
        <nav style={styles.nav}>
          {docsManifest.map(category => (
            <SidebarCategory
              key={category.slug}
              category={category}
              selectedDoc={selectedDoc}
              expandedSections={expandedSections}
              onToggle={toggleSection}
              onSelect={loadDoc}
              depth={0}
            />
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main style={styles.main}>
        {!selectedDoc ? (
          <div style={styles.emptyState}>
            <h1 style={styles.emptyTitle}>Juno Docs</h1>
            <p style={styles.emptyText}>
              Internal documentation for product, engineering, sales, and session logs.
              Select a document from the sidebar to get started.
            </p>
            <div style={styles.statsGrid}>
              {docsManifest.map(cat => (
                <div key={cat.slug} style={styles.statCard}>
                  <div style={styles.statName}>{cat.name}</div>
                  <div style={styles.statCount}>
                    {countDocs(cat)} docs
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : loading ? (
          <div style={styles.loadingContainer}>
            <div style={styles.loadingText}>Loading...</div>
          </div>
        ) : (
          <article style={styles.article}>
            <div style={styles.breadcrumb}>
              {getBreadcrumb(selectedDoc, docsManifest).join(' / ')}
            </div>
            <div className="docs-markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </div>
          </article>
        )}
      </main>

      <style>{markdownStyles}</style>
    </div>
  )
}

function SidebarCategory({
  category,
  selectedDoc,
  expandedSections,
  onToggle,
  onSelect,
  depth,
}: {
  category: DocCategory
  selectedDoc: DocItem | null
  expandedSections: Set<string>
  onToggle: (slug: string) => void
  onSelect: (doc: DocItem) => void
  depth: number
}) {
  const isExpanded = expandedSections.has(category.slug)

  return (
    <div style={{ marginBottom: depth === 0 ? '4px' : '0' }}>
      <button
        onClick={() => onToggle(category.slug)}
        style={{
          ...styles.categoryButton,
          paddingLeft: `${16 + depth * 12}px`,
          fontSize: depth === 0 ? '12px' : '11px',
          color: depth === 0 ? '#f0ead2' : '#8a8678',
        }}
      >
        <span style={{
          ...styles.chevron,
          transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
        }}>
          &#9656;
        </span>
        {category.name}
      </button>

      {isExpanded && (
        <div>
          {category.items?.map(doc => (
            <button
              key={doc.slug}
              onClick={() => onSelect(doc)}
              style={{
                ...styles.docButton,
                paddingLeft: `${28 + depth * 12}px`,
                background: selectedDoc?.slug === doc.slug ? '#1a1a18' : 'transparent',
                color: selectedDoc?.slug === doc.slug ? '#c8f04a' : '#8a8678',
              }}
            >
              {doc.title}
            </button>
          ))}
          {category.subcategories?.map(sub => (
            <SidebarCategory
              key={sub.slug}
              category={sub}
              selectedDoc={selectedDoc}
              expandedSections={expandedSections}
              onToggle={onToggle}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function countDocs(cat: DocCategory): number {
  let count = cat.items?.length || 0
  cat.subcategories?.forEach(sub => { count += countDocs(sub) })
  return count
}

function getBreadcrumb(doc: DocItem, categories: DocCategory[]): string[] {
  for (const cat of categories) {
    if (cat.items?.some(d => d.slug === doc.slug)) {
      return [cat.name, doc.title]
    }
    if (cat.subcategories) {
      for (const sub of cat.subcategories) {
        if (sub.items?.some(d => d.slug === doc.slug)) {
          return [cat.name, sub.name, doc.title]
        }
      }
    }
  }
  return [doc.title]
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    minHeight: '100vh',
    background: '#0c0c0b',
    color: '#f0ead2',
    fontFamily: "'DM Sans', sans-serif",
  },
  sidebar: {
    width: '320px',
    minWidth: '320px',
    borderRight: '1px solid #222220',
    padding: '20px 0',
    overflowY: 'auto',
    height: '100vh',
    position: 'sticky',
    top: 0,
  },
  logo: {
    fontFamily: "'Instrument Serif', serif",
    fontSize: '22px',
    color: '#f0ead2',
    textDecoration: 'none',
    letterSpacing: '-0.02em',
    padding: '0 20px',
    display: 'block',
    marginBottom: '4px',
  },
  sidebarLabel: {
    fontSize: '11px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    color: '#4a4840',
    padding: '8px 20px 16px',
    borderBottom: '1px solid #1a1a18',
    marginBottom: '8px',
  },
  nav: {
    padding: '8px 0',
  },
  categoryButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    width: '100%',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    fontWeight: 600,
    padding: '8px 16px',
    textAlign: 'left' as const,
    fontFamily: "'DM Sans', sans-serif",
  },
  chevron: {
    display: 'inline-block',
    fontSize: '10px',
    transition: 'transform 0.15s ease',
  },
  docButton: {
    display: 'block',
    width: '100%',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    fontSize: '13px',
    lineHeight: '1.4',
    padding: '6px 28px',
    textAlign: 'left' as const,
    fontFamily: "'DM Sans', sans-serif",
    transition: 'background 0.1s, color 0.1s',
    borderRadius: '0',
  },
  main: {
    flex: 1,
    padding: '40px 60px',
    maxWidth: '900px',
    overflowY: 'auto',
  },
  emptyState: {
    paddingTop: '80px',
  },
  emptyTitle: {
    fontFamily: "'Instrument Serif', serif",
    fontSize: '48px',
    fontWeight: 400,
    letterSpacing: '-0.02em',
    marginBottom: '12px',
  },
  emptyText: {
    color: '#8a8678',
    fontSize: '16px',
    maxWidth: '500px',
    marginBottom: '48px',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '12px',
    maxWidth: '400px',
  },
  statCard: {
    background: '#141412',
    border: '1px solid #222220',
    borderRadius: '8px',
    padding: '16px',
  },
  statName: {
    fontSize: '13px',
    color: '#8a8678',
    marginBottom: '4px',
  },
  statCount: {
    fontSize: '24px',
    fontWeight: 600,
    color: '#c8f04a',
  },
  breadcrumb: {
    fontSize: '12px',
    color: '#4a4840',
    marginBottom: '24px',
    letterSpacing: '0.02em',
  },
  article: {
    lineHeight: 1.7,
  },
  loadingContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: '#0c0c0b',
  },
  loadingText: {
    color: '#4a4840',
    fontSize: '14px',
  },
}

const markdownStyles = `
  .docs-markdown {
    color: #c4bfa8;
    font-size: 15px;
    line-height: 1.75;
  }
  .docs-markdown h1 {
    font-family: 'Instrument Serif', serif;
    font-size: 36px;
    font-weight: 400;
    color: #f0ead2;
    margin: 0 0 16px;
    letter-spacing: -0.02em;
  }
  .docs-markdown h2 {
    font-size: 22px;
    font-weight: 600;
    color: #f0ead2;
    margin: 36px 0 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid #1a1a18;
  }
  .docs-markdown h3 {
    font-size: 17px;
    font-weight: 600;
    color: #f0ead2;
    margin: 28px 0 8px;
  }
  .docs-markdown h4 {
    font-size: 15px;
    font-weight: 600;
    color: #c8f04a;
    margin: 20px 0 8px;
  }
  .docs-markdown p {
    margin: 0 0 12px;
  }
  .docs-markdown ul, .docs-markdown ol {
    margin: 0 0 16px;
    padding-left: 24px;
  }
  .docs-markdown li {
    margin-bottom: 6px;
  }
  .docs-markdown code {
    background: #1a1a18;
    color: #c8f04a;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'DM Mono', monospace;
    font-size: 13px;
  }
  .docs-markdown pre {
    background: #141412;
    border: 1px solid #222220;
    border-radius: 8px;
    padding: 16px;
    overflow-x: auto;
    margin: 0 0 16px;
  }
  .docs-markdown pre code {
    background: none;
    padding: 0;
    font-size: 13px;
    color: #c4bfa8;
  }
  .docs-markdown strong {
    color: #f0ead2;
    font-weight: 600;
  }
  .docs-markdown a {
    color: #c8f04a;
    text-decoration: none;
  }
  .docs-markdown a:hover {
    text-decoration: underline;
  }
  .docs-markdown blockquote {
    border-left: 3px solid #c8f04a;
    margin: 0 0 16px;
    padding: 8px 16px;
    color: #8a8678;
    background: #141412;
    border-radius: 0 6px 6px 0;
  }
  .docs-markdown table {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 16px;
    font-size: 13px;
  }
  .docs-markdown th {
    background: #141412;
    color: #f0ead2;
    font-weight: 600;
    text-align: left;
    padding: 10px 12px;
    border: 1px solid #222220;
  }
  .docs-markdown td {
    padding: 8px 12px;
    border: 1px solid #1a1a18;
  }
  .docs-markdown hr {
    border: none;
    border-top: 1px solid #222220;
    margin: 32px 0;
  }
  .docs-markdown img {
    max-width: 100%;
    border-radius: 8px;
  }
`
