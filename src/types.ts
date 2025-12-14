// 动画/作品数据类型
export interface AnimeItem {
  id: number | string
  name: string
  name_cn?: string
  image: string
  date?: string
  score?: number
  url?: string // 自定义链接
  originalUrl?: string // 添加作品时的默认web链接
  originalImage?: string // 添加作品时的默认封面图链接
}

// 评分等级配置
export interface TierConfig {
  id: string
  label: string
  color: string
  order: number
  fontSize?: number // 字号（像素），默认 32
}

// Tier 行数据
export interface TierRow {
  id: string
  items: AnimeItem[]
}

// Tier 等级数据
export interface Tier {
  id: string
  rows: TierRow[]
}

// Bangumi API 搜索结果
export interface BgmSearchResult {
  id: number
  name: string
  name_cn?: string
  date?: string
  type?: number // 1书籍; 2动画; 3音乐; 4游戏; 6三次元
  images: {
    small: string
    grid: string
    large: string
    medium: string
    common?: string
  }
  score?: number
  rank?: number
}

// VNDB API 搜索结果
export interface VndbSearchResult {
  id: string
  name: string
  name_cn?: string | null
  date?: string | null
  images: {
    small: string
    grid: string
    large: string
    medium: string
  }
  score?: number
}

// AniDB API 搜索结果
export interface AnidbSearchResult {
  id: string
  aid: number
  name: string
  name_cn?: string | null
  date?: string | null
  images: {
    small: string
    grid: string
    large: string
    medium: string
  }
  score?: number
  type?: string
  episodecount?: number
}

// 统一的搜索结果类型（用于显示）
export type SearchResult = BgmSearchResult | VndbSearchResult | AnidbSearchResult

// API 源类型
export type ApiSource = 'bangumi' | 'vndb' | 'anidb'

