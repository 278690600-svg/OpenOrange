import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import vm from 'vm'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { code, language = 'javascript', sandbox = 'safe' } = body

    if (!code) {
      return NextResponse.json({ error: 'Code is required' }, { status: 400 })
    }

    const startTime = Date.now()

    // Safe JavaScript execution using Function constructor with limited scope
    if (language === 'javascript' || language === 'js') {
      try {
        // Create safe execution environment
        const safeConsole = {
          log: (...args: unknown[]) => args.map(a => String(a)).join(' '),
          error: (...args: unknown[]) => args.map(a => String(a)).join(' '),
          warn: (...args: unknown[]) => args.map(a => String(a)).join(' ')
        }

        const logs: string[] = []
        const originalLog = safeConsole.log
        safeConsole.log = (...args: unknown[]) => {
          const msg = originalLog(...args)
          logs.push(msg)
          return msg
        }

        // Execute in isolated VM scope with timeout
        const sandboxContext = {
          console: safeConsole
        }
        vm.createContext(sandboxContext)

        const script = new vm.Script(`"use strict";\n${code}`)
        const result = script.runInContext(sandboxContext, { timeout: 2000 })
        const executionTime = Date.now() - startTime

        return NextResponse.json({
          success: true,
          result: result !== undefined ? String(result) : null,
          logs,
          executionTime,
          language
        })
      } catch (err) {
        return NextResponse.json({
          success: false,
          error: (err as Error).message,
          executionTime: Date.now() - startTime,
          language
        })
      }
    }

    // Python execution via Pyodide (client-side WASM)
    if (language === 'python' || language === 'py') {
      return NextResponse.json({
        success: true,
        result: 'Python execution requires Pyodide in browser',
        logs: ['Note: Python execution is handled client-side via Pyodide'],
        executionTime: 0,
        language,
        requiresClientExecution: true
      })
    }

    return NextResponse.json({ error: 'Unsupported language' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: 'Execution failed', details: (err as Error).message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  if (action === 'templates') {
    const templates = [
      {
        id: 'hello-world',
        name: 'Hello World',
        language: 'javascript',
        code: 'console.log("Hello, World!")'
      },
      {
        id: 'data-processing',
        name: 'Data Processing',
        language: 'javascript',
        code: `const data = [1, 2, 3, 4, 5];
const result = data
  .filter(x => x > 2)
  .map(x => x * 2)
  .reduce((sum, x) => sum + x, 0);
console.log('Result:', result);`
      },
      {
        id: 'fibonacci',
        name: 'Fibonacci Sequence',
        language: 'javascript',
        code: `function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

const result = [];
for (let i = 0; i < 10; i++) {
  result.push(fibonacci(i));
}
console.log('Fibonacci:', result);`
      }
    ]
    return NextResponse.json({ templates })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
