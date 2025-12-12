<script setup lang="ts">
import { ref, watch } from 'vue'
import { searchBangumiAnime } from '../utils/bangumi'
import { searchVndbVisualNovel } from '../utils/vndb'
import { searchAnidbAnime } from '../utils/anidb'
import type { AnimeItem, ApiSource, SearchResult } from '../types'

const emit = defineEmits<{
  close: []
  select: [anime: AnimeItem]
}>()

const apiSource = ref<ApiSource>('bangumi')
const keyword = ref('')
const results = ref<SearchResult[]>([])
const loading = ref(false)
const error = ref('')
const offset = ref(0)
const page = ref(1)
const hasMore = ref(true)

// 防抖搜索
let searchTimeout: ReturnType<typeof setTimeout> | null = null
watch([keyword, apiSource], () => {
  if (searchTimeout) {
    clearTimeout(searchTimeout)
  }
  searchTimeout = setTimeout(() => {
    if (keyword.value.trim()) {
      handleSearch()
    } else {
      results.value = []
    }
  }, 500)
})

async function handleSearch() {
  if (!keyword.value.trim()) return
  
  loading.value = true
  error.value = ''
  offset.value = 0
  page.value = 1
  hasMore.value = true
  
  console.debug('开始搜索:', {
    apiSource: apiSource.value,
    keyword: keyword.value,
  })
  
  try {
    let data: SearchResult[] = []
    
    if (apiSource.value === 'bangumi') {
      console.debug('调用 Bangumi API...')
      data = await searchBangumiAnime(keyword.value, 0, 20)
      console.debug('Bangumi API 返回:', data.length, '个结果')
      if (data.length < 20) {
        hasMore.value = false
      }
    } else if (apiSource.value === 'vndb') {
      const vndbResponse = await searchVndbVisualNovel(keyword.value, 1, 20)
      data = vndbResponse.results
      hasMore.value = vndbResponse.more
    } else if (apiSource.value === 'anidb') {
      // AniDB 通过本地标题索引搜索
      const anidbResponse = await searchAnidbAnime(keyword.value, 1, 20)
      data = anidbResponse.results
      hasMore.value = anidbResponse.more
    }
    
    results.value = data
    
    // 调试：输出搜索结果
    console.debug('搜索结果:', {
      apiSource: apiSource.value,
      keyword: keyword.value,
      count: data.length,
      results: data.slice(0, 3), // 只输出前3个结果
    })
  } catch (e: any) {
    console.error('搜索错误:', e)
    console.error('错误详情:', {
      name: e.name,
      message: e.message,
      stack: e.stack,
    })
    error.value = e.message || '搜索失败'
    results.value = []
  } finally {
    console.debug('搜索完成，重置 loading 状态')
    loading.value = false
  }
}

async function loadMore() {
  if (loading.value || !hasMore.value) return
  
  // AniDB 不支持分页加载
  if (apiSource.value === 'anidb') {
    return
  }
  
  loading.value = true
  
  try {
    let data: SearchResult[] = []
    
    if (apiSource.value === 'bangumi') {
      offset.value += 20
      data = await searchBangumiAnime(keyword.value, offset.value, 20)
      if (data.length > 0) {
        results.value = [...results.value, ...data]
        if (data.length < 20) {
          hasMore.value = false
        }
      } else {
        hasMore.value = false
      }
    } else if (apiSource.value === 'vndb') {
      page.value += 1
      const vndbResponse = await searchVndbVisualNovel(keyword.value, page.value, 20)
      data = vndbResponse.results
      if (data.length > 0) {
        results.value = [...results.value, ...data]
        hasMore.value = vndbResponse.more
      } else {
        hasMore.value = false
      }
    }
  } catch (e: any) {
    error.value = e.message || '加载失败'
  } finally {
    loading.value = false
  }
}

function handleSelect(result: SearchResult) {
  // 获取图片 URL（按优先级）
  const imageUrl = result.images.large || result.images.medium || result.images.grid || result.images.small || ''
  
  // 将 id 转换为字符串以便检查（BgmSearchResult 的 id 是 number）
  const resultId = String(result.id)
  
  // 调试：输出选择的图片 URL
  if (resultId.startsWith('anidb_')) {
    console.debug(`选择 AniDB 结果 ${resultId}:`, {
      name: result.name,
      imageUrl,
      allImages: result.images,
    })
  }
  
  const anime: AnimeItem = {
    id: result.id, // 保持原始类型（number 或 string）
    name: result.name,
    name_cn: result.name_cn || undefined,
    image: imageUrl,
    date: result.date || undefined,
    score: result.score,
  }
  
  // 调试：输出最终创建的 AnimeItem
  if (resultId.startsWith('anidb_')) {
    console.debug(`创建的 AnimeItem:`, anime)
  }
  
  emit('select', anime)
}

function handleClose() {
  emit('close')
}

function getPlaceholder() {
  if (apiSource.value === 'bangumi') {
    return '输入动画名称...'
  } else if (apiSource.value === 'vndb') {
    return '输入视觉小说名称...'
  } else if (apiSource.value === 'anidb') {
    return '输入动画名称或 AID...'
  }
  return '输入搜索关键词...'
}

function getTitle() {
  if (apiSource.value === 'bangumi') {
    return '搜索动画'
  } else if (apiSource.value === 'vndb') {
    return '搜索视觉小说'
  } else if (apiSource.value === 'anidb') {
    return '搜索 AniDB 动画'
  }
  return '搜索'
}

// 获取 Bangumi 类型名称
function getBgmTypeName(type?: number): string {
  if (!type) return ''
  
  const typeMap: Record<number, string> = {
    1: '书籍',
    2: '动画',
    3: '音乐',
    4: '游戏',
    6: '三次元',
  }
  
  return typeMap[type] || ''
}

// 获取结果显示信息（年份 + 类型，仅对 Bangumi）
function getResultMeta(result: SearchResult): string {
  const parts: string[] = []
  
  // 年份信息
  if (result.date) {
    parts.push(result.date.split('-')[0])
  }
  
  // 类型信息（仅对 Bangumi）
  if (apiSource.value === 'bangumi') {
    const bgmResult = result as import('../types').BgmSearchResult
    if (bgmResult.type) {
      const typeName = getBgmTypeName(bgmResult.type)
      if (typeName) {
        parts.push(typeName)
      }
    }
  }
  
  return parts.join(' · ')
}

// 监听 API 源变化，重置搜索状态
watch(apiSource, () => {
  keyword.value = ''
  results.value = []
  error.value = ''
  hasMore.value = true
})

// 判断图片是否是 AniDB 图片
function isAnidbImage(url: string | null | undefined): boolean {
  if (!url) return false
  return url.includes('anidb.net')
}

// 获取图片 URL，如果为空则返回占位图
function getImageUrl(result: SearchResult): string {
  const url = result.images.medium || result.images.grid || result.images.small || result.images.large || ''
  
  // 将 id 转换为字符串以便检查（BgmSearchResult 的 id 是 number）
  const resultId = String(result.id)
  
  // 调试：输出图片 URL 信息
  if (resultId.startsWith('anidb_')) {
    console.debug(`AniDB 结果 ${resultId}: 图片 URLs =`, {
      medium: result.images.medium,
      grid: result.images.grid,
      small: result.images.small,
      large: result.images.large,
      selected: url,
    })
  }
  
  // 如果 URL 为空或者是无效的 URL，返回占位图
  if (!url || url.trim() === '') {
    if (resultId.startsWith('anidb_')) {
      console.warn(`AniDB 结果 ${resultId}: 图片 URL 为空`)
    }
    return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2VlZSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj7lm77niYfliqDovb3lpLHotKU8L3RleHQ+PC9zdmc+'
  }
  return url
}

// 处理图片加载错误
function handleImageError(event: Event) {
  const img = event.target as HTMLImageElement
  const currentSrc = img.src
  const originalSrc = img.getAttribute('data-original-src') || currentSrc
  
  // 详细错误日志
  const errorInfo: any = {
    url: currentSrc,
    originalSrc,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    complete: img.complete,
  }
  
  // 尝试从 URL 中提取 AID（如果是 AniDB 图片）
  if (currentSrc.includes('anidb.net')) {
    const aidMatch = currentSrc.match(/anidb_(\d+)/)
    const imageIdMatch = currentSrc.match(/images\/main\/(\d+)\.jpg/)
    errorInfo.isAnidbImage = true
    if (aidMatch) errorInfo.aid = aidMatch[1]
    if (imageIdMatch) errorInfo.imageId = imageIdMatch[1]
    errorInfo.corsIssue = 'AniDB 图片可能受到 CORS/CORP 限制'
    errorInfo.suggestion = [
      '1. 在浏览器地址栏直接打开图片 URL 测试是否能显示',
      '2. 在 Network 面板查看请求的 HTTP 状态码和响应头',
      '3. 如果浏览器能打开但网页不能显示，很可能是 Cross-Origin-Resource-Policy 限制',
      '4. 这种情况下需要后端代理服务器才能解决'
    ]
  }
  
  console.warn('❌ 图片加载失败:', errorInfo)
  if (errorInfo.isAnidbImage && errorInfo.corsIssue) {
    console.warn('⚠️ AniDB 图片 CORS 问题提示:', errorInfo.suggestion)
  }
  
  // 直接使用占位图，不做无意义的 CDN 回退尝试
  img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2VlZSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj7lm77niYfliqDovb3lpLHotKU8L3RleHQ+PC9zdmc+'
}
</script>

<template>
  <div class="modal-overlay" @click="handleClose">
    <div class="modal-content" @click.stop>
      <div class="modal-header">
        <h2 class="modal-title">{{ getTitle() }}</h2>
        <button class="close-btn" @click="handleClose">×</button>
      </div>
      
      <div class="api-selector">
        <button
          class="api-btn"
          :class="{ active: apiSource === 'bangumi' }"
          @click="apiSource = 'bangumi'"
        >
          Bangumi
        </button>
        <button
          class="api-btn"
          :class="{ active: apiSource === 'vndb' }"
          @click="apiSource = 'vndb'"
        >
          VNDB
        </button>
        <button
          class="api-btn"
          :class="{ active: apiSource === 'anidb' }"
          @click="apiSource = 'anidb'"
        >
          AniDB
        </button>
      </div>
      
      <div v-if="apiSource === 'anidb'" class="anidb-notice">
        <p>⚠️ AniDB 目前不太稳定，可能遇到 API 封禁等问题。</p>
      </div>
      
      <div class="search-box">
        <input
          v-model="keyword"
          type="text"
          :placeholder="getPlaceholder()"
          class="search-input"
          @keydown.enter="handleSearch"
        />
        <button class="search-btn" @click="handleSearch" :disabled="loading">
          {{ loading ? '搜索中...' : '搜索' }}
        </button>
      </div>
      
      <div class="results-container">
        <div v-if="error" class="error-message">{{ error }}</div>
        <div v-else-if="loading && results.length === 0" class="loading">搜索中...</div>
        <div v-else-if="results.length === 0 && keyword" class="empty">未找到结果</div>
        <div v-else class="results-grid">
          <div
            v-for="result in results"
            :key="result.id"
            class="result-item"
            @click="handleSelect(result)"
          >
            <img
              :src="getImageUrl(result)"
              :data-original-src="getImageUrl(result)"
              :alt="result.name"
              class="result-image"
              :crossorigin="isAnidbImage(getImageUrl(result)) ? 'anonymous' : undefined"
              :referrerpolicy="isAnidbImage(getImageUrl(result)) ? 'no-referrer' : undefined"
              @error="handleImageError"
              @load="() => console.log('✅ 搜索结果图片加载成功:', getImageUrl(result))"
            />
            <div class="result-info">
              <div class="result-name">{{ result.name_cn || result.name }}</div>
              <div v-if="getResultMeta(result)" class="result-date">{{ getResultMeta(result) }}</div>
            </div>
          </div>
        </div>
        
        <button
          v-if="hasMore && results.length > 0"
          class="load-more-btn"
          @click="loadMore"
          :disabled="loading"
        >
          {{ loading ? '加载中...' : '加载更多' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: #ffffff;
  border: 2px solid #000000;
  width: 90%;
  max-width: 800px;
  height: 80vh;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 2px solid #000000;
}

.modal-title {
  font-size: 24px;
  font-weight: bold;
}

.close-btn {
  width: 30px;
  height: 30px;
  border: 2px solid #000000;
  background: #ffffff;
  font-size: 24px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  transition: all 0.2s;
}

.close-btn:hover {
  background: #000000;
  color: #ffffff;
}

.search-box {
  display: flex;
  gap: 10px;
  padding: 20px;
  border-bottom: 1px solid #cccccc;
}

.search-input {
  flex: 1;
  padding: 10px;
  border: 2px solid #000000;
  font-size: 16px;
}

.search-btn {
  padding: 10px 20px;
  border: 2px solid #000000;
  background: #000000;
  color: #ffffff;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}

.search-btn:hover:not(:disabled) {
  background: #333333;
}

.search-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.api-selector {
  display: flex;
  gap: 10px;
  padding: 15px 20px;
  border-bottom: 1px solid #cccccc;
  background: #f5f5f5;
}

.api-btn {
  flex: 1;
  padding: 8px 16px;
  border: 2px solid #000000;
  background: #ffffff;
  color: #000000;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}

.api-btn:hover {
  background: #f0f0f0;
}

.api-btn.active {
  background: #000000;
  color: #ffffff;
}

.anidb-notice {
  padding: 15px 20px;
  border-bottom: 1px solid #cccccc;
  background: #fff9e6;
  font-size: 12px;
  line-height: 1.6;
}

.anidb-notice p {
  margin: 5px 0;
}

.anidb-notice a {
  color: #0066cc;
  text-decoration: underline;
}

.anidb-notice a:hover {
  color: #004499;
}

.results-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 20px;
  min-height: 0; /* 确保 flex 子元素可以缩小 */
  /* 使用 flex: 1 和 min-height: 0 让容器可以正确缩小并显示滚动条 */
}

/* 自定义滚动条样式 - WebKit 浏览器（Chrome, Safari, Edge） */
.results-container::-webkit-scrollbar {
  width: 10px;
}

.results-container::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 5px;
}

.results-container::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 5px;
  border: 2px solid #f1f1f1;
}

.results-container::-webkit-scrollbar-thumb:hover {
  background: #555;
}

/* Firefox 滚动条样式 */
.results-container {
  scrollbar-width: thin;
  scrollbar-color: #888 #f1f1f1;
}

.results-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 15px;
}

.result-item {
  border: 2px solid #000000;
  cursor: pointer;
  transition: all 0.2s;
  background: #ffffff;
}

.result-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
}

.result-image {
  width: 100%;
  height: 160px;
  object-fit: cover;
  display: block;
}

.result-info {
  padding: 8px;
}

.result-name {
  font-size: 12px;
  font-weight: bold;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-date {
  font-size: 10px;
  color: #666666;
}

.loading,
.empty,
.error-message {
  text-align: center;
  padding: 40px;
  color: #666666;
}

.error-message {
  color: #ff0000;
}

.load-more-btn {
  width: 100%;
  padding: 10px;
  margin-top: 20px;
  border: 2px solid #000000;
  background: #ffffff;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}

.load-more-btn:hover:not(:disabled) {
  background: #000000;
  color: #ffffff;
}

.load-more-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>

