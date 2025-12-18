<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { searchBangumiAnime, searchBangumiCharacters } from '../utils/bangumi'
import { searchVndbVisualNovel } from '../utils/vndb'
import { generateDefaultUrl } from '../utils/url'
import { saveLastSearchSource, loadLastSearchSource } from '../utils/storage'
import type { AnimeItem, ApiSource, SearchResult, BgmCharacterSearchResult } from '../types'

const props = defineProps<{
  hideItemNames?: boolean
}>()

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
const modalContentRef = ref<HTMLElement | null>(null)
const mouseDownInside = ref(false)

// 本地上传相关状态
const showLocalUpload = ref(false)
const uploadedImage = ref<string | null>(null)
const customTitle = ref('')
const fileInputRef = ref<HTMLInputElement | null>(null)

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
    } else if (apiSource.value === 'character') {
      console.debug('调用 Bangumi 角色搜索 API...')
      data = await searchBangumiCharacters(keyword.value, 0, 10)
      console.debug('Bangumi 角色搜索 API 返回:', data.length, '个结果')
      if (data.length < 10) {
        hasMore.value = false
      }
    } else if (apiSource.value === 'vndb') {
      const vndbResponse = await searchVndbVisualNovel(keyword.value, 1, 20)
      data = vndbResponse.results
      hasMore.value = vndbResponse.more
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
    } else if (apiSource.value === 'character') {
      offset.value += 10
      data = await searchBangumiCharacters(keyword.value, offset.value, 10)
      if (data.length > 0) {
        results.value = [...results.value, ...data]
        if (data.length < 10) {
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
  // 检查是否为角色搜索结果
  const isCharacter = apiSource.value === 'character'
  const characterResult = isCharacter ? result as BgmCharacterSearchResult : null
  
  // 获取图片 URL（按优先级）
  let imageUrl = ''
  if (characterResult) {
    // 角色搜索结果：优先使用 large，然后是 medium，最后是 grid
    // 确保与搜索页面显示的图片一致（搜索页面优先使用 large/medium）
    imageUrl = characterResult.images?.large || characterResult.images?.medium || characterResult.images?.grid || characterResult.image || ''
  } else {
    // 作品搜索结果
    const bgmResult = result as import('../types').BgmSearchResult | import('../types').VndbSearchResult
    imageUrl = bgmResult.images?.large || bgmResult.images?.medium || bgmResult.images?.grid || bgmResult.images?.small || ''
  }
  
  // 将 id 转换为字符串以便检查（BgmSearchResult 的 id 是 number）
  const resultId = String(result.id)
  
  // 生成默认的 web 链接
  const defaultUrl = generateDefaultUrl(result.id, isCharacter)
  
  // 对于角色，使用 character_ 前缀的 ID
  const itemId = isCharacter ? `character_${result.id}` : result.id
  
  const anime: AnimeItem = {
    id: itemId, // 角色使用 character_ 前缀
    name: characterResult?.nameCn || characterResult?.name || result.name,
    name_cn: characterResult?.nameCn || (result as any).name_cn || undefined,
    image: imageUrl,
    date: characterResult ? undefined : ((result as any).date || undefined),
    score: characterResult ? undefined : ((result as any).score || undefined),
    originalUrl: defaultUrl, // 保存默认 web 链接
    originalImage: imageUrl, // 保存默认封面图链接
  }
  
  emit('select', anime)
}

function handleClose() {
  emit('close')
}

function isInsideModalContent(x: number, y: number): boolean {
  if (!modalContentRef.value) return false
  const rect = modalContentRef.value.getBoundingClientRect()
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

function handleMouseDown(event: MouseEvent) {
  mouseDownInside.value = isInsideModalContent(event.clientX, event.clientY)
}

function handleMouseUp(event: MouseEvent) {
  const mouseUpInside = isInsideModalContent(event.clientX, event.clientY)
  if (!mouseDownInside.value && !mouseUpInside) {
    emit('close')
  }
  mouseDownInside.value = false
}

function getPlaceholder() {
  if (apiSource.value === 'bangumi') {
    return '输入动画名称...'
  } else if (apiSource.value === 'character') {
    return '输入角色名称...'
  } else if (apiSource.value === 'vndb') {
    return '输入视觉小说名称...'
  } else if (apiSource.value === 'local') {
    return '输入自定义标题...'
  }
  return '输入搜索关键词...'
}

function getTitle() {
  if (apiSource.value === 'bangumi') {
    return '搜索动画'
  } else if (apiSource.value === 'character') {
    return '搜索角色'
  } else if (apiSource.value === 'vndb') {
    return '搜索视觉小说'
  } else if (apiSource.value === 'local') {
    return '本地上传'
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
  
  // 角色搜索结果显示性别和人气
  if (apiSource.value === 'character') {
    const characterResult = result as BgmCharacterSearchResult
    if (characterResult.gender && characterResult.gender !== '?') {
      parts.push(characterResult.gender === 'male' ? '男' : characterResult.gender === 'female' ? '女' : characterResult.gender)
    }
    if (characterResult.popularity) {
      parts.push(`人气: ${characterResult.popularity}`)
    }
    return parts.join(' · ')
  }
  
  // 年份信息（角色搜索结果没有 date 字段）
  // 使用类型断言，因为 apiSource 可能是 'character'（虽然类型定义中没有）
  const isCharacterResult = (apiSource.value as string) === 'character'
  if (!isCharacterResult && (result as any).date) {
    parts.push((result as any).date.split('-')[0])
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

// 处理文件（用于上传和拖拽）
function processFile(file: File) {
  // 检查文件类型
  if (!file.type.startsWith('image/')) {
    error.value = '请上传图片文件'
    return
  }
  
  // 检查文件大小（限制为 10MB）
  if (file.size > 10 * 1024 * 1024) {
    error.value = '图片大小不能超过 10MB'
    return
  }
  
  // 读取文件并转换为 base64
  const reader = new FileReader()
  reader.onload = (e) => {
    const result = e.target?.result as string
    uploadedImage.value = result
    error.value = ''
    
    // 如果没有自定义标题，使用文件名（去掉扩展名）
    if (!customTitle.value.trim()) {
      const fileName = file.name.replace(/\.[^/.]+$/, '')
      customTitle.value = fileName
    }
  }
  reader.onerror = () => {
    error.value = '图片读取失败'
  }
  reader.readAsDataURL(file)
}

// 处理文件上传
function handleFileUpload(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  processFile(file)
}

// 处理拖拽上传
function handleDragOver(event: DragEvent) {
  event.preventDefault()
  event.stopPropagation()
}

function handleDragEnter(event: DragEvent) {
  event.preventDefault()
  event.stopPropagation()
}

function handleDragLeave(event: DragEvent) {
  event.preventDefault()
  event.stopPropagation()
}

function handleDrop(event: DragEvent) {
  event.preventDefault()
  event.stopPropagation()
  
  const files = event.dataTransfer?.files
  if (files && files.length > 0) {
    processFile(files[0])
  }
}

// 处理本地上传确认
function handleLocalUploadConfirm() {
  if (!uploadedImage.value) {
    error.value = '请先上传图片'
    return
  }
  
  if (!customTitle.value.trim()) {
    error.value = '请输入标题'
    return
  }
  
  // 生成唯一的 ID（使用时间戳）
  const itemId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  
  const anime: AnimeItem = {
    id: itemId,
    name: customTitle.value.trim(),
    image: uploadedImage.value,
    originalImage: uploadedImage.value,
  }
  
  emit('select', anime)
  
  // 重置状态
  uploadedImage.value = null
  customTitle.value = ''
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

// 清除上传的图片
function clearUploadedImage() {
  uploadedImage.value = null
  customTitle.value = ''
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
  error.value = ''
}

// 监听 API 源变化，重置搜索状态并保存
watch(apiSource, () => {
  keyword.value = ''
  results.value = []
  error.value = ''
  hasMore.value = true
  
  // 切换到本地上传时，重置上传状态
  if (apiSource.value === 'local') {
    uploadedImage.value = null
    customTitle.value = ''
    if (fileInputRef.value) {
      fileInputRef.value.value = ''
    }
  }
  
  // 保存当前选择的搜索源（不保存 local）
  if (apiSource.value !== 'local') {
    saveLastSearchSource(apiSource.value)
  }
})

// 组件挂载时加载上次使用的搜索源
onMounted(() => {
  const lastSource = loadLastSearchSource() as ApiSource
  apiSource.value = lastSource
})

// 获取图片 URL，如果为空则返回占位图
function getImageUrl(result: SearchResult): string {
  // 检查是否为角色搜索结果
  const isCharacter = apiSource.value === 'character'
  const characterResult = isCharacter ? result as BgmCharacterSearchResult : null
  
  let url = ''
  if (characterResult) {
    // 角色搜索结果：优先使用 large，然后是 medium，最后是 grid
    // large 和 medium 通常质量更好，避免使用 grid 导致图片太小而模糊
    url = characterResult.images?.large || characterResult.images?.medium || characterResult.images?.grid || characterResult.image || ''
  } else {
    // 作品搜索结果
    const bgmResult = result as import('../types').BgmSearchResult | import('../types').VndbSearchResult
    url = bgmResult.images?.large || bgmResult.images?.medium || bgmResult.images?.grid || bgmResult.images?.small || ''
  }
  
  // 如果 URL 为空或者是无效的 URL，返回占位图
  if (!url || url.trim() === '') {
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
  
  console.warn('❌ 图片加载失败:', errorInfo)
  
  // 直接使用占位图，不做无意义的 CDN 回退尝试
  img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2VlZSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj7lm77niYfliqDovb3lpLHotKU8L3RleHQ+PC9zdmc+'
}
</script>

<template>
  <div class="modal-overlay" @mousedown="handleMouseDown" @mouseup="handleMouseUp">
    <div class="modal-content" ref="modalContentRef" @click.stop>
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
          :class="{ active: apiSource === 'character' }"
          @click="apiSource = 'character'"
        >
          角色
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
          :class="{ active: apiSource === 'local' }"
          @click="apiSource = 'local'"
        >
          本地上传
        </button>
      </div>
      
      <!-- 本地上传界面 -->
      <div v-if="apiSource === 'local'" class="local-upload-container">
        <div class="upload-section">
          <div 
            class="upload-area" 
            @click="fileInputRef?.click()"
            @dragover.prevent="handleDragOver"
            @dragenter.prevent="handleDragEnter"
            @dragleave.prevent="handleDragLeave"
            @drop.prevent="handleDrop"
          >
            <input
              ref="fileInputRef"
              type="file"
              accept="image/*"
              style="display: none"
              @change="handleFileUpload"
            />
            <div v-if="!uploadedImage" class="upload-placeholder">
              <div class="upload-icon">📷</div>
              <div class="upload-text">点击选择图片或拖拽图片到此处</div>
              <div class="upload-hint">支持 JPG、PNG、GIF 等格式，最大 10MB</div>
            </div>
            <div v-else class="upload-preview">
              <img :src="uploadedImage" alt="预览" class="preview-image" />
              <button class="remove-image-btn" @click.stop="clearUploadedImage" title="移除图片">×</button>
            </div>
          </div>
          
          <div class="title-input-section">
            <label for="custom-title" class="title-label">自定义标题：</label>
            <input
              id="custom-title"
              v-model="customTitle"
              type="text"
              placeholder="输入标题..."
              class="title-input"
              @keydown.enter="handleLocalUploadConfirm"
            />
          </div>
          
          <div class="upload-actions">
            <button 
              class="confirm-upload-btn" 
              @click="handleLocalUploadConfirm"
              :disabled="!uploadedImage || !customTitle.trim()"
            >
              确认添加
            </button>
          </div>
        </div>
      </div>
      
      <!-- 搜索界面 -->
      <template v-else>
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
            :class="{ 'character-result': apiSource === 'character' }"
            @click="handleSelect(result)"
          >
            <img
              :src="getImageUrl(result)"
              :data-original-src="getImageUrl(result)"
              :alt="result.name"
              class="result-image"
              @error="handleImageError"
              @load="() => console.log('✅ 搜索结果图片加载成功:', getImageUrl(result))"
            />
            <div v-if="!props.hideItemNames" class="result-info">
              <div class="result-name">
                {{ apiSource === 'character' ? ((result as BgmCharacterSearchResult).nameCn || result.name) : (result.name_cn || result.name) }}
              </div>
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
      </template>
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
  background: var(--modal-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--bg-color);
  border: 2px solid var(--border-color);
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
  border-bottom: 2px solid var(--border-color);
}

.modal-title {
  font-size: 24px;
  font-weight: bold;
  color: var(--text-color);
}

.close-btn {
  width: 30px;
  height: 30px;
  border: 2px solid var(--border-color);
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 24px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  transition: all 0.2s;
}

.close-btn:hover {
  background: var(--border-color);
  color: var(--bg-color);
}

.search-box {
  display: flex;
  gap: 10px;
  padding: 20px;
  border-bottom: 1px solid var(--border-light-color);
}

.search-input {
  flex: 1;
  padding: 10px;
  border: 2px solid var(--border-color);
  background: var(--input-bg);
  color: var(--text-color);
  font-size: 16px;
}

.search-btn {
  padding: 10px 20px;
  border: 2px solid var(--border-color);
  background: var(--border-color);
  color: var(--bg-color);
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}

.search-btn:hover:not(:disabled) {
  opacity: 0.8;
}

.search-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.api-selector {
  display: flex;
  gap: 10px;
  padding: 15px 20px;
  border-bottom: 1px solid var(--border-light-color);
  background: var(--bg-light-color);
}

.api-btn {
  flex: 1;
  padding: 8px 16px;
  border: 2px solid var(--border-color);
  background: var(--bg-color);
  color: var(--text-color);
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}

.api-btn:hover {
  background: var(--bg-hover-color);
}

.api-btn.active {
  background: var(--border-color);
  color: var(--bg-color);
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
  background: var(--scrollbar-track);
  border-radius: 5px;
}

.results-container::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 5px;
  border: 2px solid var(--scrollbar-track);
}

.results-container::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover);
}

/* Firefox 滚动条样式 */
.results-container {
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
}

.results-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 15px;
}

.result-item {
  border: 2px solid var(--border-color);
  cursor: pointer;
  transition: all 0.2s;
  background: var(--bg-color);
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

/* 角色搜索结果使用 contain 模式，避免裁剪导致模糊 */
.result-item.character-result .result-image {
  object-fit: contain;
  background-color: #f5f5f5;
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
  color: var(--text-secondary);
}

.loading,
.empty,
.error-message {
  text-align: center;
  padding: 40px;
  color: var(--text-secondary);
}

.error-message {
  color: #ff0000;
}

@media (prefers-color-scheme: dark) {
  .error-message {
    color: #ff6666;
  }
}

.load-more-btn {
  width: 100%;
  padding: 10px;
  margin-top: 20px;
  border: 2px solid var(--border-color);
  background: var(--bg-color);
  color: var(--text-color);
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}

.load-more-btn:hover:not(:disabled) {
  background: var(--border-color);
  color: var(--bg-color);
}

.load-more-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 本地上传样式 */
.local-upload-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 20px;
  overflow-y: auto;
}

.upload-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.upload-area {
  border: 2px dashed var(--border-color);
  border-radius: 8px;
  padding: 40px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--bg-light-color);
  position: relative;
  min-height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.upload-area:hover {
  border-color: var(--text-color);
  background: var(--bg-hover-color);
}

.upload-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.upload-icon {
  font-size: 48px;
  opacity: 0.5;
}

.upload-text {
  font-size: 16px;
  font-weight: bold;
  color: var(--text-color);
}

.upload-hint {
  font-size: 12px;
  color: var(--text-secondary);
}

.upload-preview {
  position: relative;
  width: 100%;
  max-width: 400px;
  margin: 0 auto;
}

.preview-image {
  width: 100%;
  max-height: 400px;
  object-fit: contain;
  border: 2px solid var(--border-color);
  border-radius: 4px;
}

.remove-image-btn {
  position: absolute;
  top: -10px;
  right: -10px;
  width: 30px;
  height: 30px;
  border: 2px solid var(--border-color);
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 20px;
  font-weight: bold;
  cursor: pointer;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  line-height: 1;
}

.remove-image-btn:hover {
  background: var(--border-color);
  color: var(--bg-color);
}

.title-input-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.title-label {
  font-size: 14px;
  font-weight: bold;
  color: var(--text-color);
}

.title-input {
  padding: 10px;
  border: 2px solid var(--border-color);
  background: var(--input-bg);
  color: var(--text-color);
  font-size: 16px;
  border-radius: 4px;
}

.title-input:focus {
  outline: none;
  border-color: var(--text-color);
}

.upload-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.confirm-upload-btn {
  padding: 12px 24px;
  border: 2px solid var(--border-color);
  background: var(--border-color);
  color: var(--bg-color);
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
  border-radius: 4px;
}

.confirm-upload-btn:hover:not(:disabled) {
  opacity: 0.8;
}

.confirm-upload-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>

