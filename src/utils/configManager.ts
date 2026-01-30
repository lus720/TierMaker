/**
 * 配置管理工具
 * 从 config.yaml 读取尺寸配置并注入为 CSS 变量
 */

import configYaml from '../../config.yaml?raw'
import { parse } from 'yaml'
import type { TierConfig } from '../types'

interface ConfigData {
    sizes: Record<string, any>
    settings: Record<string, any>
    tiers: TierConfig[]
}

const LOCAL_CONFIG_KEY = 'tier-maker-local-config-yaml'



let configCache: ConfigData | null = null

/**
 * 强制刷新配置缓存
 */
export function refreshConfig(): void {
    configCache = null
    parseConfig()
    initConfigStyles()
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
        const ALLOWED_SIZE_KEYS = ['image-width', 'image-height', 'image-aspect-ratio']

        // 过滤 config.sizes，只保留白名单内的 key
        const safeSizes: Record<string, any> = {}
        if (config.sizes) {
            Object.keys(config.sizes).forEach(key => {
                if (ALLOWED_SIZE_KEYS.includes(key)) {
                    safeSizes[key] = config.sizes![key]
                }
            })
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

    // 应用修补逻辑：如果有 aspect-ratio，自动计算相关高度
    if (mergedConfig.sizes && mergedConfig.sizes['image-aspect-ratio'] && mergedConfig.sizes['image-width']) {
        const ratio = mergedConfig.sizes['image-aspect-ratio']
        const width = mergedConfig.sizes['image-width']
        // 默认高度 133 是基于 width 100 和 ratio 0.75 计算的
        const oldHeight = mergedConfig.sizes['image-height'] || 133
        const newHeight = width / ratio

        // 更新 image-height
        mergedConfig.sizes['image-height'] = newHeight

        // 更新相关依赖高度 (item-height = image-height + name-height)
        const delta = newHeight - oldHeight

        // 只有当 delta 显著变化时才更新（避免浮点数误差）
        if (Math.abs(delta) > 0.1) {
            if (mergedConfig.sizes['item-height']) {
                mergedConfig.sizes['item-height'] += delta
            }
            if (mergedConfig.sizes['item-height-hide-name']) {
                mergedConfig.sizes['item-height-hide-name'] += delta
            }
        }
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
 * @returns 尺寸值（数字，单位为 px）
 */
export function getSize(key: string): number {
    const config = parseConfig()
    return config.sizes?.[key] ?? 0
}

/**
 * 获取所有尺寸配置
 */
export function getAllSizes(): Record<string, number> {
    const config = parseConfig()
    return config.sizes ?? {}
}

/**
 * 获取指定设置项
 */
export function getSetting<T = any>(key: string): T {
    const config = parseConfig()
    return config.settings?.[key]
}

/**
 * 获取所有设置项
 */
export function getAllSettings(): Record<string, any> {
    const config = parseConfig()
    return config.settings ?? {}
}

export function getDefaultTiers(): TierConfig[] {
    const config = parseConfig()
    return config.tiers ?? []
}

/**
 * 获取完整配置对象
 */
export function getConfig(): ConfigData {
    return parseConfig()
}
