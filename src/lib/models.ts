import fs from 'fs'
import path from 'path'

export type ModelOption = {
  id: string
  name: string
  provider: string
}

async function getGgufFiles(dir: string, depth = 0): Promise<string[]> {
  if (depth > 2) return []
  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true })
    const files: string[] = []
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        files.push(...(await getGgufFiles(fullPath, depth + 1)))
      } else if (entry.name.toLowerCase().endsWith('.gguf')) {
        files.push(fullPath)
      }
    }
    return files
  } catch (e) {
    return []
  }
}

// 简单的内存缓存，防止频繁扫描磁盘导致的卡顿
let cachedModels: ModelOption[] | null = null
let lastScanTime = 0
const CACHE_TTL = 30000 // 30秒缓存

export function getLocalModelsDir() {
  let modelsDir = path.join(process.cwd(), '.models')
  if (fs.existsSync(modelsDir)) return modelsDir
  
  modelsDir = path.join(process.cwd(), 'models')
  if (fs.existsSync(modelsDir)) return modelsDir
  
  // 都不存在则返回默认隐藏目录，由后续逻辑创建
  return path.join(process.cwd(), '.models')
}

export function resolveModelPath(fileName: string) {
  const baseDir = getLocalModelsDir()
  // 防止路径穿越和双重 models 目录
  const cleanName = fileName.replace(/^models[\\/]/, '').replace(/^.models[\\/]/, '')
  return path.join(baseDir, cleanName)
}

export async function scanLocalGgufModels(forceRefresh = false): Promise<ModelOption[]> {
  const now = Date.now()
  if (!forceRefresh && cachedModels && (now - lastScanTime < CACHE_TTL)) {
    return cachedModels
  }

  const modelsDir = getLocalModelsDir()
  
  if (!fs.existsSync(modelsDir)) {
    try {
      await fs.promises.mkdir(modelsDir, { recursive: true })
      return []
    } catch (e) {
      return []
    }
  }

  try {
    const absoluteFiles = await getGgufFiles(modelsDir)
    const models = absoluteFiles.map(fullPath => {
      const relativePath = path.relative(modelsDir, fullPath)
      return {
        id: `local-gguf::${relativePath.replace(/\\/g, '/')}`,
        name: path.basename(fullPath).replace(/\.gguf$/i, ''),
        provider: 'local-gguf'
      }
    })
    
    if (models.length === 0) {
      cachedModels = [{
        id: 'local-gguf::readme',
        name: '请放入 GGUF 文件',
        provider: 'local-gguf'
      }]
    } else {
      cachedModels = models
    }
    
    lastScanTime = now
    return cachedModels!
  } catch (e) {
    console.error('[Models] Failed to scan models directory:', e)
    return []
  }
}

