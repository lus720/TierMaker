import type { VndbSearchResult } from '../types'
import { i18n } from '../i18n'

const VNDB_API_BASE = 'https://api.vndb.org/kana'

export class VndbError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VndbError'
  }
}

/**
 * VNDB API 查询请求格式
 * filters 可以是：
 * - 简单过滤器：["field", "=", "value"]
 * - 复杂过滤器：["and", filter1, filter2, ...]
 * - 紧凑字符串格式
 */
interface VndbQuery {
  filters?: any[] | string
  fields?: string
  sort?: string
  reverse?: boolean
  results?: number
  page?: number
  count?: boolean
  user?: string
}

/**
 * VNDB API 响应格式
 */
interface VndbResponse {
  results: any[]
  more: boolean
  count?: number
}

/**
 * VNDB 搜索结果（包含分页信息）
 */
export interface VndbSearchResponse {
  results: VndbSearchResult[]
  more: boolean
}

/**
 * 搜索 VNDB 视觉小说
 */
export async function searchVndbVisualNovel(
  keyword: string,
  page = 1,
  results = 20
): Promise<VndbSearchResponse> {
  if (!keyword.trim()) {
    return { results: [], more: false }
  }

  try {
    const url = `${VNDB_API_BASE}/vn`

    // 构造请求体
    const requestBody: VndbQuery = {
      filters: ['search', '=', keyword],
      fields: 'id,title,alttitle,titles{lang,title,latin,main},released,image.url,image.thumbnail,rating',
      sort: 'searchrank',
      results: Math.min(results, 100), // VNDB API 最大支持 100 条
      page,
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      if (response.status === 400) {
        let errorMessage = i18n.global.t('vndb.requestFormatError', { msg: response.status })
        try {
          const errorData = await response.json()
          // VNDB API 错误响应格式：{ "id": "error_id", "msg": "error message" }
          if (errorData.id) {
            errorMessage = i18n.global.t('vndb.requestFormatError', { msg: `${errorData.id}${errorData.msg ? ` - ${errorData.msg}` : ''}` })
          } else if (errorData.msg) {
            errorMessage = i18n.global.t('vndb.requestFormatError', { msg: errorData.msg })
          }
        } catch (e) {
          // 如果无法解析错误响应，使用默认消息
        }
        throw new VndbError(errorMessage)
      }
      if (response.status === 401) {
        throw new VndbError(i18n.global.t('vndb.apiAuthFailed'))
      }
      throw new VndbError(i18n.global.t('vndb.requestFailed', { status: response.status, text: response.statusText }))
    }

    const result: VndbResponse = await response.json()

    const searchResults = (result.results || []).map((vn: any) => {
      // 查找中文标题或主标题
      const chineseTitle = vn.titles?.find((t: any) => t.lang === 'zh-Hans' || t.lang === 'zh-Hant' || t.lang === 'zh')
      const japaneseTitle = vn.titles?.find((t: any) => t.lang === 'ja')
      const englishTitle = vn.titles?.find((t: any) => t.lang === 'en')
      const mainTitle = vn.titles?.find((t: any) => t.main) || vn.titles?.[0]

      const finalName = (chineseTitle?.title || chineseTitle?.latin) ||
        (japaneseTitle?.title || japaneseTitle?.latin) ||
        (englishTitle?.title || englishTitle?.latin) ||
        vn.title ||
        (mainTitle?.latin || mainTitle?.title) || ''

      return {
        id: vn.id,
        name: finalName,
        name_cn: chineseTitle?.title || chineseTitle?.latin || vn.alttitle || null,
        date: vn.released || null,
        images: {
          small: vn.image?.thumbnail || vn.image?.url || '',
          grid: vn.image?.thumbnail || vn.image?.url || '',
          large: vn.image?.url || '',
          medium: vn.image?.thumbnail || vn.image?.url || '',
        },
        score: vn.rating ? vn.rating / 10 : undefined, // VNDB 评分是 10-100，转换为 1-10
      }
    }) as VndbSearchResult[]

    if (searchResults.length > 0) {
      console.log('[VNDB-Search] First item raw:', JSON.stringify(result.results[0]))
      console.log('[VNDB-Search] First item converted:', JSON.stringify(searchResults[0]))
    }

    return {
      results: searchResults,
      more: result.more || false,
    }
  } catch (error: any) {
    if (error instanceof VndbError) {
      throw error
    }
    throw new VndbError(i18n.global.t('vndb.networkError', { msg: error.message }))
  }
}

/**
 * 获取视觉小说详情
 */
export async function getVisualNovelDetail(id: string): Promise<any> {
  try {
    const url = `${VNDB_API_BASE}/vn`

    const requestBody: VndbQuery = {
      filters: ['id', '=', id],
      fields: 'id,title,alttitle,titles{lang,title,latin,main},released,image.url,image.thumbnail,rating,description,length_minutes',
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      throw new VndbError(i18n.global.t('vndb.fetchDetailFailed', { status: response.status }))
    }

    const result: VndbResponse = await response.json()
    return result.results?.[0] || null
  } catch (error: any) {
    if (error instanceof VndbError) {
      throw error
    }
    throw new VndbError(i18n.global.t('vndb.networkError', { msg: error.message }))
  }
}

/**
 * 获取用户的视觉小说列表
 */
export async function fetchVndbUserList(userId: string): Promise<VndbSearchResult[]> {
  if (!userId.trim()) {
    throw new VndbError(i18n.global.t('vndb.enterUserId'))
  }

  try {
    let allResults: VndbSearchResult[] = []
    let hasMore = true
    let page = 1
    const resultsPerPage = 100 // 最大每页数

    // API URL for user list
    const url = `${VNDB_API_BASE}/ulist`

    while (hasMore) {
      // 构造请求体
      const requestBody: VndbQuery = {
        user: userId,
        fields: 'id, vn.id, vn.title, vn.alttitle, vn.titles{lang,title,latin,main}, vn.released, vn.image.url, vn.image.thumbnail, vn.rating, vote, labels.id, labels.label',
        sort: 'vote', // 默认按评分排序，也可以按 'added'
        reverse: true,
        results: resultsPerPage,
        page: page,
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        if (response.status === 404) {
          throw new VndbError(i18n.global.t('vndb.userNotFound'))
        }
        throw new VndbError(i18n.global.t('vndb.fetchUserListFailed', { status: response.status }))
      }

      const data: VndbResponse = await response.json()
      const rawResults = data.results || []

      if (rawResults.length === 0) {
        hasMore = false
        break
      }

      // 转换数据格式
      const convertedResults = rawResults
        .filter((item: any) => {
          // 过滤仅有一个 Label 且为 Wishlist 的条目. ID 5 typically means Wishlist if strict.
          // Label structure: { id, label }
          if (item.labels && item.labels.length === 1) {
            const lbl = item.labels[0]
            if (lbl.label === 'Wishlist' || lbl.id === 5) {
              return false
            }
          }
          return true
        })
        .map((item: any) => {
          const vn = item.vn

          // Title priority: Chinese > Japanese > English > Main/Original
          const chineseTitle = vn.titles?.find((t: any) => t.lang === 'zh-Hans' || t.lang === 'zh-Hant' || t.lang === 'zh')
          const japaneseTitle = vn.titles?.find((t: any) => t.lang === 'ja')
          const englishTitle = vn.titles?.find((t: any) => t.lang === 'en')
          const mainTitle = vn.titles?.find((t: any) => t.main) || vn.titles?.[0]

          const finalName = (chineseTitle?.title || chineseTitle?.latin) ||
            (japaneseTitle?.title || japaneseTitle?.latin) ||
            (englishTitle?.title || englishTitle?.latin) ||
            vn.title ||
            (mainTitle?.latin || mainTitle?.title) || ''

          // 使用用户评分(vote)如果存在，否则使用平均分(rating)
          const userScore = item.vote ? item.vote / 10 : (vn.rating ? vn.rating / 10 : undefined)

          return {
            id: vn.id || item.id, // 使用 VN ID (可能在 root 或 vn 对象中)
            name: finalName,
            name_cn: chineseTitle?.title || chineseTitle?.latin || vn.alttitle || null,
            date: vn.released || null,
            images: {
              small: vn.image?.thumbnail || vn.image?.url || '',
              grid: vn.image?.thumbnail || vn.image?.url || '',
              large: vn.image?.url || '',
              medium: vn.image?.thumbnail || vn.image?.url || '',
            },
            score: userScore,
          }
        }) as VndbSearchResult[]

      if (page === 1 && convertedResults.length > 0) {
        console.log('[VNDB-User] First item raw:', JSON.stringify(rawResults[0]))
        console.log('[VNDB-User] First item converted:', JSON.stringify(convertedResults[0]))
      }

      allResults = [...allResults, ...convertedResults]

      // 检查是否有更多页面
      if (data.more) {
        page++
      } else {
        hasMore = false
      }

      // 安全限制：防止无限循环或内存溢出，限制最大获取数量（例如 500）
      // 如果用户需要更多，可以以后增加限制或分页处理
      if (allResults.length >= 1000) {
        console.warn('Reached maximum limit of 1000 items, stopping fetch.')
        hasMore = false
      }
    }

    return allResults
  } catch (error: any) {
    if (error instanceof VndbError) {
      throw error
    }
    throw new VndbError(i18n.global.t('vndb.networkError', { msg: error.message }))
  }
}
