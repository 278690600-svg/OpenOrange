import { NextResponse } from 'next/server'
import { createDataSource, listDataSources } from '@/lib/data-sources'

export async function GET() {
  try {
    const sources = await listDataSources()
    return NextResponse.json(sources)
  } catch (error) {
    console.error('Data sources GET Error:', error)
    return NextResponse.json({ error: 'Failed to fetch data sources' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const payload = await req.json()
    const source = await createDataSource(payload)
    return NextResponse.json(source)
  } catch (error) {
    console.error('Data source POST Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create data source' },
      { status: 400 }
    )
  }
}
