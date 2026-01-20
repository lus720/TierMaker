import type { BgmSearchResult, BgmCharacterSearchResult } from '../types'
import { loadBgmToken } from './storage'

const BANGUMI_API_BASE = 'https://api.bgm.tv'
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

// 默认 Bangumi Access Token，用于访问 NSFW 内容
// 获取方式：https://next.bgm.tv/demo/access-token
const DEFAULT_BGM_ACCESS_TOKEN = 'RA4MaLxFiHP5iyRGqLZsV2RCY44yAvJBgTgyXugN'

/**
 * 获取当前使用的 Access Token
 * 优先使用用户自定义的 Token，如果没有则使用默认 Token
 */
function getAccessToken(): string | null {
  // 优先使用用户自定义的 Token
  const userToken = loadBgmToken()
  if (userToken && userToken.trim()) {
    return userToken.trim()
  }
  // 如果没有用户自定义 Token，使用默认 Token
  return DEFAULT_BGM_ACCESS_TOKEN || null
}

export class BangumiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BangumiError'
  }
}

/**
 * 获取请求头
 * 如果配置了 Access Token，则添加 Authorization 头以支持 NSFW 内容
 */
function getRequestHeaders(includeContentType = true): HeadersInit {
  const headers: Record<string, string> = {
    'accept': 'application/json',
    'User-Agent': USER_AGENT,
  }

  if (includeContentType) {
    headers['Content-Type'] = 'application/json'
  }

  // 获取 Access Token（优先用户自定义，否则使用默认）
  const token = getAccessToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  return headers
}

/**
 * 搜索 Bangumi 动画
 */
/**
 * 带超时的 fetch 请求
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout = 10000 // 10 秒超时
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => {
    controller.abort()
  }, timeout)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    return response
  } catch (error: any) {
    clearTimeout(timeoutId)
    console.error('fetchWithTimeout: 请求失败', error.name, error.message)
    if (error.name === 'AbortError') {
      throw new BangumiError(`请求超时（${timeout}ms），请检查网络连接`)
    }
    throw error
  }
}

export async function searchBangumiAnime(
  keyword: string,
  offset = 0,
  limit = 20
): Promise<BgmSearchResult[]> {
  if (!keyword.trim()) {
    return []
  }

  try {
    const url = `${BANGUMI_API_BASE}/v0/search/subjects?limit=${limit}&offset=${offset}`
    const requestBody = {
      keyword,
      filter: { type: [1, 2, 3, 4, 5] }, // 1书籍; 2动画; 3音乐;4游戏;6三次元
    }


    const headers = getRequestHeaders()

    const response = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      },
      10000 // 10 秒超时
    )

    if (!response.ok) {
      // 尝试读取错误响应体
      let errorMessage = `请求失败: ${response.status} ${response.statusText}`
      try {
        const errorBody = await response.text()
        console.error('Bangumi API 错误响应:', errorBody)
        if (errorBody) {
          try {
            const errorJson = JSON.parse(errorBody)
            errorMessage = errorJson.error?.message || errorJson.message || errorMessage
          } catch {
            errorMessage = `${errorMessage}\n响应内容: ${errorBody.substring(0, 200)}`
          }
        }
      } catch (e) {
        // 忽略读取错误响应体的错误
      }

      if (response.status === 401) {
        throw new BangumiError('API 认证失败，请检查 Access Token 配置')
      }
      throw new BangumiError(errorMessage)
    }

    const result = await response.json()

    if (!result.data) {
      return []
    }

    return (result.data || []) as BgmSearchResult[]
  } catch (error: any) {
    console.error('Bangumi 搜索错误:', error)

    if (error instanceof BangumiError) {
      throw error
    }

    // 检查是否是网络错误
    if (error.message && (
      error.message.includes('fetch') ||
      error.message.includes('network') ||
      error.message.includes('Failed to fetch') ||
      error.message.includes('CORS') ||
      error.name === 'TypeError'
    )) {
      throw new BangumiError('网络连接失败，可能是 CORS 问题。请检查网络连接或稍后重试')
    }

    // 检查是否是超时错误
    if (error.name === 'AbortError' || error.message.includes('超时')) {
      throw new BangumiError('请求超时，请检查网络连接')
    }

    throw new BangumiError(`网络错误: ${error.message || '未知错误'}`)
  }
}

/**
 * 获取动画详情
 */
export async function getAnimeDetail(id: number): Promise<any> {
  try {
    const url = `${BANGUMI_API_BASE}/v0/subjects/${id}`

    const response = await fetch(url, {
      headers: getRequestHeaders(false), // GET 请求不需要 Content-Type
    })

    if (!response.ok) {
      throw new BangumiError(`获取详情失败: ${response.status}`)
    }

    return await response.json()
  } catch (error: any) {
    if (error instanceof BangumiError) {
      throw error
    }
    throw new BangumiError(`网络错误: ${error.message}`)
  }
}

/**
 * 搜索 Bangumi 角色
 * 参考 anime-character-guessr 的实现
 */
export async function searchBangumiCharacters(
  keyword: string,
  offset = 0,
  limit = 10
): Promise<BgmCharacterSearchResult[]> {
  if (!keyword.trim()) {
    return []
  }

  try {
    const url = `${BANGUMI_API_BASE}/v0/search/characters?limit=${limit}&offset=${offset}`
    const requestBody = {
      keyword: keyword.trim()
    }

    const headers = getRequestHeaders()
    const response = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      },
      10000 // 10 秒超时
    )

    if (!response.ok) {
      let errorMessage = `请求失败: ${response.status} ${response.statusText}`
      try {
        const errorBody = await response.text()
        console.error('Bangumi API 错误响应:', errorBody)
        if (errorBody) {
          try {
            const errorJson = JSON.parse(errorBody)
            errorMessage = errorJson.error?.message || errorJson.message || errorMessage
          } catch {
            errorMessage = `${errorMessage}\n响应内容: ${errorBody.substring(0, 200)}`
          }
        }
      } catch (e) {
        // 忽略读取错误响应体的错误
      }

      if (response.status === 401) {
        throw new BangumiError('API 认证失败，请检查 Access Token 配置')
      }
      throw new BangumiError(errorMessage)
    }

    const result = await response.json()

    if (!result.data) {
      return []
    }

    // 转换数据格式，参考 anime-character-guessr 的 SearchBar.jsx
    const characters = result.data.map((character: any) => {
      // 提取中文名
      const nameCn = character.infobox?.find((item: any) => item.key === "简体中文名")?.value || null

      // 提取英文名或罗马字
      let nameEn: string | undefined = undefined
      const aliases = character.infobox?.find((item: any) => item.key === '别名')?.value
      if (aliases && Array.isArray(aliases)) {
        const englishName = aliases.find((alias: any) => alias.k === '英文名')
        if (englishName) {
          nameEn = englishName.v
        } else {
          const romaji = aliases.find((alias: any) => alias.k === '罗马字')
          if (romaji) {
            nameEn = romaji.v
          }
        }
      }

      return {
        id: character.id,
        name: character.name,
        nameCn: nameCn || undefined,
        nameEn: nameEn,
        // 优先使用 large，然后是 medium，最后是 grid（与搜索页面显示保持一致）
        image: character.images?.large || character.images?.medium || character.images?.grid || null,
        gender: character.gender || '?',
        popularity: character.stat?.collects + character.stat?.comments || 0,
        images: {
          grid: character.images?.grid,
          medium: character.images?.medium,
          large: character.images?.large,
        }
      } as BgmCharacterSearchResult
    })

    return characters
  } catch (error: any) {
    console.error('Bangumi 角色搜索错误:', error)

    if (error instanceof BangumiError) {
      throw error
    }

    // 检查是否是网络错误
    if (error.message && (
      error.message.includes('fetch') ||
      error.message.includes('network') ||
      error.message.includes('Failed to fetch') ||
      error.message.includes('CORS') ||
      error.name === 'TypeError'
    )) {
      throw new BangumiError('网络连接失败，可能是 CORS 问题。请检查网络连接或稍后重试')
    }

    // 检查是否是超时错误
    if (error.name === 'AbortError' || error.message.includes('超时')) {
      throw new BangumiError('请求超时，请检查网络连接')
    }

    throw new BangumiError(`网络错误: ${error.message || '未知错误'}`)
  }
}

/**
 * 根据 subject ID 获取所有角色
 * API 端点: GET /v0/subjects/{subject_id}/characters
 */
export async function getCharactersBySubjectId(
  subjectId: number
): Promise<BgmCharacterSearchResult[]> {
  try {
    const url = `${BANGUMI_API_BASE}/v0/subjects/${subjectId}/characters`

    const response = await fetchWithTimeout(
      url,
      {
        method: 'GET',
        headers: getRequestHeaders(false), // GET 请求不需要 Content-Type
      },
      10000 // 10 秒超时
    )

    if (!response.ok) {
      let errorMessage = `请求失败: ${response.status} ${response.statusText}`
      try {
        const errorBody = await response.text()
        console.error('Bangumi API 错误响应:', errorBody)
        if (errorBody) {
          try {
            const errorJson = JSON.parse(errorBody)
            errorMessage = errorJson.error?.message || errorJson.message || errorMessage
          } catch {
            errorMessage = `${errorMessage}\n响应内容: ${errorBody.substring(0, 200)}`
          }
        }
      } catch (e) {
        // 忽略读取错误响应体的错误
      }

      if (response.status === 401) {
        throw new BangumiError('API 认证失败，请检查 Access Token 配置')
      }
      throw new BangumiError(errorMessage)
    }

    // API 返回的是数组格式，每个元素是角色对象，直接包含 id, name, images 等字段
    const responseData = await response.json()


    let characters: any[] = []

    // 处理不同的返回格式
    if (Array.isArray(responseData)) {
      characters = responseData
    } else if (responseData.data && Array.isArray(responseData.data)) {
      characters = responseData.data
    } else {
      console.warn('角色 API 返回格式不正确，期望数组:', responseData)
      return []
    }


    // 转换数据格式
    // API 返回的每个元素直接就是角色对象，包含 id, name, images, relation 等字段
    const result = characters
      .map((char: any) => {
        // API 返回的角色对象直接包含所有字段，不需要通过 character 字段访问
        // 处理图片URL - images 对象直接包含 large, medium, small, grid 字段
        const images = char.images || {}
        const imageUrl = images.large || images.medium || images.grid || images.small || ''

        // 如果 images 对象存在但所有字段都为空字符串，则设为 null
        const hasValidImage = imageUrl && imageUrl.trim() !== ''
        const finalImageUrl = hasValidImage ? imageUrl : null

        // 注意：API 返回的角色对象可能不包含 infobox 和 stat 字段
        // 这些字段需要在单独调用 /v0/characters/{id} 时才会返回
        const convertedChar = {
          id: char.id,
          name: char.name, // 直接使用 name 字段
          nameCn: undefined, // API 返回的数据中没有中文名，需要单独获取
          name_cn: undefined, // 兼容性字段
          nameEn: undefined,
          // 优先使用 large，然后是 medium，最后是 grid
          image: finalImageUrl,
          gender: '?', // API 返回的数据中没有 gender 字段
          popularity: 0, // API 返回的数据中没有 stat 字段
          images: {
            grid: images.grid || undefined,
            medium: images.medium || undefined,
            large: images.large || undefined,
            small: images.small || undefined,
          }
        } as BgmCharacterSearchResult

        return convertedChar
      })
      .filter((char: any) => char && char.id) // 过滤掉无效的角色

    return result
  } catch (error: any) {
    console.error('获取角色列表错误:', error)

    if (error instanceof BangumiError) {
      throw error
    }

    // 检查是否是网络错误
    if (error.message && (
      error.message.includes('fetch') ||
      error.message.includes('network') ||
      error.message.includes('Failed to fetch') ||
      error.message.includes('CORS') ||
      error.name === 'TypeError'
    )) {
      throw new BangumiError('网络连接失败，可能是 CORS 问题。请检查网络连接或稍后重试')
    }

    // 检查是否是超时错误
    if (error.name === 'AbortError' || error.message.includes('超时')) {
      throw new BangumiError('请求超时，请检查网络连接')
    }

    throw new BangumiError(`网络错误: ${error.message || '未知错误'}`)
  }
}
