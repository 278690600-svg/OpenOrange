import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

type DBType = 'mysql' | 'postgresql' | 'sqlite' | 'sqlserver'

interface DBConfig {
  type: DBType
  connectionString?: string
  host?: string
  port?: number
  user?: string
  password?: string
  database?: string
  filePath?: string
  tables?: string[]
}

interface QueryRequest {
  config: DBConfig
  naturalLanguage: string
  schema?: Record<string, unknown>
}

interface ExecuteRequest {
  config: DBConfig
  sql: string
  params?: unknown[]
}

interface AnalyzeRequest {
  config: DBConfig
  sql: string
  analysisType: 'trend' | 'anomaly' | 'correlation' | 'distribution' | 'summary'
}

const SENSITIVE_PATTERNS = [
  /password/i, /passwd/i, /secret/i, /token/i, /api_key/i, /apikey/i,
  /credit_card/i, /ssn/i, /social_security/i, /id_card/i,
  /phone_number/i, /email/i, /address/i, /birth_date/i
]

const DANGEROUS_KEYWORDS = [
  'DROP ', 'DELETE ', 'UPDATE ', 'INSERT ', 'ALTER ', 'CREATE ',
  'TRUNCATE ', 'GRANT ', 'REVOKE ', 'EXEC ', 'EXECUTE ',
  'xp_', 'sp_', '0x', '/*', '*/', '--', ';--', 'UNION SELECT',
  'INTO OUTFILE', 'INTO DUMPFILE', 'LOAD_FILE', 'BENCHMARK(',
  'SLEEP(', 'WAITFOR DELAY', 'DBMS_PIPE'
]

function sanitizeSensitiveData(rows: Record<string, unknown>[], columns?: string[]): Record<string, unknown>[] {
  if (!rows.length) return rows
  
  const sensitiveCols = new Set<string>()
  const colsToCheck = columns || Object.keys(rows[0] || {})
  
  for (const col of colsToCheck) {
    if (SENSITIVE_PATTERNS.some(p => p.test(col))) {
      sensitiveCols.add(col)
    }
  }
  
  if (sensitiveCols.size === 0) return rows
  
  return rows.map(row => {
    const sanitized = { ...row }
    for (const col of sensitiveCols) {
      if (col in sanitized) {
        const val = sanitized[col]
        if (typeof val === 'string' && val.length > 4) {
          sanitized[col] = val.slice(0, 2) + '***' + val.slice(-2)
        } else {
          sanitized[col] = '***'
        }
      }
    }
    return sanitized
  })
}

function isSQLSafe(sql: string): { safe: boolean; reason?: string } {
  const normalized = sql.trim().toUpperCase()
  
  if (/^(SELECT|WITH|SHOW|DESCRIBE|EXPLAIN|PRAGMA)\b/i.test(sql.trim())) {
    // Check for dangerous keywords as whole words
    const DANGEROUS_KEYWORDS_REGEX = /\b(DROP|DELETE|UPDATE|INSERT|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|EXEC|EXECUTE)\b/i
    if (DANGEROUS_KEYWORDS_REGEX.test(normalized)) {
      const match = sql.match(DANGEROUS_KEYWORDS_REGEX)?.[0]
      return { safe: false, reason: `Dangerous keyword detected: ${match}` }
    }

    // Check for dangerous patterns, functions or comments
    const DANGEROUS_PATTERNS_REGEX = /\b(LOAD_FILE|BENCHMARK|SLEEP|DBMS_PIPE)\b|xp_|sp_|0x|\/\*|\*\/|--|;--/i
    if (DANGEROUS_PATTERNS_REGEX.test(normalized)) {
      return { safe: false, reason: 'Dangerous SQL pattern or comment detected' }
    }

    return { safe: true }
  }
  
  return { safe: false, reason: 'Only SELECT queries are allowed' }
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
    const sql = await import('mssql')
    const pool = await sql.connect({
      server: String(config.host || '127.0.0.1'),
      port: Number(config.port || 1433),
      user: String(config.user || ''),
      password: String(config.password || ''),
      database: String(config.database || ''),
      options: { encrypt: true, trustServerCertificate: true },
    })
    return { type: 'mssql' as const, pool }
  }

  throw new Error(`Unsupported database type: ${config.type}`)
}

async function closeConnection(conn: Awaited<ReturnType<typeof getConnection>>) {
  if (conn.type === 'sqlite') conn.db.close()
  else if (conn.type === 'mysql') await conn.conn.end()
  else if (conn.type === 'pg') await conn.client.end()
  else if (conn.type === 'mssql') await conn.pool.close()
}

async function executeQuery(conn: Awaited<ReturnType<typeof getConnection>>, sql: string): Promise<Record<string, unknown>[]> {
  if (conn.type === 'sqlite') {
    return conn.db.prepare(sql).all() as Record<string, unknown>[]
  } else if (conn.type === 'mysql') {
    const [rows] = await conn.conn.execute(sql)
    return rows as Record<string, unknown>[]
  } else if (conn.type === 'pg') {
    const res = await conn.client.query(sql)
    return res.rows
  } else if (conn.type === 'mssql') {
    const result = await conn.pool.request().query(sql)
    return result.recordset
  }
  return []
}

async function getSchema(config: DBConfig): Promise<Record<string, unknown>> {
  let conn: Awaited<ReturnType<typeof getConnection>> | null = null
  try {
    conn = await getConnection(config)
    let tables: Record<string, unknown>[] = []

    if (conn.type === 'sqlite') {
      const db = conn.db
      const tablesList = db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'
      `).all() as Array<{ name: string }>
      
      tables = await Promise.all(tablesList.map(async (t) => {
        const columns = db.prepare(`PRAGMA table_info(${t.name})`).all()
        const count = db.prepare(`SELECT COUNT(*) as cnt FROM ${t.name}`).get() as { cnt: number }
        return { name: t.name, columns, rowCount: count.cnt }
      }))
    } else if (conn.type === 'mysql') {
      const [tablesList] = await conn.conn.execute(`
        SELECT TABLE_NAME as name FROM information_schema.TABLES 
        WHERE TABLE_SCHEMA = DATABASE()
      `)
      for (const t of (tablesList as Array<{ name: string }>).slice(0, 20)) {
        const [columns] = await conn.conn.execute(`
          SELECT COLUMN_NAME as name, DATA_TYPE as type, COLUMN_KEY as key_type
          FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
        `, [t.name])
        const [countRes] = await conn.conn.execute(`SELECT COUNT(*) as cnt FROM ${t.name}`)
        tables.push({ name: t.name, columns, rowCount: (countRes as Array<{ cnt: number }>)[0]?.cnt })
      }
    } else if (conn.type === 'pg') {
      const tablesList = await conn.client.query(`
        SELECT table_name as name FROM information_schema.tables 
        WHERE table_schema = 'public'
      `)
      for (const t of tablesList.rows.slice(0, 20)) {
        const columns = await conn.client.query(`
          SELECT column_name as name, data_type as type, column_key as key_type
          FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1
        `, [t.name])
        const count = await conn.client.query(`SELECT COUNT(*) as cnt FROM ${t.name}`)
        tables.push({ name: t.name, columns: columns.rows, rowCount: Number(count.rows[0]?.cnt) })
      }
    } else if (conn.type === 'mssql') {
      const tablesList = await conn.pool.request().query(`
        SELECT TABLE_NAME as name FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'
      `)
      for (const t of tablesList.recordset.slice(0, 20)) {
        const columns = await conn.pool.request()
          .input('tableName', t.name)
          .query(`SELECT COLUMN_NAME as name, DATA_TYPE as type, COLUMN_KEY as key_type 
                  FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tableName`)
        const count = await conn.pool.request()
          .input('tableName', t.name)
          .query(`SELECT COUNT(*) as cnt FROM ${t.name}`)
        tables.push({ name: t.name, columns: columns.recordset, rowCount: count.recordset[0]?.cnt })
      }
    }

    return { tables }
  } finally {
    if (conn) await closeConnection(conn)
  }
}

function buildNL2SQLPrompt(naturalLanguage: string, schema: Record<string, unknown>, dbType: string): string {
  const schemaStr = JSON.stringify(schema, null, 2)
  
  return `You are an expert SQL developer. Convert the following natural language query into a ${dbType} SQL statement.

Database Schema:
${schemaStr}

User Query: ${naturalLanguage}

Rules:
1. ONLY return a valid SELECT statement
2. Use proper ${dbType} syntax
3. Include appropriate JOINs if needed
4. Add LIMIT 100 if no limit is specified
5. Use proper column aliases for readability
6. Do NOT include any explanations or markdown
7. Do NOT use dangerous operations (DROP, DELETE, UPDATE, etc.)

Return ONLY the SQL query, nothing else.`
}

function buildAnalysisPrompt(analysisType: string, queryResults: Record<string, unknown>[], userQuery: string): string {
  const dataSample = JSON.stringify(queryResults.slice(0, 10), null, 2)
  const totalRows = queryResults.length
  
  return `You are a senior data analyst. Analyze the following query results and provide insights.

Analysis Type: ${analysisType}
User's Original Query: ${userQuery}
Total Rows: ${totalRows}

Data Sample (first 10 rows):
${dataSample}

Provide your analysis in the following format:

## Analysis Summary
[2-3 sentence summary of key findings]

## Key Insights
- [Insight 1 with specific numbers]
- [Insight 2 with specific numbers]
- [Insight 3 if applicable]

## Recommendations
- [Actionable recommendation 1]
- [Actionable recommendation 2]

${analysisType === 'trend' ? '## Trend Patterns\n- [Describe any trends detected]' : ''}
${analysisType === 'anomaly' ? '## Anomalies Detected\n- [Describe any anomalies found]' : ''}
${analysisType === 'correlation' ? '## Correlations\n- [Describe any correlations found]' : ''}`
}

async function getOpenAiConfig() {
  try {
    const settings = await prisma.settings.findUnique({ where: { id: 'default' } })
    return {
      apiKey: settings?.openaiKey || process.env.OPENAI_API_KEY || '',
      apiBase: settings?.openaiApiBase || process.env.OPENAI_API_BASE || 'https://api.openai.com/v1'
    }
  } catch {
    return {
      apiKey: process.env.OPENAI_API_KEY || '',
      apiBase: process.env.OPENAI_API_BASE || 'https://api.openai.com/v1'
    }
  }
}

async function callAIModel(prompt: string, model: string = 'doubao-seed-2.0-code'): Promise<string> {
  try {
    const config = await getOpenAiConfig()
    const response = await fetch(`${config.apiBase.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are a helpful assistant. Provide concise, accurate responses.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 2000
      })
    })

    if (!response.ok) {
      throw new Error(`AI model request failed: ${response.status}`)
    }

    const data = await response.json()
    return data.choices?.[0]?.message?.content || 'No response generated'
  } catch (error) {
    console.error('AI Model call failed:', error)
    throw error
  }
}

// POST /api/data-sources?action=nl2sql
export async function POST(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action')
  
  try {
    const body = await req.json()

    if (action === 'test') {
      const { config } = body
      let conn: Awaited<ReturnType<typeof getConnection>> | null = null
      try {
        conn = await getConnection(config)
        return NextResponse.json({ ok: true })
      } catch (err) {
        return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 400 })
      } finally {
        if (conn) await closeConnection(conn)
      }
    }

    if (action === 'nl2sql') {
      const { config, naturalLanguage, schema } = body as QueryRequest
      
      if (!naturalLanguage) {
        return NextResponse.json({ error: 'Natural language query is required' }, { status: 400 })
      }

      const dbSchema = schema || await getSchema(config)
      const sqlPrompt = buildNL2SQLPrompt(naturalLanguage, dbSchema, config.type)
      
      try {
        const sql = await callAIModel(sqlPrompt)
        const safetyCheck = isSQLSafe(sql)
        
        return NextResponse.json({
          sql: sql.trim(),
          isSafe: safetyCheck.safe,
          reason: safetyCheck.reason,
          schema: dbSchema
        })
      } catch (aiError) {
        return NextResponse.json({
          error: 'Failed to generate SQL',
          details: (aiError as Error).message
        }, { status: 500 })
      }
    }

    if (action === 'execute') {
      const { config, sql } = body as ExecuteRequest
      
      if (!sql) {
        return NextResponse.json({ error: 'SQL query is required' }, { status: 400 })
      }

      const safetyCheck = isSQLSafe(sql)
      if (!safetyCheck.safe) {
        return NextResponse.json({
          error: 'SQL query rejected',
          reason: safetyCheck.reason
        }, { status: 403 })
      }

      let conn: Awaited<ReturnType<typeof getConnection>> | null = null
      try {
        conn = await getConnection(config)
        const rows = await executeQuery(conn, sql)
        
        const columns = rows.length > 0 ? Object.keys(rows[0]) : []
        const sanitizedRows = sanitizeSensitiveData(rows, columns)
        
        return NextResponse.json({
          rows: sanitizedRows.slice(0, 1000),
          totalRows: sanitizedRows.length,
          columns,
          executionTime: Date.now()
        })
      } finally {
        if (conn) await closeConnection(conn)
      }
    }

    if (action === 'analyze') {
      const { config, sql, analysisType } = body as AnalyzeRequest
      
      if (!sql || !analysisType) {
        return NextResponse.json({ error: 'SQL and analysis type are required' }, { status: 400 })
      }

      const safetyCheck = isSQLSafe(sql)
      if (!safetyCheck.safe) {
        return NextResponse.json({ error: 'SQL query rejected', reason: safetyCheck.reason }, { status: 403 })
      }

      let conn: Awaited<ReturnType<typeof getConnection>> | null = null
      try {
        conn = await getConnection(config)
        const rows = await executeQuery(conn, sql)
        
        const analysisPrompt = buildAnalysisPrompt(analysisType, rows, sql)
        const analysis = await callAIModel(analysisPrompt, 'deepseek-v4-pro')
        
        return NextResponse.json({
          analysis,
          rowCount: rows.length,
          columns: rows.length > 0 ? Object.keys(rows[0]) : []
        })
      } finally {
        if (conn) await closeConnection(conn)
      }
    }

    if (action === 'schema') {
      const schema = await getSchema(body.config)
      return NextResponse.json({ schema })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('Data source API error:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: (error as Error).message
    }, { status: 500 })
  }
}
