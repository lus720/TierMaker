import type { Tier, TierConfig, AnimeItem } from '../types'
import db from './db'
import { toRaw } from 'vue'
import { getDefaultTiers as _getDefaultTiers, getSetting } from './configManager'
import { i18n, getCurrentLocale } from '../i18n'

const STORAGE_KEY = 'tier-list-data'
const TIER_CONFIG_KEY = 'tier-config'
const BGM_TOKEN_KEY = 'bgm-access-token'
const TITLE_KEY = 'tier-list-title'
const TITLE_FONT_SIZE_KEY = 'tier-list-title-font-size'
const LAST_SEARCH_SOURCE_KEY = 'last-search-source'
const THEME_KEY = 'theme-preference'
const HIDE_ITEM_NAMES_KEY = 'hide-item-names'
const EXPORT_SCALE_KEY = 'export-scale'

/**
 * 默认评分等级配置
 */
/**
 * 默认评分等级配置 (Static fallback)
 */
export const DEFAULT_TIER_CONFIGS = _getDefaultTiers(getCurrentLocale())

export const getDefaultTiers = _getDefaultTiers

/**
 * Helper: Convert DataURL to Blob
 */
async function dataURLToBlob(dataURL: string): Promise<Blob> {
  const res = await fetch(dataURL)
  return await res.blob()
}

/**
 * Helper: Generate UUID
 */
export function generateUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

/**
 * Migrate data from LocalStorage to IndexedDB
 */
export async function migrateFromLocalStorage(): Promise<void> {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return

  try {
    console.log('[Migration] Starting migration from LocalStorage to IndexedDB...')
    const tiers: Tier[] = JSON.parse(raw)
    let convertedCount = 0

    for (const tier of tiers) {
      for (const row of tier.rows) {
        for (const item of row.items) {
          // Convert 'image' if it's a base64 string
          if (typeof item.image === 'string' && item.image.startsWith('data:')) {
            item.image = await dataURLToBlob(item.image)
            convertedCount++
          }
          // Convert 'originalImage' if it's a base64 string
          if (typeof item.originalImage === 'string' && item.originalImage.startsWith('data:')) {
            item.originalImage = await dataURLToBlob(item.originalImage)
          }
        }
      }
    }

    await db.setItem(STORAGE_KEY, tiers)
    localStorage.removeItem(STORAGE_KEY)
    console.log(`[Migration] Success! Converted ${convertedCount} images.`)
  } catch (error) {
    console.error('[Migration] Failed:', error)
  }
}

/**
 * 保存 Tier 数据到 IndexedDB (Async)
 * Saves the _blob data as 'image' if present, ensuring we persist binary data not blob URLs
 */
export async function saveTierData(tiers: Tier[]): Promise<void> {
  try {
    const dataToSave = tiers.map(t => {
      const rawTier = toRaw(t)
      return {
        ...rawTier,
        rows: rawTier.rows.map(r => {
          const rawRow = toRaw(r)
          return {
            ...rawRow,
            items: rawRow.items.map(i => {
              const rawItem = toRaw(i)
              // Clone item to avoid mutating runtime state
              const saveItem = { ...rawItem }

              // If we have a cached blob, save ONLY that as the image source
              if (saveItem._blob && toRaw(saveItem._blob) instanceof Blob) {
                saveItem.image = toRaw(saveItem._blob)
              }

              // Remove runtime-only field before saving (optional, but cleaner)
              if ('_blob' in saveItem) {
                delete saveItem._blob
              }

              // Ensure UUID exists
              if (!saveItem.uuid) {
                saveItem.uuid = generateUuid()
              }

              return saveItem
            })
          }
        })
      }
    })

    // Verify Blob count (Optional debug, can be removed or kept as low-noise log)
    // console.log(`[Storage] Saving ${dataToSave.length} tiers.`)

    await db.setItem(STORAGE_KEY, dataToSave)
  } catch (error) {
    console.error('保存数据失败:', error)
  }
}

/**
 * 从 IndexedDB 加载 Tier 数据 (Async)
 */
export async function loadTierData(): Promise<Tier[]> {
  try {
    // Check for migration first
    if (localStorage.getItem(STORAGE_KEY)) {
      await migrateFromLocalStorage()
    }

    const data = await db.getItem<Tier[]>(STORAGE_KEY)

    if (data) {
      // Auto-repair: Check for lingering Base64 strings and convert them to Blobs
      // This handles cases where data was saved as strings (e.g. before migration or via buggy edit modal)
      let needsSave = false
      for (const tier of data) {
        for (const row of tier.rows) {
          for (const item of row.items) {
            if (typeof item.image === 'string' && item.image.startsWith('data:')) {
              try {
                item.image = await dataURLToBlob(item.image)
                needsSave = true
              } catch (e) {
                console.error('Failed to convert image blob', e)
              }
            }
            if (typeof item.originalImage === 'string' && item.originalImage.startsWith('data:')) {
              try {
                item.originalImage = await dataURLToBlob(item.originalImage)
                needsSave = true
              } catch (e) {
                console.error('Failed to convert originalImage blob', e)
              }
            }

            // Auto-repair: Inject UUID if missing
            if (!item.uuid) {
              item.uuid = generateUuid()
              needsSave = true
            }
          }
        }
      }

      if (needsSave) {
        console.log('[Storage] Auto-repaired Base64 data to Blobs')
        await db.setItem(STORAGE_KEY, data)
      }

      return data
    }
  } catch (error) {
    console.error('加载数据失败:', error)
  }

  // 返回默认数据
  return DEFAULT_TIER_CONFIGS.map(config => ({
    id: config.id,
    rows: [{
      id: `${config.id}-row-0`,
      items: [],
    }],
  }))
}

/**
 * 保存评分等级配置 (Keep LocalStorage)
 */
export function saveTierConfigs(configs: TierConfig[]): void {
  try {
    localStorage.setItem(TIER_CONFIG_KEY, JSON.stringify(configs))
  } catch (error) {
    console.error('保存配置失败:', error)
  }
}

/**
 * 加载评分等级配置 (Keep LocalStorage)
 */
export function loadTierConfigs(): TierConfig[] {
  try {
    const data = localStorage.getItem(TIER_CONFIG_KEY)
    if (data) {
      const configs: TierConfig[] = JSON.parse(data)
      return configs.map(config => ({
        ...config,
        fontSize: config.fontSize ?? 32
      }))
    }
  } catch (error) {
    console.error('加载配置失败:', error)
  }
  return DEFAULT_TIER_CONFIGS
}

/**
 * 保存用户自定义的 Bangumi Access Token
 */
export function saveBgmToken(token: string | null): void {
  try {
    if (token && token.trim()) {
      localStorage.setItem(BGM_TOKEN_KEY, token.trim())
    } else {
      localStorage.removeItem(BGM_TOKEN_KEY)
    }
  } catch (error) {
    console.error('保存 Token 失败:', error)
  }
}

/**
 * 加载用户自定义的 Bangumi Access Token
 */
export function loadBgmToken(): string | null {
  try {
    return localStorage.getItem(BGM_TOKEN_KEY)
  } catch (error) {
    console.error('加载 Token 失败:', error)
    return null
  }
}

/**
 * 保存标题
 */
export function saveTitle(title: string): void {
  try {
    if (title && title.trim()) {
      localStorage.setItem(TITLE_KEY, title.trim())
    } else {
      localStorage.removeItem(TITLE_KEY)
    }
  } catch (error) {
    console.error('保存标题失败:', error)
  }
}

/**
 * 加载标题
 */
export function loadTitle(): string {
  try {
    const title = localStorage.getItem(TITLE_KEY)
    return title || 'Tier List'
  } catch (error) {
    console.error('加载标题失败:', error)
    return 'Tier List'
  }
}

/**
 * 保存标题字体大小
 */
export function saveTitleFontSize(fontSize: number): void {
  try {
    localStorage.setItem(TITLE_FONT_SIZE_KEY, fontSize.toString())
  } catch (error) {
    console.error('保存标题字体大小失败:', error)
  }
}

/**
 * 加载标题字体大小
 */
export function loadTitleFontSize(): number {
  try {
    const fontSize = localStorage.getItem(TITLE_FONT_SIZE_KEY)
    if (fontSize) {
      const parsed = parseInt(fontSize, 10)
      if (!isNaN(parsed) && parsed >= 12 && parsed <= 120) {
        return parsed
      }
    }
  } catch (error) {
    console.error('加载标题字体大小失败:', error)
  }
  return getSetting('title-font-size') || 32
}

/**
 * Export interface
 */
export interface ExportData {
  tiers: Tier[]
  tierConfigs: TierConfig[]
  title: string
  exportDate: string
  version: string
  itemsPerRow?: number
  titleFontSize?: number
}

/**
 * Blob to Base64 helper
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      resolve(reader.result as string)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * 导出所有数据 (Async)
 * 需要将 Blob 转换回 Base64 以便生成 JSON 文件
 */
export async function exportAllData(): Promise<ExportData> {
  const tiers = await loadTierData()

  // Clone and convert Blobs to Base64
  const tiersToExport = []
  for (const tier of tiers) {
    const newTier = { ...tier, rows: [] as any[] }
    for (const row of tier.rows) {
      const newRow = { ...row, items: [] as any[] }
      for (const item of row.items) {
        const newItem = { ...item }
        if (newItem.image instanceof Blob) {
          newItem.image = await blobToBase64(newItem.image)
        }
        if (newItem.originalImage instanceof Blob) {
          newItem.originalImage = await blobToBase64(newItem.originalImage)
        }
        // Clean up internal url if exists (don't export blob urls)
        if (newItem.url && newItem.url.startsWith('blob:')) {
          delete newItem.url
        }
        newRow.items.push(newItem)
      }
      newTier.rows.push(newRow)
    }
    tiersToExport.push(newTier)
  }

  return {
    tiers: tiersToExport,
    tierConfigs: loadTierConfigs(),
    title: loadTitle(),
    titleFontSize: loadTitleFontSize(),
    exportDate: new Date().toISOString(),
    version: '1.0.0'
  }
}

/**
 * 导入数据 (Async)
 * Base64 -> Blob
 */
export async function importAllData(data: ExportData): Promise<{
  success: boolean
  error?: string
}> {
  try {
    if (!data.tiers || !data.tierConfigs) {
      return { success: false, error: '数据格式不正确' }
    }

    // Convert Base64 back to Blobs
    for (const tier of data.tiers) {
      for (const row of tier.rows) {
        for (const item of row.items) {
          if (typeof item.image === 'string' && item.image.startsWith('data:')) {
            item.image = await dataURLToBlob(item.image)
          }
          if (typeof item.originalImage === 'string' && item.originalImage.startsWith('data:')) {
            item.originalImage = await dataURLToBlob(item.originalImage)
          }

          // Inject UUID
          if (!item.uuid) {
            item.uuid = generateUuid()
          }
        }
      }
    }

    await saveTierData(data.tiers)
    saveTierConfigs(data.tierConfigs)
    if (data.title) {
      saveTitle(data.title)
    }
    if (data.titleFontSize !== undefined) {
      saveTitleFontSize(data.titleFontSize)
    }

    return { success: true }
  } catch (error) {
    console.error('导入数据失败:', error)
    return { success: false, error: error instanceof Error ? error.message : '未知错误' }
  }
}

/**
 * 保存上次使用的搜索源
 */
export function saveLastSearchSource(source: string): void {
  try {
    if (source && source.trim()) {
      localStorage.setItem(LAST_SEARCH_SOURCE_KEY, source.trim())
    }
  } catch (error) {
    console.error('保存搜索源失败:', error)
  }
}

/**
 * 加载上次使用的搜索源
 */
export function loadLastSearchSource(): string {
  try {
    const source = localStorage.getItem(LAST_SEARCH_SOURCE_KEY)
    const validSources = ['bangumi', 'character', 'vndb', 'local']
    if (source && validSources.includes(source)) {
      return source
    }
  } catch (error) {
    console.error('加载搜索源失败:', error)
  }
  return 'bangumi'
}

export function saveThemePreference(theme: 'light' | 'dark' | 'auto'): void {
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch (error) {
    console.error('保存主题设置失败:', error)
  }
}

export function loadThemePreference(): 'light' | 'dark' | 'auto' {
  try {
    const theme = localStorage.getItem(THEME_KEY)
    if (theme === 'light' || theme === 'dark' || theme === 'auto') {
      return theme
    }
  } catch (error) {
    console.error('加载主题设置失败:', error)
  }
  return getSetting('theme') || 'auto'
}

export function saveHideItemNames(hide: boolean): void {
  try {
    localStorage.setItem(HIDE_ITEM_NAMES_KEY, JSON.stringify(hide))
  } catch (error) {
    console.error('保存隐藏作品名设置失败:', error)
  }
}

export function loadHideItemNames(): boolean {
  try {
    const saved = localStorage.getItem(HIDE_ITEM_NAMES_KEY)
    if (saved !== null) {
      return JSON.parse(saved)
    }
  } catch (error) {
    console.error('加载隐藏作品名设置失败:', error)
  }
  return getSetting('hide-item-names') ?? false
}

export function saveExportScale(scale: number): void {
  try {
    const validScale = Math.max(1, Math.min(6, Math.round(scale)))
    localStorage.setItem(EXPORT_SCALE_KEY, validScale.toString())
  } catch (error) {
    console.error('保存导出倍率设置失败:', error)
  }
}

export function loadExportScale(): number {
  try {
    const saved = localStorage.getItem(EXPORT_SCALE_KEY)
    if (saved) {
      const parsed = parseInt(saved, 10)
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 6) {
        return parsed
      }
    }
  } catch (error) {
    console.error('加载导出倍率设置失败:', error)
  }
  return getSetting('export-scale') || 4
}

/**
 * 清空作品数据和标题 (Async)
 */
export async function clearItemsAndTitle(): Promise<void> {
  try {
    await db.removeItem(STORAGE_KEY)
    localStorage.removeItem(STORAGE_KEY) // Ensure migration source is also gone
    localStorage.removeItem(TITLE_KEY)
    localStorage.removeItem(TITLE_FONT_SIZE_KEY)
    localStorage.removeItem(LAST_SEARCH_SOURCE_KEY)
  } catch (error) {
    console.error('清空作品数据失败:', error)
    throw error
  }
}

export function resetSettings(): void {
  try {
    saveTitleFontSize(getSetting('title-font-size') || 32)
    saveThemePreference(getSetting('theme') || 'auto')
    saveHideItemNames(getSetting('hide-item-names') ?? false)
    saveExportScale(getSetting('export-scale') || 4)
    saveTierConfigs(DEFAULT_TIER_CONFIGS)
  } catch (error) {
    console.error('重置设置失败:', error)
    throw error
  }
}

/**
 * 切换语言时的等级处理
 * 关键：只改 label，不改 id，防止作品数据关联断裂
 * 如果 label 是默认的（例如从英文切中文，label 是 S），则自动转为中文默认（夯）
 * 如果 label 是自定义的，则保持不变
 */
export function handleLanguageChange(newLocale: 'zh' | 'en') {
  const configs = loadTierConfigs()

  const zhDefaults = ['夯', '顶级', '人上人', 'NPC', '拉完了']
  const enDefaults = ['S', 'A', 'B', 'C', 'D']

  const sourceDefaults = newLocale === 'zh' ? enDefaults : zhDefaults
  const targetDefaults = newLocale === 'zh' ? zhDefaults : enDefaults

  configs.forEach(config => {
    // 检查当前 label 是否在源语言默认列表中
    const index = sourceDefaults.indexOf(config.label)
    if (index !== -1 && index < targetDefaults.length) {
      // 如果是默认 label，则更新为目标语言对应的默认 label
      config.label = targetDefaults[index]
    }
  })

  saveTierConfigs(configs)

  localStorage.setItem('user-language', newLocale)
  i18n.global.locale.value = newLocale
}
