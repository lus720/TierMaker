/**
 * 配置管理工具
 * 从 config.yaml 读取尺寸配置并注入为 CSS 变量
 */

import configYaml from '../../config.yaml?raw'
import { parse } from 'yaml'
import { ref } from 'vue'
import type { TierConfig } from '../types'

interface ConfigData {
    sizes: Record<string, any>
    settings: Record<string, any>
    tiers: TierConfig[]
}

const LOCAL_CONFIG_KEY = 'tier-maker-local-config-yaml'

// Reactive signal for config changes
const configVersion = ref(0)

let configCache: ConfigData | null = null

/**
 * 强制刷新配置缓存
 */
export function refreshConfig(): void {
    configCache = null
    parseConfig()
    initConfigStyles()
    configVersion.value++ // Trigger reactivity
}

/**
 * 清除本地配置覆盖
 */
export function clearLocalConfig(): void {
    localStorage.removeItem(LOCAL_CONFIG_KEY)
    refreshConfig()
}

/**
 * 保存本地配置覆盖
 */
export function saveLocalConfig(config: Partial<ConfigData>): void {
    try {
        // 获取现有的本地配置
        let currentLocal: Partial<ConfigData> = {}
        const localYaml = localStorage.getItem(LOCAL_CONFIG_KEY)
        if (localYaml) {
            currentLocal = parse(localYaml) as Partial<ConfigData> || {}
        }

        // 允许保存的字段白名单 (只允许用户在 UI 上调整的参数)
        // 允许保存的字段白名单 (只允许用户在 UI 上调整的参数)
        const ALLOWED_SIZE_KEYS = ['image-width', 'image-height', 'image-aspect-ratio', 'image-aspect-ratio-text']

        // 过滤 config.sizes，只保留白名单内的 key
        const safeSizes: Record<string, any> = {}
        if (config.sizes) {
            Object.keys(config.sizes).forEach(key => {
                if (ALLOWED_SIZE_KEYS.includes(key)) {
                    safeSizes[key] = config.sizes![key]
                }
            })
            console.log('[ConfigManager] saveLocalConfig - safeSizes:', safeSizes)
        }

        // 深度合并
        const newConfig = {
            ...currentLocal,
            ...config,
            sizes: { ...(currentLocal.sizes || {}), ...safeSizes },
            settings: { ...(currentLocal.settings || {}), ...(config.settings || {}) }
        }

        // 转换为 YAML 字符串 (简化处理为 JSON)
        localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(newConfig))

        // 刷新缓存和样式
        refreshConfig()
    } catch (e) {
        console.error('[ConfigManager] 保存本地配置失败', e)
    }
}

/**
 * 更新尺寸配置
 */
export function updateSizes(sizes: Record<string, any>): void {
    saveLocalConfig({ sizes })
}

/**
 * 解析配置文件
 */
// 解析配置文件并应用智能计算逻辑
function parseConfig(): ConfigData {
    if (configCache) return configCache

    // 解析用户配置
    const userConfig = parse(configYaml) as ConfigData || { sizes: {}, settings: {}, tiers: [] }

    // 尝试从 LocalStorage 加载本地覆盖配置
    let localConfig: Partial<ConfigData> = {}
    try {
        const localYaml = localStorage.getItem(LOCAL_CONFIG_KEY)
        if (localYaml) {
            localConfig = parse(localYaml) as Partial<ConfigData> || {}
            console.log('[ConfigManager] 已加载本地配置覆盖')
        }
    } catch (e) {
        console.error('[ConfigManager] 本地配置解析失败', e)
    }

    // 合并配置 (Local > User)
    const mergedConfig: ConfigData = {
        sizes: { ...(userConfig.sizes || {}), ...(localConfig.sizes || {}) },
        settings: { ...(userConfig.settings || {}), ...(localConfig.settings || {}) },
        tiers: localConfig.tiers || userConfig.tiers || []
    }

    // 紧凑模式：强制覆盖间距为 0 (不保存到 storage/config，仅运行时生效)
    if (mergedConfig.settings?.['compact-mode']) {
        mergedConfig.sizes['row-padding'] = 0
        mergedConfig.sizes['row-gap'] = 0
        mergedConfig.sizes['container-padding-top'] = 0
        mergedConfig.sizes['container-padding-bottom'] = 0
    }

    // Dynamic Evaluation: Recalculate derived sizes from Source of Truth
    // image-width, image-aspect-ratio, item-name-height -> All other sizes
    if (mergedConfig.sizes && mergedConfig.sizes['image-aspect-ratio'] && mergedConfig.sizes['image-width']) {
        const ratio = Number(mergedConfig.sizes['image-aspect-ratio'])
        const width = Number(mergedConfig.sizes['image-width'])
        const nameHeight = Number(mergedConfig.sizes['item-name-height'] || 40)

        // 1. Calculate Image Height strictly from formula
        // Even if config.yaml has image-height, we overwrite it to ensure ratio consistency
        const newImageHeight = width / ratio
        mergedConfig.sizes['image-height'] = newImageHeight

        // 2. Sync item-width (Always same as image-width)
        mergedConfig.sizes['item-width'] = width

        // 3. Sync item-height-hide-name (Always same as image-height)
        mergedConfig.sizes['item-height-hide-name'] = newImageHeight

        // 4. Calculate item-height (Image + Name)
        mergedConfig.sizes['item-height'] = newImageHeight + nameHeight

        console.log('[ConfigManager] Dynamically calculated sizes:', {
            width, ratio, newImageHeight,
            itemWidth: mergedConfig.sizes['item-width'],
            itemHeight: mergedConfig.sizes['item-height']
        })
    }

    configCache = mergedConfig
    return configCache
}

/**
 * 初始化配置样式
 * 将 YAML 配置中的尺寸值注入为 CSS 变量
 */
export function initConfigStyles(): void {
    const config = parseConfig()
    const root = document.documentElement

    if (!config.sizes) {
        console.warn('[ConfigManager] 配置文件中没有找到 sizes 字段')
        return
    }

    // 将配置转换为 CSS 变量
    Object.entries(config.sizes).forEach(([key, value]) => {
        // 对于 aspect-ratio 等不需要单位的属性，或者值为字符串（如 auto）的情况，不加 px
        if (
            key.includes('aspect-ratio') ||
            key.includes('scale') ||
            typeof value === 'string'
        ) {
            root.style.setProperty(`--size-${key}`, `${value}`)
        } else {
            root.style.setProperty(`--size-${key}`, `${value}px`)
        }
    })

    console.log('[ConfigManager] 已注入', Object.keys(config.sizes).length, '个尺寸变量')
}

/**
 * 获取指定的尺寸值
 * @param key 尺寸键名（如 'image-width'）
 * @returns 尺寸值
 */
export function getSize(key: string): number | string {
    // Register dependency for reactivity
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    configVersion.value

    const config = parseConfig()
    return config.sizes?.[key] ?? 0
}

/**
 * 获取所有尺寸配置
 */
export function getAllSizes(): Record<string, number> {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    configVersion.value
    const config = parseConfig()
    return config.sizes ?? {}
}

/**
 * 获取指定设置项
 */
export function getSetting<T = any>(key: string): T {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    configVersion.value
    const config = parseConfig()
    return config.settings?.[key]
}

/**
 * 获取所有设置项
 */
export function getAllSettings(): Record<string, any> {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    configVersion.value
    const config = parseConfig()
    return config.settings ?? {}
}

export function getDefaultTiers(locale: string = 'zh'): TierConfig[] {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    configVersion.value
    const config = parseConfig()
    const tiers = config.tiers ? JSON.parse(JSON.stringify(config.tiers)) : []

    // 如果是英文环境，使用英文默认标签 (S, A, B, C, D)
    // ID 保持不变 (t0-t4)
    if (locale === 'en' && tiers.length === 5) {
        const enLabels = ['S', 'A', 'B', 'C', 'D']
        tiers.forEach((t: TierConfig, i: number) => {
            t.label = enLabels[i]
        })
    }

    return tiers
}

/**
 * 获取完整配置对象
 */
export function getConfig(): ConfigData {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    configVersion.value
    return parseConfig()
}
