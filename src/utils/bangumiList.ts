/**
 * Bangumi List API 工具模块
 * 用于从 bangumi-list-v3 API 获取季度动漫数据
 * API 文档: https://github.com/wxt2005/bangumi-list-v3/blob/main/packages/server/API.md
 */

const API_BASE_URL = 'https://bgmlist.com/api/v1'
console.log('[BangumiList] Module loaded, API_BASE_URL:', API_BASE_URL)

/**
 * Bangumi List API 返回的动漫条目
 */
export interface BangumiListItem {
    id: string
    title: string
    titleTranslate?: {
        'zh-Hans'?: string[]
        'zh-Hant'?: string[]
        en?: string[]
    }
    type: string
    lang: string
    officialSite?: string
    begin?: string
    end?: string
    comment?: string
    broadcast?: string
    sites?: Array<{
        site: string
        id: string
        url?: string
        begin?: string
        broadcast?: string
    }>
}

/**
 * 获取可用的季度列表
 * @param startSeason 起始季度，格式如 2013q4，可选
 * @returns 季度列表，如 ['2024q4', '2024q3', ...]
 */
export async function fetchSeasons(startSeason?: string): Promise<string[]> {
    console.log('[BangumiList] fetchSeasons called, startSeason:', startSeason)

    const url = new URL(`${API_BASE_URL}/bangumi/season`)
    console.log('[BangumiList] Created URL object:', url.toString())

    if (startSeason) {
        console.log('[BangumiList] Adding startSeason param:', startSeason)
        url.searchParams.set('start', startSeason)
        console.log('[BangumiList] URL with params:', url.toString())
    }

    console.log('[BangumiList] About to fetch:', url.toString())
    const response = await fetch(url.toString())
    console.log('[BangumiList] Response received')
    console.log('[BangumiList] Response.ok:', response.ok)
    console.log('[BangumiList] Response.status:', response.status)
    console.log('[BangumiList] Response.statusText:', response.statusText)

    if (!response.ok) {
        console.error('[BangumiList] Response not ok, throwing error')
        throw new Error(`获取季度列表失败: ${response.status} ${response.statusText}`)
    }

    console.log('[BangumiList] Getting response text...')
    const text = await response.text()
    console.log('[BangumiList] Response text length:', text.length)
    console.log('[BangumiList] Response text (first 200 chars):', text.substring(0, 200))

    console.log('[BangumiList] Parsing JSON...')
    let data
    try {
        data = JSON.parse(text)
        console.log('[BangumiList] JSON parsed successfully')
    } catch (e) {
        console.error('[BangumiList] JSON parse failed:', e)
        console.error('[BangumiList] Raw text:', text)
        throw e
    }

    console.log('[BangumiList] data type:', typeof data)
    console.log('[BangumiList] data:', data)
    console.log('[BangumiList] data.items:', data.items)
    console.log('[BangumiList] data.items type:', typeof data.items)
    console.log('[BangumiList] data.items is array:', Array.isArray(data.items))

    const seasons = data.items || []
    console.log('[BangumiList] seasons:', seasons)
    console.log('[BangumiList] seasons.length:', seasons.length)

    console.log('[BangumiList] Sorting seasons...')
    const sorted = seasons.sort((a: string, b: string) => {
        const [yearA, qA] = a.split('q').map(Number)
        const [yearB, qB] = b.split('q').map(Number)
        if (yearA !== yearB) return yearB - yearA
        return qB - qA
    })
    console.log('[BangumiList] Sorted seasons:', sorted)

    return sorted
}

/**
 * 获取指定季度的动漫列表
 * @param season 季度，格式如 2024q1
 * @returns 动漫条目列表
 */
// Helper to fetch with fallback proxies
async function fetchWithFallback(targetUrl: string): Promise<any> {
    const proxies = [
        // Primary: codetabs (reliable, free)
        (u: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
        // Fallback: allorigins.win
        (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`
    ]

    let lastError: any

    for (const proxyGen of proxies) {
        const proxyUrl = proxyGen(targetUrl)
        try {
            console.log('[BangumiList] Attempting fetch via:', proxyUrl)
            const response = await fetch(proxyUrl)

            if (!response.ok) {
                console.warn(`[BangumiList] Proxy returned status ${response.status}`)
                throw new Error(`HTTP ${response.status}`)
            }

            const text = await response.text()
            try {
                const data = JSON.parse(text)
                return data
            } catch (jsonError) {
                console.warn('[BangumiList] JSON parse failed', jsonError)
                throw new Error('Invalid JSON response')
            }
        } catch (e) {
            console.warn('[BangumiList] Proxy attempt failed:', e)
            lastError = e
        }
    }

    throw lastError || new Error('All proxies failed')
}

/**
 * 获取指定季度的动漫列表
 * @param season 季度，格式如 2024q1
 * @returns 动漫条目列表
 */
export async function fetchSeasonAnime(season: string): Promise<BangumiListItem[]> {
    console.log('[BangumiList] fetchSeasonAnime called, season:', season)

    const url = `${API_BASE_URL}/bangumi/archive/${season}`
    console.log('[BangumiList] Constructed URL:', url)

    let data
    try {
        data = await fetchWithFallback(url)
    } catch (e: any) {
        console.error('[BangumiList] All fetch attempts failed:', e)
        throw new Error(`获取季度动漫失败: ${e.message}`)
    }

    console.log('[BangumiList] content fetched, processing data...')
    console.log('[BangumiList] data type:', typeof data)

    if (typeof data === 'object' && data !== null) {
        // 检查是否有 items 属性
        if ('items' in data && Array.isArray(data.items)) {
            console.log('[BangumiList] Returning data.items array')
            return data.items
        }
    }

    if (Array.isArray(data)) {
        console.log('[BangumiList] Returning data array')
        return data
    }

    // 如果不是数组，尝试从 items 属性获取
    if (data && Array.isArray(data.items)) {
        console.log('[BangumiList] Returning data.items array')
        return data.items
    }

    console.log('[BangumiList] Data is not an array and no items property, returning empty array')
    return []
}

/**
 * 格式化季度显示名称
 * @param season 季度代码，如 2024q1
 * @returns 显示名称，如 2024年1月
 */
export function formatSeasonName(season: string): string {
    console.log('[BangumiList] formatSeasonName called, season:', season)

    const match = season.match(/^(\d{4})q(\d)$/)
    console.log('[BangumiList] Regex match result:', match)

    if (!match) {
        console.log('[BangumiList] No match, returning original:', season)
        return season
    }

    const year = match[1]
    const quarter = parseInt(match[2])
    console.log('[BangumiList] year:', year, 'quarter:', quarter)

    const monthMap: Record<number, string> = {
        1: '1月',
        2: '4月',
        3: '7月',
        4: '10月'
    }

    const result = `${year}年${monthMap[quarter] || ''}`
    console.log('[BangumiList] Formatted result:', result)

    return result
}
