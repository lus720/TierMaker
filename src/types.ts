// 图片裁剪位置类型
export type CropPosition = 'auto' | 'center top' | 'center center' | 'center bottom' | 'left center' | 'right center'

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
  cropPosition?: CropPosition // 自定义裁剪位置，默认为 'auto'（自动）
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

// Bangumi 角色搜索结果
export interface BgmCharacterSearchResult {
  id: number
  name: string
  nameCn?: string
  name_cn?: string // 兼容性字段
  nameEn?: string
  gender?: string
  image?: string | null
  popularity?: number
  date?: string // 兼容性字段（角色通常没有日期）
  score?: number // 兼容性字段（角色通常没有评分）
  images?: {
    grid?: string
    medium?: string
    large?: string
    small?: string // 兼容性字段
  }
}

// 统一的搜索结果类型（用于显示）
export type SearchResult = BgmSearchResult | VndbSearchResult | BgmCharacterSearchResult

// API 源类型
export type ApiSource = 'bangumi' | 'vndb' | 'character' | 'local'

