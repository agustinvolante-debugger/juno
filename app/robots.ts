import type { MetadataRoute } from 'next'

// Allow-all (the site had no robots.txt before, which crawlers read the same way), plus the
// sitemap's address so search engines find the blog posts.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: 'https://www.tryjunoapp.com/sitemap.xml',
  }
}
