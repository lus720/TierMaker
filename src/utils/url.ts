import type { AnimeItem } from '../types'

/**
 * 根据 id 生成默认的 web 链接
 * @param id 作品ID（可能是数字或字符串格式，如 "v12345", "character_12345", 或纯数字）
 * @param isCharacter 是否为角色（默认为 false）
 * @returns 生成的URL，如果无法识别则返回 undefined
 */
export function generateDefaultUrl(id: number | string | null | undefined, isCharacter = false): string | undefined {
  if (!id) return undefined
  
  const idStr = String(id)
  
  // 角色: id 格式为 "character_12345"
  if (idStr.startsWith('character_')) {
    const characterId = idStr.replace('character_', '')
    return `https://bgm.tv/character/${characterId}`
  }
  
  // VNDB: id 格式为 "v12345"
  if (idStr.startsWith('v')) {
    return `https://vndb.org/${idStr}`
  }
  
  // Bangumi: id 是数字
  if (/^\d+$/.test(idStr)) {
    if (isCharacter) {
      return `https://bgm.tv/character/${idStr}`
    }
    return `https://bgm.tv/subject/${idStr}`
  }
  
  return undefined
}

/**
 * 根据作品项获取跳转URL（优先使用自定义URL，否则生成默认URL）
 * @param item 作品项
 * @returns 跳转URL，如果无法生成则返回 null
 */
export function getItemUrl(item: AnimeItem | null | undefined): string | null {
  if (!item?.id) return null
  
  // 优先使用自定义链接
  if (item.url) {
    return item.url
  }
  
  // 其次使用原始URL
  if (item.originalUrl) {
    return item.originalUrl
  }
  
  // 最后生成默认URL
  return generateDefaultUrl(item.id) || null
}

