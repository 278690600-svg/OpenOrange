import { NextRequest, NextResponse } from 'next/server'

type DBType = 'mysql' | 'postgresql' | 'sqlite'

interface DBConfig {
  type: DBType
  connectionString?: string
  host?: string
  port?: number
  user?: string
  password?: string
  database?: string
  // For sqlite
  filePath?: string
}

async function getConnection(config: DBConfig) {
  if (config.type === 'sqlite') {
    const Database = (await import('better-sqlite3')).default
    const db = new Database(config.filePath!)
    return { type: 'sqlite' as const, db }
  }

  if (config.type === 'mysql') {
    const mysql = await import('mysql2/promise')
    const conn = await mysql.createConnection((config.connectionString || {
      host: config.host || 'localhost',
      port: config.port || 3306,
      user: config.user,
      password: config.password,
      database: config.database,
    }) as any)
    return { type: 'mysql' as const, conn }
  }

  if (config.type === 'postgresql') {
    const { Client } = await import('pg')
    const client = new Client(config.connectionString || {
      host: config.host || 'localhost',
      port: config.port || 5432,
      user: config.user,
      password: config.password,
      database: config.database,
    })
    await client.connect()
    return { type: 'pg' as const, client }
  }

  throw new Error(`Unsupported database type: ${config.type}`)
}

// POST /api/kb/db-source/test — Test connection
export async function POST(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action') || 'test'
  const body = await req.json() as DBConfig

  if (action === 'test') {
    let conn: any = null
    try {
      conn = await getConnection(body)
      let version = ''
      if (conn.type === 'sqlite') {
        version = (conn.db.prepare('SELECT sqlite_version() as v').get() as any)?.v || 'unknown'
      } else if (conn.type === 'mysql') {
        const [rows] = await conn.conn.execute('SELECT VERSION() as v')
        version = (rows as any)[0]?.v || 'unknown'
      } else if (conn.type === 'pg') {
        const res = await conn.client.query('SELECT version() as v')
        version = res.rows[0]?.v?.split(' ').slice(0, 2).join(' ') || 'unknown'
      }
      return NextResponse.json({ ok: true, version })
    } catch (err: any) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 })
    } finally {
      if (conn) {
        if (conn.type === 'sqlite') conn.db.close()
        else if (conn.type === 'mysql') await conn.conn.end()
        else if (conn.type === 'pg') await conn.client.end()
      }
    }
  }

  if (action === 'tables') {
    let conn: any = null
    try {
      conn = await getConnection(body)
      let tables: Array<{ name: string; rowCount?: number; columns?: string[] }> = []

      if (conn.type === 'sqlite') {
        const rows = conn.db.prepare(`
          SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name
        `).all() as any[]
        tables = rows.map(r => {
          try {
            const count = (conn.db.prepare(`SELECT COUNT(*) as c FROM "${r.name}"`).get() as any)?.c || 0
            const cols = (conn.db.pragma(`table_info(${r.name})`) as any[]).map((c: any) => c.name)
            return { name: r.name, rowCount: count, columns: cols }
          } catch { return { name: r.name } }
        })
      } else if (conn.type === 'mysql') {
        const [rows] = await conn.conn.execute(
          'SELECT TABLE_NAME as name, TABLE_ROWS as rowCount FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME'
        )
        tables = (rows as any[]).map(r => ({ name: r.name, rowCount: r.rowCount }))
      } else if (conn.type === 'pg') {
        const res = await conn.client.query(`
          SELECT table_name as name FROM information_schema.tables 
          WHERE table_schema = 'public' ORDER BY table_name
        `)
        tables = res.rows.map((r: any) => ({ name: r.name }))
      }

      return NextResponse.json({ tables })
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 })
    } finally {
      if (conn) {
        if (conn.type === 'sqlite') conn.db.close()
        else if (conn.type === 'mysql') await conn.conn.end()
        else if (conn.type === 'pg') await conn.client.end()
      }
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
