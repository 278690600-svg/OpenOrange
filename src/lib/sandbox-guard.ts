/**
 * Code Execution Sandbox Guard
 * Static analysis and security interceptor for Python, Shell, and Plugin scripts.
 */

export interface SecurityAuditResult {
  safe: boolean
  riskLevel: 'safe' | 'low' | 'medium' | 'high' | 'critical'
  violations: string[]
  sanitized?: string
}

interface DangerousRule {
  pattern: RegExp
  level: 'medium' | 'high' | 'critical'
  description: string
}

const DANGEROUS_RULES: DangerousRule[] = [
  // Critical: Root or System wiping
  {
    pattern: /rm\s+-(?:r|f|rf|fr)\s+[\/\\](?:\s|$|\*)/i,
    level: 'critical',
    description: 'Destructive deletion of root directory (rm -rf /)'
  },
  {
    pattern: /(?:del|rd|rmdir)\s+\/[sq]\s+[c-z]:\\(?:windows|system32)/i,
    level: 'critical',
    description: 'Destructive deletion of Windows system directories'
  },
  {
    pattern: /(?:mkfs|format\s+[a-z]:|diskpart)/i,
    level: 'critical',
    description: 'Disk partition formatting and volume wipe operations'
  },
  {
    pattern: /dd\s+if=.*of=\/dev\/(?:sd|hd|nvme|zero|null)/i,
    level: 'critical',
    description: 'Raw disk block overwrite (dd of=/dev/sd*)'
  },
  {
    pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
    level: 'critical',
    description: 'Bash fork bomb attack pattern'
  },

  // High: Reverse shells & Network backdoors
  {
    pattern: /(?:nc|ncat|netcat)\s+.*-e\s+(?:\/bin\/sh|\/bin\/bash|cmd\.exe|powershell)/i,
    level: 'high',
    description: 'Netcat reverse shell backdoor invocation'
  },
  {
    pattern: /(?:bash|sh)\s+-i\s+>&?\s+\/dev\/tcp\//i,
    level: 'high',
    description: 'Interactive TCP socket reverse shell'
  },
  {
    pattern: /socket\s*\(\s*socket\.AF_INET\s*,\s*socket\.SOCK_STREAM\s*\)[\s\S]*os\.dup2/i,
    level: 'high',
    description: 'Python socket socket redirection reverse shell'
  },

  // High: Python destructive operations
  {
    pattern: /shutil\.rmtree\s*\(\s*['"](?:[\/\\]+|[a-z]:[\\\/]*)['"]\s*\)/i,
    level: 'critical',
    description: 'Python recursive deletion of root or drive root'
  },
  {
    pattern: /(?:os|subprocess)\s*\.\s*(?:system|popen|run|call)\s*\(\s*['"].*?(?:rm\s+-rf|del\s+\/f|format\s+[a-z]:)/i,
    level: 'critical',
    description: 'Python executing destructive shell commands'
  },

  // Medium: Sensitive system file access
  {
    pattern: /(?:\/etc\/shadow|\/etc\/gshadow|SAM|SYSTEM\.hiv)/i,
    level: 'medium',
    description: 'Access to system credential databases'
  }
]

/**
 * Statically audits a script or shell command for destructive patterns.
 */
export function auditCodeSafety(code: string, language: string = 'text'): SecurityAuditResult {
  if (!code || typeof code !== 'string') {
    return { safe: true, riskLevel: 'safe', violations: [] }
  }

  const violations: string[] = []
  let highestLevel: 'safe' | 'low' | 'medium' | 'high' | 'critical' = 'safe'

  const levelPriority: Record<string, number> = {
    safe: 0,
    low: 1,
    medium: 2,
    high: 3,
    critical: 4
  }

  for (const rule of DANGEROUS_RULES) {
    if (rule.pattern.test(code)) {
      violations.push(`[${rule.level.toUpperCase()}] ${rule.description}`)
      if (levelPriority[rule.level] > levelPriority[highestLevel]) {
        highestLevel = rule.level
      }
    }
  }

  const isSafe = highestLevel !== 'critical' && highestLevel !== 'high'

  return {
    safe: isSafe,
    riskLevel: highestLevel,
    violations
  }
}
