import { NextRequest, NextResponse } from 'next/server'

type DBType = 'mysql' | 'postgresql' | 'sqlite' | 'sqlserver'

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
    }) as Record<string, unknown>)
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

  if (config.type === 'sqlserver') {
    const mssql = await import('mssql')
    const pool = await mssql.connect(config.connectionString || {
      user: config.user,
      password: config.password,
      server: config.host || 'localhost',
      port: config.port || 1433,
      database: config.database,
      options: {
        encrypt: true,
        trustServerCertificate: true // trust self-signed certs for local dev
      }
    })
    return { type: 'sqlserver' as const, pool }
  }

  if (config.type === 'mongodb') {
    const { MongoClient } = await import('mongodb')
    const uri = config.connectionString || `mongodb://${config.user ? `${config.user}:${config.password}@` : ''}${config.host || 'localhost'}:${config.port || 27017}/${config.database || ''}`
    const client = new MongoClient(uri)
    await client.connect()
    return { type: 'mongodb' as const, client, dbName: config.database }
  }

  if (config.type === 'redis') {
    const Redis = (await import('ioredis')).default
    const client = config.connectionString ? new Redis(config.connectionString) : new Redis({
      host: config.host || 'localhost',
      port: config.port || 6379,
      password: config.password,
      db: config.database ? parseInt(config.database, 10) : 0
    })
    return { type: 'redis' as const, client }
  }

  throw new Error(`Unsupported database type: ${config.type}`)
}

// POST /api/kb/db-source/test — Test connection
export async function POST(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action') || 'test'
  const body = await req.json() as DBConfig

  if (action === 'test') {
    let conn: Awaited<ReturnType<typeof getConnection>> | null = null
    try {
      conn = await getConnection(body)
      let version = ''
      if (conn.type === 'sqlite') {
        version = ((conn.db.prepare('SELECT sqlite_version() as v').get() as Record<string, unknown>)?.v as string) || 'unknown'
      } else if (conn.type === 'mysql') {
        const [rows] = await conn.conn.execute('SELECT VERSION() as v')
        version = (rows as Array<{ v?: string }>)[0]?.v || 'unknown'
      } else if (conn.type === 'pg') {
        const res = await conn.client.query('SELECT version() as v')
        version = res.rows[0]?.v?.split(' ').slice(0, 2).join(' ') || 'unknown'
      } else if (conn.type === 'sqlserver') {
        const res = await conn.pool.request().query('SELECT @@VERSION as v')
        version = res.recordset[0]?.v?.split('\n')[0] || 'unknown'
      } else if (conn.type === 'mongodb') {
        const adminDb = conn.client.db().admin()
        const info = await adminDb.serverInfo()
        version = info.version || 'unknown'
      } else if (conn.type === 'redis') {
        const info = await conn.client.info('server')
        const match = info.match(/redis_version:(.*)/)
        version = match ? match[1].trim() : 'unknown'
      }
      return NextResponse.json({ ok: true, version })
    } catch (err: unknown) {
      return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 400 })
    } finally {
      if (conn) {
        if (conn.type === 'sqlite') conn.db.close()
        else if (conn.type === 'mysql') await conn.conn.end()
        else if (conn.type === 'pg') await conn.client.end()
        else if (conn.type === 'sqlserver') await conn.pool.close()
        else if (conn.type === 'mongodb') await conn.client.close()
        else if (conn.type === 'redis') conn.client.disconnect()
      }
    }
  }

  if (action === 'tables') {
    let conn: Awaited<ReturnType<typeof getConnection>> | null = null
    try {
      conn = await getConnection(body)
      let tables: Array<{ name: string; rowCount?: number; columns?: string[] }> = []

      if (conn.type === 'sqlite') {
        const db = conn.db
        const rows = db.prepare(`
          SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name
        `).all() as Array<Record<string, unknown>>
        tables = rows.map(r => {
          try {
            const name = r.name as string
            const count = (db.prepare(`SELECT COUNT(*) as c FROM "${name}"`).get() as Record<string, unknown>)?.c as number || 0
            const cols = (db.pragma(`table_info(${name})`) as Array<Record<string, unknown>>).map((c) => c.name as string)
            return { name, rowCount: count, columns: cols }
          } catch { return { name: r.name as string } }
        })
      } else if (conn.type === 'mysql') {
        const [rows] = await conn.conn.execute(
          'SELECT TABLE_NAME as name, TABLE_ROWS as rowCount FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME'
        )
        tables = (rows as Array<{ name: string; rowCount: number }>).map(r => ({ name: r.name, rowCount: r.rowCount }))
      } else if (conn.type === 'pg') {
        const res = await conn.client.query(`
          SELECT table_name as name FROM information_schema.tables 
          WHERE table_schema = 'public' ORDER BY table_name
        `)
        tables = res.rows.map((r: { name: string }) => ({ name: r.name }))
      } else if (conn.type === 'sqlserver') {
        const db = conn.pool
        const res = await db.request().query(`
          SELECT TABLE_NAME as name FROM INFORMATION_SCHEMA.TABLES 
          WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME
        `)
        tables = await Promise.all(res.recordset.map(async (r: { name: string }) => {
          try {
            const countRes = await db.request().query(`SELECT COUNT(*) as c FROM [${r.name}]`)
            const count = countRes.recordset[0]?.c || 0
            const colRes = await db.request().query(`
              SELECT COLUMN_NAME as col FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${r.name}'
            `)
            const cols = colRes.recordset.map((c: { col: string }) => c.col)
            return { name: r.name, rowCount: count, columns: cols }
          } catch {
            return { name: r.name }
          }
        }))
      } else if (conn.type === 'mongodb') {
        const db = conn.client.db(conn.dbName)
        const collections = await db.listCollections().toArray()
        tables = await Promise.all(collections.map(async (c) => {
          try {
            const count = await db.collection(c.name).estimatedDocumentCount()
            return { name: c.name, rowCount: count }
          } catch {
            return { name: c.name }
          }
        }))
      } else if (conn.type === 'redis') {
        const keys = await conn.client.keys('*')
        // In Redis, we consider keys as "tables" or just list keys
        // If there are too many keys, we might want to just return a summary
        if (keys.length > 100) {
          tables = [{ name: 'All Keys (Too many to list individually)', rowCount: keys.length }]
        } else {
          tables = keys.map(k => ({ name: k, rowCount: 1 }))
        }
      }

      return NextResponse.json({ tables })
    } catch (err: unknown) {
      return NextResponse.json({ error: (err as Error).message }, { status: 500 })
    } finally {
      if (conn) {
        if (conn.type === 'sqlite') conn.db.close()
        else if (conn.type === 'mysql') await conn.conn.end()
        else if (conn.type === 'pg') await conn.client.end()
        else if (conn.type === 'sqlserver') await conn.pool.close()
        else if (conn.type === 'mongodb') await conn.client.close()
        else if (conn.type === 'redis') conn.client.disconnect()
      }
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
