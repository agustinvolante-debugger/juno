import { notFound } from 'next/navigation'
import { reports } from './reports'
import ReportClient from './ReportClient'

export async function generateStaticParams() {
  return Object.keys(reports).map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const report = reports[slug]
  if (!report) return { title: 'Report not found — Juno' }
  return {
    title: `${report.company} Keyword Intelligence Brief — Juno`,
    description: `Google Ads keyword analysis for ${report.company}. Industry benchmarks, competitor landscape, and efficiency insights.`,
  }
}

export default async function ReportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const report = reports[slug]
  if (!report) notFound()
  return <ReportClient report={report} />
}
