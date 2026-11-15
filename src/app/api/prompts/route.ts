import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

interface PrismaLike {
  promptTemplate: {
    findMany: (args: { orderBy: { createdAt: 'desc' } }) => Promise<unknown[]>
  }
  $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>
}

const db = prisma as unknown as PrismaLike

export async function GET() {
  try {
    // 优先尝试从数据库读取所有预设
    const prompts = await db.promptTemplate.findMany({
      orderBy: { createdAt: 'desc' }
    })
    return NextResponse.json(prompts)
  } catch (error) {
    console.error('[Prompts API] GET error:', error)
    return NextResponse.json([], { status: 200 }) // 失败时返回空数组而不是报错
  }
}

export async function POST(req: Request) {
  try {
    const data = await req.json()
    const { name, content, description, icon, isSystem } = data
    
    // 使用 Raw SQL 插入，避免 Prisma Client 未同步导致的问题
    await db.$executeRaw`
      INSERT INTO "PromptTemplate" (id, name, content, description, icon, isSystem, createdAt, updatedAt)
      VALUES (${Math.random().toString(36).substring(7)}, ${name}, ${content}, ${description || ""}, ${icon || "Sparkles"}, ${isSystem ? 1 : 0}, datetime('now'), datetime('now'))
    `
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Prompts API] POST error:', error)
    return NextResponse.json({ error: "Failed to create prompt" }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    
    console.log(`[Prompts API] Attempting to delete prompt with ID: ${id}`)
    
    if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 })
    
    // 删除预设
    const result = await db.$executeRaw`
      DELETE FROM "PromptTemplate" WHERE id = ${id}
    `
    
    console.log(`[Prompts API] Delete result for ${id}:`, result)
    
    return NextResponse.json({ success: true, count: result })
  } catch (error) {
    console.error('[Prompts API] DELETE error:', error)
    return NextResponse.json({ error: "Failed to delete prompt" }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const data = await req.json()
    const { id, name, content, description, icon } = data
    
    console.log(`[Prompts API] Updating prompt ${id}`)
    
    if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 })
    
    // 更新预设，保护系统预设不被修改内容
    const result = await db.$executeRaw`
      UPDATE "PromptTemplate" 
      SET name = ${name}, content = ${content}, description = ${description || ""}, icon = ${icon || "Sparkles"}, updatedAt = datetime('now')
      WHERE id = ${id} AND "isSystem" = 0
    `
    
    return NextResponse.json({ success: true, count: result })
  } catch (error) {
    console.error('[Prompts API] PUT error:', error)
    return NextResponse.json({ error: "Failed to update prompt" }, { status: 500 })
  }
}
