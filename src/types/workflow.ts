// ============================================================
// Workflow Types - Enhanced with branching, parallel, templates
// ============================================================

/** All supported step/node types */
export type StepType =
  | 'trigger'    // Entry point (manual / webhook / schedule)
  | 'llm'        // Call an LLM model
  | 'prompt'     // Legacy: basic prompt (maps to llm)
  | 'transform'  // Legacy: transform (maps to llm)
  | 'extract'    // Legacy: extract (maps to llm)
  | 'condition'  // Branch: true / false outputs
  | 'loop'       // Iterate over array items
  | 'code'       // Run custom code
  | 'http'       // HTTP request
  | 'merge'      // Merge parallel branches
  | 'output'     // End / output node

/** Sidebar category */
export type NodeCategory = 'flow' | 'ai' | 'logic' | 'action'

/** Per-step configuration (type-specific) */
export interface StepConfig {
  // LLM
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
  // Condition
  conditionExpression?: string
  // Loop
  loopVariable?: string
  maxIterations?: number
  // HTTP
  url?: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  headers?: Record<string, string>
  body?: string
  // Code
  code?: string
  language?: 'javascript' | 'python'
  // Merge
  mergeStrategy?: 'wait_all' | 'wait_any'
  // General
  timeout?: number
  retries?: number
  [key: string]: unknown
}

/** A single workflow step / node */
export interface WorkflowStep {
  id?: string
  type: StepType
  name: string
  prompt: string
  model?: string
  outputKey?: string
  config?: StepConfig
  description?: string
  order: number
}

/** An edge connecting two steps */
export interface WorkflowEdgeData {
  id?: string
  sourceStepId: string
  targetStepId: string
  sourceHandle?: string // "true" | "false" for condition nodes
  label?: string
}

/** Full workflow data */
export interface WorkflowData {
  id: string
  name: string
  description?: string
  trigger: string
  status: string
  steps: WorkflowStep[]
  edges: WorkflowEdgeData[]
  createdAt: string
  updatedAt: string
}

/** Single step execution result */
export interface ExecutionStepResult {
  stepId: string
  stepName: string
  order: number
  type: string
  output: string
  outputKey: string | null
  duration: number
  status: 'success' | 'error' | 'skipped'
}

/** Full execution result */
export interface ExecutionData {
  workflowId: string
  workflowName: string
  steps: ExecutionStepResult[]
  totalDuration: number
  finalOutput: string
  status: 'success' | 'partial' | 'failed'
}

/** Execution history record (from DB) */
export interface ExecutionRecord {
  id: string
  workflowId: string
  status: string
  input: string
  result: string
  duration: number
  startedAt: string
  completedAt: string | null
}

/** Workflow template */
export interface WorkflowTemplate {
  id: string
  name: string
  description: string
  icon: string
  category: string
  steps: WorkflowStep[]
  edges: WorkflowEdgeData[]
}

export type ErrorStrategy = 'abort' | 'skip' | 'retry'

export const VALID_STEP_TYPES: StepType[] = [
  'trigger', 'llm', 'prompt', 'transform', 'extract',
  'condition', 'loop', 'code', 'http', 'merge', 'output'
]
