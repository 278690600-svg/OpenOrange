import { NextResponse } from 'next/server'
import { syncDataSource } from '@/lib/data-sources'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const metadata = await syncDataSource(id)
    return NextResponse.json({ success: true, metadata })
  } catch (error) {
    console.error('Data source sync Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync data source' },
      { status: 400 }
    )
  }
}
