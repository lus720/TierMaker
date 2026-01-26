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
