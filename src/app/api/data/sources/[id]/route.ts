import { NextResponse } from 'next/server'
import { deleteDataSource } from '@/lib/data-sources'

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await deleteDataSource(id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Data source DELETE Error:', error)
    return NextResponse.json({ error: 'Failed to delete data source' }, { status: 500 })
  }
}
