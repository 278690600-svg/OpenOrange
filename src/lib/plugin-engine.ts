import prisma from '@/lib/db'
import { MARKETPLACE_PLUGINS, MarketplacePlugin } from '@/lib/plugins-market-data'
import JSZip from 'jszip'

export interface PluginManifest {
  id: string
  name: string
  version: string
  description?: string
  author?: string
  icon?: string
  category?: string
  homepage?: string
  repository?: string
  permissions?: string[]
  settingsSchema?: Record<string, any>
  settingsFields?: any[]
  defaultConfig?: Record<string, any>
  contributes?: {
    tools?: Array<{ name: string; description: string }>
    workflowNodes?: Array<{ type: string; label: string; description: string }>
    sidebar?: Array<{ id: string; title: string; route: string; icon: string }>
    templates?: Array<{ name: string; type: string }>
  }
  readme?: string
}

export class PluginEngine {
  /**
   * Get all installed plugins from database
   */
  static async getInstalledPlugins() {
    try {
      const plugins = await (prisma as any).plugin.findMany({
        orderBy: { createdAt: 'desc' }
      })
      return plugins.map((p: any) => {
        let manifest: PluginManifest = { id: p.pluginId, name: p.name, version: p.version }
        let config: Record<string, any> = {}
        try { manifest = JSON.parse(p.manifest) } catch {}
        try { config = JSON.parse(p.config) } catch {}
        return {
          ...p,
          manifest,
          config
        }
      })
    } catch (e) {
      console.error('[PluginEngine] getInstalledPlugins error:', e)
      return []
    }
  }

  /**
   * Get a single installed plugin by ID or pluginId
   */
  static async getPlugin(id: string) {
    try {
      const plugin = await (prisma as any).plugin.findFirst({
        where: {
          OR: [{ id }, { pluginId: id }]
        }
      })
      if (!plugin) return null
      let manifest: PluginManifest = { id: plugin.pluginId, name: plugin.name, version: plugin.version }
      let config: Record<string, any> = {}
      try { manifest = JSON.parse(plugin.manifest) } catch {}
      try { config = JSON.parse(plugin.config) } catch {}
      return { ...plugin, manifest, config }
    } catch (e) {
      console.error('[PluginEngine] getPlugin error:', e)
      return null
    }
  }

  /**
   * Install a plugin from the official curated marketplace
   */
  static async installFromMarket(marketPluginId: string) {
    const marketItem = MARKETPLACE_PLUGINS.find(p => p.id === marketPluginId)
    if (!marketItem) {
      throw new Error(`Plugin '${marketPluginId}' not found in marketplace catalogue`)
    }

    const existing = await (prisma as any).plugin.findUnique({
      where: { pluginId: marketItem.id }
    })

    const manifestData: PluginManifest = {
      id: marketItem.id,
      name: marketItem.name,
      version: marketItem.version,
      description: marketItem.description,
      author: marketItem.author,
      icon: marketItem.icon,
      category: marketItem.category,
      homepage: marketItem.homepage,
      repository: marketItem.repository,
      permissions: marketItem.permissions,
      settingsFields: marketItem.settingsFields,
      defaultConfig: marketItem.defaultConfig,
      contributes: marketItem.contributes,
      readme: marketItem.readme
    }

    if (existing) {
      // Update existing plugin record
      const updated = await (prisma as any).plugin.update({
        where: { pluginId: marketItem.id },
        data: {
          name: marketItem.name,
          version: marketItem.version,
          description: marketItem.description,
          author: marketItem.author,
          icon: marketItem.icon,
          category: marketItem.category,
          homepage: marketItem.homepage || '',
          repository: marketItem.repository || '',
          manifest: JSON.stringify(manifestData),
          installSource: 'market'
        }
      })
      return updated
    } else {
      // Create new plugin record
      const created = await (prisma as any).plugin.create({
        data: {
          pluginId: marketItem.id,
          name: marketItem.name,
          version: marketItem.version,
          description: marketItem.description,
          author: marketItem.author,
          icon: marketItem.icon,
          category: marketItem.category,
          homepage: marketItem.homepage || '',
          repository: marketItem.repository || '',
          manifest: JSON.stringify(manifestData),
          config: JSON.stringify(marketItem.defaultConfig || {}),
          enabled: true,
          isSystem: false,
          installSource: 'market'
        }
      })
      return created
    }
  }

  /**
   * Install a plugin from a remote URL (Git repository or raw JSON manifest URL)
   */
  static async installFromUrl(url: string) {
    let manifestUrl = url.trim()
    
    // Normalize GitHub repo URLs to raw plugin.json
    if (manifestUrl.includes('github.com') && !manifestUrl.includes('raw.githubusercontent.com') && !manifestUrl.endsWith('.json')) {
      // e.g. https://github.com/owner/repo -> https://raw.githubusercontent.com/owner/repo/main/plugin.json
      const parts = manifestUrl.replace('https://github.com/', '').split('/')
      if (parts.length >= 2) {
        manifestUrl = `https://raw.githubusercontent.com/${parts[0]}/${parts[1]}/main/plugin.json`
      }
    }

    const res = await fetch(manifestUrl, { signal: AbortSignal.timeout(12000) })
    if (!res.ok) {
      throw new Error(`Failed to fetch plugin manifest from URL: ${res.statusText}`)
    }

    const manifestData = await res.json()
    return await this.installFromManifest(manifestData, 'git_url')
  }

  /**
   * Install from an unpacked manifest object
   */
  static async installFromManifest(manifest: PluginManifest, source: string = 'raw_url') {
    if (!manifest.id || !manifest.name) {
      throw new Error('Invalid plugin manifest: missing required "id" or "name" fields')
    }

    const pluginId = String(manifest.id).toLowerCase().replace(/[^a-z0-9_-]/g, '-')
    const existing = await (prisma as any).plugin.findUnique({
      where: { pluginId }
    })

    const dataToSave = {
      pluginId,
      name: manifest.name,
      version: manifest.version || '1.0.0',
      description: manifest.description || '',
      author: manifest.author || 'Third Party',
      icon: manifest.icon || 'Package',
      category: manifest.category || 'productivity',
      homepage: manifest.homepage || '',
      repository: manifest.repository || '',
      manifest: JSON.stringify(manifest),
      installSource: source
    }

    if (existing) {
      return await (prisma as any).plugin.update({
        where: { pluginId },
        data: dataToSave
      })
    } else {
      return await (prisma as any).plugin.create({
        data: {
          ...dataToSave,
          config: JSON.stringify(manifest.defaultConfig || {}),
          enabled: true,
          isSystem: false
        }
      })
    }
  }

  /**
   * Install plugin from an uploaded ZIP buffer
   */
  static async installFromZip(buffer: ArrayBuffer | Buffer) {
    const zip = await JSZip.loadAsync(buffer)
    
    // Look for plugin.json or manifest.json in root or first subfolder
    let manifestFile = zip.file('plugin.json') || zip.file('manifest.json')
    
    if (!manifestFile) {
      // Look one directory deep
      const files = Object.keys(zip.files)
      const found = files.find(f => f.endsWith('plugin.json') || f.endsWith('manifest.json'))
      if (found) {
        manifestFile = zip.file(found)
      }
    }

    if (!manifestFile) {
      throw new Error('Invalid plugin archive: no "plugin.json" found in ZIP root')
    }

    const manifestContent = await manifestFile.async('string')
    let manifest: PluginManifest
    try {
      manifest = JSON.parse(manifestContent)
    } catch {
      throw new Error('Failed to parse "plugin.json": invalid JSON syntax')
    }

    // Also check for optional README.md inside the zip
    const readmeFile = zip.file('README.md') || zip.file('readme.md')
    if (readmeFile && !manifest.readme) {
      try {
        manifest.readme = await readmeFile.async('string')
      } catch {}
    }

    return await this.installFromManifest(manifest, 'local_zip')
  }

  /**
   * Toggle enabled/disabled state of an installed plugin
   */
  static async togglePlugin(id: string, enabled?: boolean) {
    const plugin = await (prisma as any).plugin.findFirst({
      where: { OR: [{ id }, { pluginId: id }] }
    })
    if (!plugin) throw new Error('Plugin not found')

    const newEnabled = enabled !== undefined ? enabled : !plugin.enabled
    return await (prisma as any).plugin.update({
      where: { id: plugin.id },
      data: { enabled: newEnabled }
    })
  }

  /**
   * Save user configuration for a plugin
   */
  static async savePluginConfig(id: string, config: Record<string, any>) {
    const plugin = await (prisma as any).plugin.findFirst({
      where: { OR: [{ id }, { pluginId: id }] }
    })
    if (!plugin) throw new Error('Plugin not found')

    return await (prisma as any).plugin.update({
      where: { id: plugin.id },
      data: { config: JSON.stringify(config) }
    })
  }

  /**
   * Uninstall a plugin
   */
  static async uninstallPlugin(id: string) {
    const plugin = await (prisma as any).plugin.findFirst({
      where: { OR: [{ id }, { pluginId: id }] }
    })
    if (!plugin) throw new Error('Plugin not found')

    return await (prisma as any).plugin.delete({
      where: { id: plugin.id }
    })
  }
}
