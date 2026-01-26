import type { Tier, TierConfig } from '../types'

const STORAGE_KEY = 'tier-list-data'
const TIER_CONFIG_KEY = 'tier-config'
const BGM_TOKEN_KEY = 'bgm-access-token'
const TITLE_KEY = 'tier-list-title'
const TITLE_FONT_SIZE_KEY = 'tier-list-title-font-size'
const LAST_SEARCH_SOURCE_KEY = 'last-search-source'
const THEME_KEY = 'theme-preference'
const HIDE_ITEM_NAMES_KEY = 'hide-item-names'
const EXPORT_SCALE_KEY = 'export-scale'

import { getDefaultTiers, getSetting } from './configManager'

/**
 * 默认评分等级配置
 * 从 config.yaml 获取
 */
export const DEFAULT_TIER_CONFIGS = getDefaultTiers()

/**
 * 保存 Tier 数据到本地存储
 */
export function saveTierData(tiers: Tier[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tiers))
  } catch (error) {
    console.error('保存数据失败:', error)
  }
}

/**
 * 从本地存储加载 Tier 数据
 */
export function loadTierData(): Tier[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (data) {
      return JSON.parse(data)
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
 * 保存评分等级配置
 */
export function saveTierConfigs(configs: TierConfig[]): void {
  try {
    localStorage.setItem(TIER_CONFIG_KEY, JSON.stringify(configs))
  } catch (error) {
    console.error('保存配置失败:', error)
  }
}

/**
 * 加载评分等级配置
 */
export function loadTierConfigs(): TierConfig[] {
  try {
    const data = localStorage.getItem(TIER_CONFIG_KEY)
    if (data) {
      const configs: TierConfig[] = JSON.parse(data)
      // 确保每个配置都有 fontSize（向后兼容）
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
 * 返回 null 表示用户未设置自定义 Token
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
 * 返回默认标题 "Tier List" 如果未设置
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
 * 返回默认字体大小 32 如果未设置
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
 * 导出所有数据（包括 tiers、configs、title）
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

export function exportAllData(): ExportData {
  return {
    tiers: loadTierData(),
    tierConfigs: loadTierConfigs(),
    title: loadTitle(),
    titleFontSize: loadTitleFontSize(),
    exportDate: new Date().toISOString(),
    version: '1.0.0'
  }
}

/**
 * 导入数据
 */
export function importAllData(data: ExportData): {
  success: boolean
  error?: string
} {
  try {
    if (!data.tiers || !data.tierConfigs) {
      return { success: false, error: '数据格式不正确' }
    }

    saveTierData(data.tiers)
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
 * 返回默认值 'bangumi' 如果未设置
 */
export function loadLastSearchSource(): string {
  try {
    const source = localStorage.getItem(LAST_SEARCH_SOURCE_KEY)
    // 验证是否为有效的搜索源
    const validSources = ['bangumi', 'character', 'vndb']
    if (source && validSources.includes(source)) {
      return source
    }
  } catch (error) {
    console.error('加载搜索源失败:', error)
  }
  return 'bangumi' // 默认值
}

/**
 * 保存主题偏好设置
 * @param theme 'light' | 'dark' | 'auto' (auto 表示跟随系统)
 */
export function saveThemePreference(theme: 'light' | 'dark' | 'auto'): void {
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch (error) {
    console.error('保存主题设置失败:', error)
  }
}

/**
 * 加载主题偏好设置
 * 返回 'auto' 如果未设置（默认跟随系统）
 */
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

/**
 * 保存隐藏作品名设置
 */
export function saveHideItemNames(hide: boolean): void {
  try {
    localStorage.setItem(HIDE_ITEM_NAMES_KEY, JSON.stringify(hide))
  } catch (error) {
    console.error('保存隐藏作品名设置失败:', error)
  }
}

/**
 * 加载隐藏作品名设置
 */
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

/**
 * 保存导出倍率设置
 */
export function saveExportScale(scale: number): void {
  try {
    // 限制范围在 1-6 之间，只支持整数
    const validScale = Math.max(1, Math.min(6, Math.round(scale)))
    localStorage.setItem(EXPORT_SCALE_KEY, validScale.toString())
  } catch (error) {
    console.error('保存导出倍率设置失败:', error)
  }
}

/**
 * 加载导出倍率设置
 * 返回默认值 4 如果未设置
 */
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
 * 清空作品数据和标题（保留设置）
 */
export function clearItemsAndTitle(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(TITLE_KEY)
    localStorage.removeItem(TITLE_FONT_SIZE_KEY)
    localStorage.removeItem(LAST_SEARCH_SOURCE_KEY)
    // 注意：保留所有设置（主题、导出倍率、隐藏作品名、BGM Token、评分等级配置）
  } catch (error) {
    console.error('清空作品数据失败:', error)
    throw error
  }
}

/**
 * 重置所有设置（保留作品数据）
 */
export function resetSettings(): void {
  try {
    // 重置标题字体大小
    saveTitleFontSize(getSetting('title-font-size') || 32)

    // 重置主题
    saveThemePreference(getSetting('theme') || 'auto')

    // 重置隐藏作品名
    saveHideItemNames(getSetting('hide-item-names') ?? false)

    // 重置导出倍率
    saveExportScale(getSetting('export-scale') || 4)

    // 重置评分等级配置
    saveTierConfigs(DEFAULT_TIER_CONFIGS)

    // 注意：不重置标题，保留用户设置的标题
    // 注意：不清空 BGM_TOKEN_KEY，因为这是用户配置
    // 注意：不清空作品数据（STORAGE_KEY），只重置设置
  } catch (error) {
    console.error('重置设置失败:', error)
    throw error
  }
}

/**
 * 清空所有数据（包括作品、配置、标题等）
 * @deprecated 使用 clearItemsAndTitle() 代替，此函数保留用于向后兼容
 */
export function clearAllData(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(TIER_CONFIG_KEY)
    localStorage.removeItem(TITLE_KEY)
    localStorage.removeItem(TITLE_FONT_SIZE_KEY)
    localStorage.removeItem(LAST_SEARCH_SOURCE_KEY)
    // 注意：不清空 BGM_TOKEN_KEY 和 THEME_KEY，因为这是用户配置，不是数据
  } catch (error) {
    console.error('清空数据失败:', error)
    throw error
  }
}

