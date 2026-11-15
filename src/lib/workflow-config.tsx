import {
  Zap, Brain, FileText, ArrowLeftRight, Sparkles, GitBranch,
  Repeat, Code2, Globe, Merge, Terminal
} from 'lucide-react'
import type { StepType, NodeCategory } from '@/types/workflow'

export interface StepTypeConfig {
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  bg: string
  text: string
  border: string
  badge: string
  category: NodeCategory
  /** How many output handles: 'single' | 'dual' (condition) | 'none' (output) */
  outputHandles: 'single' | 'dual' | 'none'
  defaultConfig?: Record<string, unknown>
}

export const STEP_TYPE_CONFIG: Record<StepType, StepTypeConfig> = {
  trigger: {
    label: 'Trigger',
    description: 'Start point of the workflow',
    icon: Zap,
    color: 'bg-sky-500',
    bg: 'bg-sky-50 dark:bg-sky-900/20',
    text: 'text-sky-700 dark:text-sky-400',
    border: 'border-sky-200 dark:border-sky-800',
    badge: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-200 dark:border-sky-800',
    category: 'flow',
    outputHandles: 'single',
  },
  llm: {
    label: 'LLM Call',
    description: 'Call an AI model with a prompt',
    icon: Brain,
    color: 'bg-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    text: 'text-blue-700 dark:text-blue-400',
    border: 'border-blue-200 dark:border-blue-800',
    badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800',
    category: 'ai',
    outputHandles: 'single',
    defaultConfig: { temperature: 0.7, maxTokens: 2048 },
  },
  prompt: {
    label: 'Prompt',
    description: 'Send a prompt to the model',
    icon: FileText,
    color: 'bg-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    text: 'text-blue-700 dark:text-blue-400',
    border: 'border-blue-200 dark:border-blue-800',
    badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800',
    category: 'ai',
    outputHandles: 'single',
  },
  transform: {
    label: 'Transform',
    description: 'Transform or rewrite content',
    icon: ArrowLeftRight,
    color: 'bg-purple-500',
    bg: 'bg-purple-50 dark:bg-purple-900/20',
    text: 'text-purple-700 dark:text-purple-400',
    border: 'border-purple-200 dark:border-purple-800',
    badge: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800',
    category: 'ai',
    outputHandles: 'single',
  },
  extract: {
    label: 'Extract',
    description: 'Extract specific information',
    icon: Sparkles,
    color: 'bg-amber-500',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    text: 'text-amber-700 dark:text-amber-400',
    border: 'border-amber-200 dark:border-amber-800',
    badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800',
    category: 'ai',
    outputHandles: 'single',
  },
  condition: {
    label: 'Condition',
    description: 'Branch based on a condition',
    icon: GitBranch,
    color: 'bg-green-500',
    bg: 'bg-green-50 dark:bg-green-900/20',
    text: 'text-green-700 dark:text-green-400',
    border: 'border-green-200 dark:border-green-800',
    badge: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800',
    category: 'logic',
    outputHandles: 'dual',
    defaultConfig: { conditionExpression: '' },
  },
  loop: {
    label: 'Loop',
    description: 'Iterate over a list of items',
    icon: Repeat,
    color: 'bg-teal-500',
    bg: 'bg-teal-50 dark:bg-teal-900/20',
    text: 'text-teal-700 dark:text-teal-400',
    border: 'border-teal-200 dark:border-teal-800',
    badge: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-800',
    category: 'logic',
    outputHandles: 'single',
    defaultConfig: { loopVariable: 'items', maxIterations: 100 },
  },
  code: {
    label: 'Code',
    description: 'Run custom JavaScript code',
    icon: Code2,
    color: 'bg-orange-500',
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    text: 'text-orange-700 dark:text-orange-400',
    border: 'border-orange-200 dark:border-orange-800',
    badge: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800',
    category: 'action',
    outputHandles: 'single',
    defaultConfig: { language: 'javascript', code: '// Process input\nreturn input;' },
  },
  http: {
    label: 'HTTP Request',
    description: 'Make an HTTP API call',
    icon: Globe,
    color: 'bg-cyan-500',
    bg: 'bg-cyan-50 dark:bg-cyan-900/20',
    text: 'text-cyan-700 dark:text-cyan-400',
    border: 'border-cyan-200 dark:border-cyan-800',
    badge: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800',
    category: 'action',
    outputHandles: 'single',
    defaultConfig: { method: 'GET', url: '', headers: {} },
  },
  merge: {
    label: 'Merge',
    description: 'Merge parallel branches',
    icon: Merge,
    color: 'bg-pink-500',
    bg: 'bg-pink-50 dark:bg-pink-900/20',
    text: 'text-pink-700 dark:text-pink-400',
    border: 'border-pink-200 dark:border-pink-800',
    badge: 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-200 dark:border-pink-800',
    category: 'logic',
    outputHandles: 'single',
    defaultConfig: { mergeStrategy: 'wait_all' },
  },
  output: {
    label: 'Output',
    description: 'Final output of the workflow',
    icon: Terminal,
    color: 'bg-rose-500',
    bg: 'bg-rose-50 dark:bg-rose-900/20',
    text: 'text-rose-700 dark:text-rose-400',
    border: 'border-rose-200 dark:border-rose-800',
    badge: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800',
    category: 'flow',
    outputHandles: 'none',
  },
}

export const NODE_CATEGORIES: { id: NodeCategory; label: string; icon: string }[] = [
  { id: 'flow', label: 'Flow Control', icon: '⚡' },
  { id: 'ai', label: 'AI / LLM', icon: '🤖' },
  { id: 'logic', label: 'Logic', icon: '🔀' },
  { id: 'action', label: 'Action', icon: '⚙️' },
]

/** Get step types grouped by category */
export function getStepsByCategory(): Record<NodeCategory, StepType[]> {
  const result: Record<NodeCategory, StepType[]> = { flow: [], ai: [], logic: [], action: [] }
  for (const [type, config] of Object.entries(STEP_TYPE_CONFIG)) {
    result[config.category].push(type as StepType)
  }
  return result
}
