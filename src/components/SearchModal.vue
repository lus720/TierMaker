<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { searchBangumiAnime, searchBangumiCharacters, getCharactersBySubjectId } from '../utils/bangumi'

import { generateDefaultUrl } from '../utils/url'
import { saveLastSearchSource, loadLastSearchSource } from '../utils/storage'
import type { AnimeItem, ApiSource, SearchResult } from '../types'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = withDefaults(defineProps<{
  enableImportCharacters?: boolean // 是否启用批量导入角色功能
}>(), {
  enableImportCharacters: false
})

const emit = defineEmits<{
  close: []
  select: [anime: AnimeItem]
  'select-multiple': [animes: AnimeItem[]]
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
const uploadedBlob = ref<Blob | null>(null)
const customTitle = ref('')
const fileInputRef = ref<HTMLInputElement | null>(null)

// 批量导入角色相关状态
const importingCharacters = ref<number | null>(null) // 正在导入的 subject ID

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
  
  try {
    let data: SearchResult[] = []
    
    if (apiSource.value === 'bangumi') {
      data = await searchBangumiAnime(keyword.value, 0, 20)
      if (data.length < 20) {
        hasMore.value = false
      }
    } else if (apiSource.value === 'character') {
      data = await searchBangumiCharacters(keyword.value, 0, 20)
      if (data.length < 20) {
        hasMore.value = false
      }
    }
    
    results.value = data
  } catch (e: any) {
    console.error('搜索错误:', e)
    error.value = e.message || '搜索失败'
    results.value = []
  } finally {
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
      offset.value += 20
      data = await searchBangumiCharacters(keyword.value, offset.value, 20)
      if (data.length > 0) {
        results.value = [...results.value, ...data]
        if (data.length < 20) {
          hasMore.value = false
        }
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
  const isCharacter = apiSource.value === 'character'
  const bgmResult = result as import('../types').BgmSearchResult
  const imageUrl = bgmResult.images?.large || bgmResult.images?.medium || bgmResult.images?.grid || bgmResult.images?.small || ''
  const defaultUrl = generateDefaultUrl(result.id, isCharacter)
  const itemId = isCharacter ? `character_${result.id}` : result.id
  
  const anime: AnimeItem = {
    id: itemId,
    // 优先使用中文名，如果没有则使用原名
    name: (result as any).name_cn || result.name,
    // name_cn: (result as any).name_cn || undefined, // 不再保存单独的 name_cn
    image: imageUrl,
    date: (result as any).date || undefined,
    score: (result as any).score || undefined,
    originalUrl: defaultUrl,
    originalImage: imageUrl,
  }
  
  emit('select', anime)
}

// 批量导入角色
async function handleImportCharacters(subjectId: number, event: Event) {
  event.stopPropagation() // 防止触发 handleSelect
  
  if (importingCharacters.value === subjectId) {
    return // 正在导入中，防止重复点击
  }
  
  importingCharacters.value = subjectId
  error.value = ''
  
  try {
    // 获取角色列表
    const characters = await getCharactersBySubjectId(subjectId)
    
    if (characters.length === 0) {
      error.value = '该作品暂无角色信息'
      importingCharacters.value = null
      return
    }
    
    const animeItems: AnimeItem[] = []
    
    for (const character of characters) {
      // character.image 已经是从 getCharactersBySubjectId 转换好的图片URL
      // 如果没有，则尝试从 images 对象中获取
      const imageUrl = character.image || character.images?.large || character.images?.medium || character.images?.grid || character.images?.small || ''
      
      // 确保有有效的图片URL（不为空字符串）
      const finalImageUrl = imageUrl && imageUrl.trim() !== '' ? imageUrl : ''
      
      const defaultUrl = generateDefaultUrl(character.id, true) // 角色
      const itemId = `character_${character.id}`
      
      // 使用 character.name，因为API返回的数据中只有 name 字段
      const characterName = character.name || '未知角色'
      
      // 优先使用中文名
      const finalName = character.nameCn || character.name_cn || characterName

      const anime: AnimeItem = {
        id: itemId,
        name: finalName,
        // name_cn: character.nameCn || character.name_cn || undefined, // 不再保存单独的 name_cn
        image: finalImageUrl,
        originalUrl: defaultUrl,
        originalImage: finalImageUrl,
      }
      
      animeItems.push(anime)
    }
    
    // 批量导入所有角色
    if (animeItems.length > 0) {
      emit('select-multiple', animeItems)
    }
    
  } catch (e: any) {
    console.error('导入角色失败:', e)
    error.value = e.message || '导入角色失败'
  } finally {
    importingCharacters.value = null
  }
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
    return t('search.animePlaceholder')
  } else if (apiSource.value === 'character') {
    return t('search.characterPlaceholder')
  } else if (apiSource.value === 'local') {
    return t('search.localPlaceholder')
  }
  return t('search.defaultPlaceholder')
}

function getTitle() {
  if (apiSource.value === 'bangumi') {
    return t('search.searchAnime')
  } else if (apiSource.value === 'character') {
    return t('search.searchCharacter')
  } else if (apiSource.value === 'local') {
    return t('search.localUpload')
  }
  return t('search.search')
}

// 获取 Bangumi 类型名称
function getBgmTypeName(type?: number): string {
  if (!type) return ''
  
  const typeMap: Record<number, string> = {
    1: t('search.bgmType.book'),
    2: t('search.bgmType.anime'),
    3: t('search.bgmType.music'),
    4: t('search.bgmType.game'),
    6: t('search.bgmType.real'),
  }
  
  return typeMap[type] || ''
}

function getResultMeta(result: SearchResult): string {
  const parts: string[] = []
  if ((result as any).date) {
    parts.push((result as any).date.split('-')[0])
  }
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
  
  // 直接使用 Blob，不再转换为 base64
  uploadedBlob.value = file
  uploadedImage.value = URL.createObjectURL(file)
  error.value = ''
  
  // 如果没有自定义标题，使用文件名（去掉扩展名）
  if (!customTitle.value.trim()) {
    const fileName = file.name.replace(/\.[^/.]+$/, '')
    customTitle.value = fileName
  }
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
    _blob: uploadedBlob.value || undefined,
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
  if (uploadedImage.value) {
    URL.revokeObjectURL(uploadedImage.value)
  }
  uploadedImage.value = null
  uploadedBlob.value = null
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
    if (uploadedImage.value) {
       URL.revokeObjectURL(uploadedImage.value)
    }
    uploadedImage.value = null
    uploadedBlob.value = null
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

function getImageUrl(result: SearchResult): string {
  const bgmResult = result as import('../types').BgmSearchResult
  const url = bgmResult.images?.large || bgmResult.images?.medium || bgmResult.images?.grid || bgmResult.images?.small || ''
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
          {{ t('search.character') }}
        </button>
        <button
          class="api-btn"
          :class="{ active: apiSource === 'local' }"
          @click="apiSource = 'local'"
        >
          {{ t('search.localUpload') }}
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
              <div class="upload-text">{{ t('search.uploadPlaceholder') }}</div>
              <div class="upload-hint">{{ t('search.uploadHint') }}</div>
            </div>
            <div v-else class="upload-preview">
              <img :src="uploadedImage" alt="预览" class="preview-image" />
              <button class="remove-image-btn" @click.stop="clearUploadedImage" :title="t('search.removeImage')">×</button>
            </div>
          </div>
          
          <div class="title-input-section">
            <label for="custom-title" class="title-label">{{ t('search.customTitleLabel') }}</label>
            <input
              id="custom-title"
              v-model="customTitle"
              type="text"
              :placeholder="t('search.titlePlaceholder')"
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
              {{ t('search.confirmAdd') }}
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
            {{ loading ? t('search.searching') : t('search.search') }}
          </button>
        </div>
        
        <div class="results-container">
        <div v-if="error" class="error-message">{{ error }}</div>
        <div v-else-if="loading && results.length === 0" class="loading">{{ t('search.loading') }}</div>
        <div v-else-if="results.length === 0 && keyword" class="empty">{{ t('search.noResults') }}</div>
        <div v-else class="results-grid">
          <div
            v-for="(result, index) in results"
            :key="`${apiSource}-${result.id}-${index}`"
            class="result-item"
            @click="handleSelect(result)"
          >
            <img
              :src="getImageUrl(result)"
              :data-original-src="getImageUrl(result)"
              :alt="result.name"
              class="result-image"
              @error="handleImageError"
              @load="() => {}"
            />
            <div class="result-info">
              <div class="result-name">
                {{ (result as any).name_cn || result.name }}
              </div>
              <div v-if="getResultMeta(result)" class="result-date">{{ getResultMeta(result) }}</div>
            </div>
            <!-- 仅在候补框（enableImportCharacters=true）的 bangumi 搜索结果中显示导入角色按钮 -->
            <button
              v-if="enableImportCharacters && apiSource === 'bangumi' && typeof result.id === 'number'"
              class="import-characters-btn"
              :disabled="importingCharacters === result.id"
              @click.stop="handleImportCharacters(result.id as number, $event)"
              :title="importingCharacters === result.id ? t('search.importingCharacters') : t('search.importAllCharacters')"
            >
              {{ importingCharacters === result.id ? t('search.importingCharacters') : t('search.importCharacters') }}
            </button>
          </div>
        </div>
        
        <button
          v-if="hasMore && results.length > 0"
          class="load-more-btn"
          @click="loadMore"
          :disabled="loading"
        >
          {{ loading ? t('search.loading') : t('search.loadMore') }}
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
  max-width: var(--size-modal-max-width-large, 700px);
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
  padding: var(--size-app-padding, 20px);
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
  padding: var(--size-app-padding, 20px);
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
  grid-template-columns: repeat(auto-fill, minmax(var(--size-search-result-min-width, 120px), 1fr));
  gap: 15px;
}

.result-item {
  border: 2px solid var(--border-color);
  cursor: pointer;
  transition: all 0.2s;
  background: var(--bg-color);
  position: relative;
}

.result-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
}




.result-image {
  width: 100%;
  height: var(--size-search-result-image-height, 160px);
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
  color: var(--text-secondary);
}

.import-characters-btn {
  position: absolute;
  top: 5px;
  right: 5px;
  padding: 4px 8px;
  border: 2px solid var(--border-color);
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 10px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
  border-radius: 4px;
  z-index: 10;
  white-space: nowrap;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.import-characters-btn:hover:not(:disabled) {
  background: var(--border-color);
  color: var(--bg-color);
}

.import-characters-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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

