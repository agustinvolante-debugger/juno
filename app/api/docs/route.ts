import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { readFileSync } from 'fs'
import { join } from 'path'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const file = req.nextUrl.searchParams.get('file')
  if (!file) {
    return NextResponse.json({ error: 'Missing file parameter' }, { status: 400 })
  }

  const safePath = file.replace(/\.\./g, '')
  const fullPath = join(process.cwd(), 'docs', safePath)

  try {
    const content = readFileSync(fullPath, 'utf-8')
    return NextResponse.json({ content })
  } catch {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }
}
