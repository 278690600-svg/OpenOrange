import prisma from '@/lib/db'
import { generateText } from 'ai'
import { getSmartProvider } from '@/lib/ai-provider'
import type { ErrorStrategy, StepConfig, WorkflowEdgeData } from '@/types/workflow'

// ============================================================
// Types
// ============================================================

interface WorkflowStepResult {
  stepId: string
  stepName: string
  order: number
  type: string
  output: string
  outputKey: string | null
  duration: number
  status: 'success' | 'error' | 'skipped'
}

interface WorkflowExecutionResult {
  workflowId: string
  workflowName: string
  steps: WorkflowStepResult[]
  totalDuration: number
  finalOutput: string
  status: 'success' | 'partial' | 'failed'
}

interface Settings {
  defaultModel?: string
  ollamaUrl?: string
  lmstudioUrl?: string
  openaiKey?: string
  deepseekKey?: string
  minimaxKey?: string
  openrouterKey?: string
  nvidiaKey?: string
  volcengineKey?: string
  [key: string]: unknown
}

interface StepRecord {
  id: string
  order: number
  type: string
  name: string
  prompt: string
  model: string | null
  outputKey: string | null
  config: string
  description: string | null
}

interface EdgeRecord {
  id: string
  sourceStepId: string
  targetStepId: string
  sourceHandle: string | null
  label: string | null
}

// ============================================================
// Constants
// ============================================================

const STEP_TIMEOUT_MS = 60_000
const MAX_RETRIES = 2

// ============================================================
// Helpers
// ============================================================

async function getSettings(): Promise<Settings | null> {
  return await prisma.settings.findUnique({ where: { id: 'default' } })
}

function resolveVariables(prompt: string, context: Record<string, string>): string {
  let result = prompt
  for (const [key, value] of Object.entries(context)) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`\\{\\{${escapedKey}\\}\\}`, 'g')
    result = result.replace(regex, value)
  }
  return result
}

function parseConfig(configStr: string): StepConfig {
  try {
    return JSON.parse(configStr || '{}')
  } catch {
    return {}
  }
}

// ============================================================
// Step Execution
// ============================================================

async function callLLM(
  prompt: string,
  modelId: string,
  settings: Settings,
  config?: StepConfig
): Promise<string> {
  const { provider, resolvedId } = await getSmartProvider(modelId, settings)
  const timeout = config?.timeout || STEP_TIMEOUT_MS

  const { text } = await generateText({
    model: provider(resolvedId) as any,
    prompt,
    maxRetries: config?.retries ?? MAX_RETRIES,
    abortSignal: AbortSignal.timeout(timeout),
    ...(config?.maxTokens ? { maxTokens: config.maxTokens } : {}),
    ...(config?.temperature !== undefined ? { temperature: config.temperature } : {}),
  })

  return text
}

async function executeStep(
  step: StepRecord,
  context: Record<string, string>,
  settings: Settings
): Promise<string> {
  const config = parseConfig(step.config)
  const resolvedPrompt = resolveVariables(step.prompt, context)
  const modelId = step.model || settings.defaultModel || 'ollama::llama3'

  switch (step.type) {
    case 'trigger':
      return context.input || ''

    case 'condition': {
      if (!resolvedPrompt.trim()) {
        return 'true' // Default to true if no prompt
      }
      const conditionResult = await callLLM(resolvedPrompt, modelId, settings, config)
      const isTrue = /^(true|yes|1|是)$/i.test(conditionResult.trim())
      return isTrue ? 'true' : 'false'
    }

    case 'output':
      return resolveVariables(step.prompt, context)

    case 'code': {
      const code = config.code || 'return input;'
      const input = context
      try {
        const fn = new Function('input', code)
        const result = fn(input)
        return typeof result === 'string' ? result : JSON.stringify(result)
      } catch (err) {
        throw new Error(`Code execution error: ${(err as Error).message}`)
      }
    }

    case 'http': {
      const url = resolveVariables(config.url || '', context)
      if (!url) throw new Error('HTTP step: url is required')
      const method = config.method || 'GET'
      const headers: Record<string, string> = (config.headers as Record<string, string>) || {}
      const body = config.body ? resolveVariables(config.body, context) : undefined

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: method !== 'GET' ? body : undefined,
        signal: AbortSignal.timeout(config.timeout || 30_000),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      const text = await response.text()
      try {
        return JSON.stringify(JSON.parse(text), null, 2)
      } catch {
        return text
      }
    }

    case 'loop': {
      const loopVar = config.loopVariable || 'items'
      const maxIter = config.maxIterations || 100
      const itemsStr = context[loopVar]
      if (!itemsStr) throw new Error(`Loop: variable "${loopVar}" not found in context`)

      let items: unknown[]
      try {
        items = JSON.parse(itemsStr)
        if (!Array.isArray(items)) items = [items]
      } catch {
        items = itemsStr.split('\n').filter(Boolean)
      }

      if (items.length > maxIter) {
        items = items.slice(0, maxIter)
      }

      const results: string[] = []
      for (const item of items) {
        const loopContext = { ...context, current_item: String(item), index: String(results.length) }
        const loopPrompt = resolveVariables(step.prompt, loopContext)
        const result = await callLLM(loopPrompt, modelId, settings, config)
        results.push(result)
      }

      return JSON.stringify(results)
    }

    case 'merge':
      // Merge just passes through - the engine handles merging parallel results
      return resolvedPrompt || JSON.stringify(context)

    case 'llm':
    case 'prompt':
    case 'transform':
    case 'extract':
    default:
      return await callLLM(resolvedPrompt, modelId, settings, config)
  }
}

// ============================================================
// Graph-based Workflow Execution
// ============================================================

/**
 * Build an adjacency list from edges.
 * Returns { forward: Map<sourceId, EdgeRecord[]>, backward: Map<targetId, EdgeRecord[]> }
 */
function buildGraph(edges: EdgeRecord[]) {
  const forward = new Map<string, EdgeRecord[]>()
  const backward = new Map<string, EdgeRecord[]>()

  for (const edge of edges) {
    if (!forward.has(edge.sourceStepId)) forward.set(edge.sourceStepId, [])
    forward.get(edge.sourceStepId)!.push(edge)

    if (!backward.has(edge.targetStepId)) backward.set(edge.targetStepId, [])
    backward.get(edge.targetStepId)!.push(edge)
  }

  return { forward, backward }
}

/**
 * Find root nodes (no incoming edges)
 */
function findRootNodes(steps: StepRecord[], edges: EdgeRecord[]): StepRecord[] {
  const targets = new Set(edges.map(e => e.targetStepId))
  return steps.filter(s => !targets.has(s.id))
}

/**
 * Execute workflow using graph traversal with condition branching and parallel execution.
 */
export async function executeWorkflow(
  workflowId: string,
  initialInput?: Record<string, string>,
  errorStrategy: ErrorStrategy = 'abort'
): Promise<WorkflowExecutionResult> {
  const workflow = await prisma.workflow.findUnique({
    where: { id: workflowId },
    include: {
      steps: { orderBy: { order: 'asc' } },
      edges: { orderBy: { createdAt: 'asc' } },
    }
  })

  if (!workflow) throw new Error(`Workflow ${workflowId} not found`)
  if (workflow.status !== 'active') throw new Error(`Workflow ${workflowId} is not active`)

  const settings = await getSettings()
  const context: Record<string, string> = { ...initialInput }
  const results: WorkflowStepResult[] = []
  const startTime = Date.now()
  let hasError = false

  // Create execution record
  const execution = await prisma.workflowExecution.create({
    data: {
      workflowId,
      status: 'running',
      input: JSON.stringify(initialInput || {}),
    }
  })

  const steps = workflow.steps as StepRecord[]
  const edges = workflow.edges as EdgeRecord[]
  const stepMap = new Map(steps.map(s => [s.id, s]))

  // If no edges, fall back to linear execution
  if (edges.length === 0) {
    for (const step of steps) {
      const stepStart = Date.now()
      if (!step.prompt.trim() && step.type !== 'trigger' && step.type !== 'output') {
        results.push({
          stepId: step.id, stepName: step.name || step.type, order: step.order,
          type: step.type, output: 'Skipped: empty prompt', outputKey: step.outputKey,
          duration: Date.now() - stepStart, status: 'skipped'
        })
        continue
      }

      try {
        const output = await executeStep(step, context, settings as Settings)
        if (step.outputKey) context[step.outputKey] = output
        results.push({
          stepId: step.id, stepName: step.name || step.type, order: step.order,
          type: step.type, output, outputKey: step.outputKey,
          duration: Date.now() - stepStart, status: 'success'
        })
      } catch (error) {
        hasError = true
        results.push({
          stepId: step.id, stepName: step.name || step.type, order: step.order,
          type: step.type, output: `Error: ${(error as Error).message}`, outputKey: step.outputKey,
          duration: Date.now() - stepStart, status: 'error'
        })
        if (errorStrategy === 'abort') break
      }
    }
  } else {
    // Graph-based execution with branching and parallel support
    const { forward, backward } = buildGraph(edges)
    const completed = new Set<string>()
    const executing = new Set<string>()

    // Find root nodes
    let queue = findRootNodes(steps, edges)

    // If no root found (e.g., all nodes have incoming edges), use first step by order
    if (queue.length === 0 && steps.length > 0) {
      queue = [steps[0]]
    }

    while (queue.length > 0) {
      // Execute all nodes in the current level in parallel
      const parallelResults = await Promise.allSettled(
        queue.map(async (step) => {
          executing.add(step.id)

          // For merge nodes, wait for all predecessors
          if (step.type === 'merge') {
            const incomingEdges = backward.get(step.id) || []
            const allPredecessorsComplete = incomingEdges.every(e => completed.has(e.sourceStepId))
            if (!allPredecessorsComplete) {
              return { step, output: '', status: 'skipped' as const }
            }
            // Merge context from all predecessors
            const mergedOutputs = incomingEdges
              .map(e => results.find(r => r.stepId === e.sourceStepId))
              .filter(Boolean)
              .map(r => r!.output)
            const mergedContext = { ...context, merged: JSON.stringify(mergedOutputs) }
            const output = await executeStep(step, mergedContext, settings as Settings)
            return { step, output, status: 'success' as const }
          }

          if (!step.prompt.trim() && step.type !== 'trigger' && step.type !== 'output') {
            return { step, output: 'Skipped: empty prompt', status: 'skipped' as const }
          }

          const output = await executeStep(step, context, settings as Settings)
          return { step, output, status: 'success' as const }
        })
      )

      // Process results and determine next nodes
      const nextQueue: StepRecord[] = []

      for (let i = 0; i < parallelResults.length; i++) {
        const result = parallelResults[i]
        const step = queue[i]
        const stepStart = Date.now()

        if (result.status === 'fulfilled') {
          const { output, status } = result.value

          if (status === 'skipped') {
            results.push({
              stepId: step.id, stepName: step.name || step.type, order: step.order,
              type: step.type, output, outputKey: step.outputKey,
              duration: Date.now() - stepStart, status: 'skipped'
            })
            // Still mark as completed so downstream can proceed
            completed.add(step.id)
            continue
          }

          if (step.outputKey) context[step.outputKey] = output
          results.push({
            stepId: step.id, stepName: step.name || step.type, order: step.order,
            type: step.type, output, outputKey: step.outputKey,
            duration: Date.now() - stepStart, status: 'success'
          })
          completed.add(step.id)

          // Determine next nodes based on edges
          const outEdges = forward.get(step.id) || []
          for (const edge of outEdges) {
            // For condition nodes, only follow the matching path
            if (step.type === 'condition') {
              const conditionResult = output // "true" or "false"
              if (edge.sourceHandle && edge.sourceHandle !== conditionResult) {
                continue // Skip this edge - wrong branch
              }
            }

            const targetStep = stepMap.get(edge.targetStepId)
            if (targetStep && !completed.has(targetStep.id) && !executing.has(targetStep.id)) {
              // For merge nodes, check if all predecessors are done
              if (targetStep.type === 'merge') {
                const incomingEdges = backward.get(targetStep.id) || []
                const allDone = incomingEdges.every(e => completed.has(e.sourceStepId))
                if (!allDone) continue
              }
              nextQueue.push(targetStep)
              executing.add(targetStep.id)
            }
          }
        } else {
          hasError = true
          const error = result.reason as Error
          results.push({
            stepId: step.id, stepName: step.name || step.type, order: step.order,
            type: step.type, output: `Error: ${error?.message || String(error)}`,
            outputKey: step.outputKey, duration: Date.now() - stepStart, status: 'error'
          })
          completed.add(step.id)

          if (errorStrategy === 'abort') {
            queue = []
            break
          }
        }
      }

      queue = nextQueue
    }
  }

  // Determine final output
  const successResults = results.filter(r => r.status === 'success')
  const finalOutput = successResults.length > 0
    ? successResults[successResults.length - 1].output
    : results.length > 0 ? results[results.length - 1].output : ''

  const executionStatus = hasError
    ? (results.some(r => r.status === 'success') ? 'partial' : 'failed')
    : 'success'
  const totalDuration = Date.now() - startTime

  // Update execution record
  await prisma.workflowExecution.update({
    where: { id: execution.id },
    data: {
      status: executionStatus,
      result: JSON.stringify({ steps: results, finalOutput }),
      duration: totalDuration,
      completedAt: new Date(),
    }
  })

  return {
    workflowId: workflow.id,
    workflowName: workflow.name,
    steps: results,
    totalDuration,
    finalOutput,
    status: executionStatus
  }
}

// ============================================================
// Utility Functions
// ============================================================

export async function testWorkflowStep(
  stepId: string,
  context?: Record<string, string>
): Promise<string> {
  const step = await prisma.workflowStep.findUnique({ where: { id: stepId } })
  if (!step) throw new Error(`Step ${stepId} not found`)
  if (!step.prompt.trim() && step.type !== 'trigger') throw new Error('Step prompt is empty')

  const settings = await getSettings()
  return await executeStep(step as StepRecord, context || {}, settings as Settings)
}

export async function getWorkflowWithSteps(workflowId: string) {
  return await prisma.workflow.findUnique({
    where: { id: workflowId },
    include: {
      steps: { orderBy: { order: 'asc' } },
      edges: { orderBy: { createdAt: 'asc' } },
    }
  })
}

export async function getExecutionHistory(workflowId: string, limit = 20) {
  return await prisma.workflowExecution.findMany({
    where: { workflowId },
    orderBy: { startedAt: 'desc' },
    take: limit,
  })
}
