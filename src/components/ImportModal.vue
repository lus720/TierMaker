<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { fetchVndbUserList } from '../utils/vndb'
import { fetchSeasonAnime, formatSeasonName } from '../utils/bangumiList'
import { getDefaultImage } from '../utils/constants'
import type { AnimeItem } from '../types'
import type { ExportData } from '../utils/storage'

const emit = defineEmits<{
  close: []
  'import-data': [data: ExportData]
  'import-items': [items: AnimeItem[]]
}>()

const activeTab = ref<'file' | 'vndb' | 'bangumi'>('file')

const { t } = useI18n()

// --- File Import Logic ---
const fileInputRef = ref<HTMLInputElement | null>(null)
const error = ref('')

function handleFileClick() {
  fileInputRef.value?.click()
}

function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const jsonStr = e.target?.result as string
      const data = JSON.parse(jsonStr)
      // Basic validation
      if (!data.tiers || !data.tierConfigs) {
        error.value = '无效的配置文件格式'
        return
      }
      emit('import-data', data)
      // Close handled by parent receiving success? or keep open? 
      // Usually import implies closing the modal if successful.
      // We will let App.vue handle closing if it wants, but usually we close here.
      // But App.vue needs to confirm overwrite.
    } catch (e: any) {
      console.error('File parsing error', e)
      error.value = '解析文件失败: ' + e.message
    } finally {
        if (fileInputRef.value) fileInputRef.value.value = ''
    }
  }
  reader.readAsText(file)
}

// --- VNDB Import Logic ---
const vndbUserId = ref('')
const isImportingVndb = ref(false)
const vndbImportStatus = ref('')

async function handleVndbImport() {
  console.log('[ImportModal] handleVndbImport triggered. UserID:', vndbUserId.value)
  if (!vndbUserId.value.trim()) {
    error.value = '请输入 VNDB 用户 ID'
    return
  }
  
  isImportingVndb.value = true
  vndbImportStatus.value = '正在连接 VNDB...'
  error.value = ''
  
  try {
    const results = await fetchVndbUserList(vndbUserId.value)
    console.log('[ImportModal] fetchVndbUserList returned items:', results.length)
    
    if (results.length === 0) {
      error.value = '该用户列表为空或未公开'
      isImportingVndb.value = false
      return
    }
    
    vndbImportStatus.value = `获取到 ${results.length} 个条目，正在处理...`
    
    const animeItems: AnimeItem[] = []
    
    for (const result of results) {
       // 转换为 AnimeItem
       const imageUrl = result.images.large || result.images.medium || result.images.grid || result.images.small || ''
       const itemId = `vndb_${result.id}`
       const defaultUrl = `https://vndb.org/${result.id}`
       
       let finalImage: string | Blob = imageUrl
       let finalOriginalImage: string | Blob = imageUrl
       let itemBlob: Blob | undefined = undefined

       if (!imageUrl) {
         const defaultImg = getDefaultImage()
         finalImage = defaultImg.url
         finalOriginalImage = defaultImg.blob // Use blob for originalImage to ensure it's saved correctly if needed, or url? type allows both.
         // Actually, if we want IndexedDB to store the blob, we should set _blob.
         itemBlob = defaultImg.blob
         // And for display, use the URL.
         // But wait, if originalImage is Blob, it might need URL.createObjectURL when used?
         // TierRow handles Blob in originalImage by creating ObjectURL.
         // So let's set originalImage to Blob?
         finalOriginalImage = defaultImg.blob
       }

       const anime: AnimeItem = {
         id: itemId,
         name: result.name, // Priority handled in util
         name_cn: result.name_cn || undefined, 
         image: finalImage,
         date: result.date || undefined,
         score: result.score,
         originalUrl: defaultUrl,
         originalImage: finalOriginalImage,
         _blob: itemBlob
       }
       animeItems.push(anime)
    }
    
    console.log('[ImportModal] Emitting import-items with items:', animeItems.length)
    emit('import-items', animeItems)
    
    // Status reset handled by keeping modal open or closing?
    // User might want to import again or see "Success".
    vndbImportStatus.value = `成功导入 ${animeItems.length} 个条目！`
    vndbUserId.value = ''
    setTimeout(() => {
        vndbImportStatus.value = ''
        emit('close')
    }, 1500)
    
  } catch (e: any) {
    console.error('[ImportModal] VNDB Import failed:', e)
    error.value = e.message || '导入失败'
  } finally {
    isImportingVndb.value = false
  }
}

// --- Bangumi List Import Logic ---
const seasonInput = ref('')
const isImportingBangumi = ref(false)
const bangumiImportStatus = ref('')

// 验证季度格式: xxxxqx (e.g. 2024q4)
function isValidSeasonFormat(season: string): boolean {
  return /^\d{4}q[1-4]$/.test(season)
}

async function handleBangumiImport() {
  const season = seasonInput.value.trim().toLowerCase()
  
  if (!season) {
    error.value = '请输入季度'
    return
  }
  
  if (!isValidSeasonFormat(season)) {
    error.value = '格式错误，请输入如 2024q4 的格式'
    return
  }
  
  isImportingBangumi.value = true
  bangumiImportStatus.value = '正在获取动漫列表...'
  error.value = ''
  
  try {
    const animeList = await fetchSeasonAnime(season)
    console.log('[ImportModal] Fetched anime:', animeList.length)
    
    if (animeList.length === 0) {
      error.value = '该季度暂无数据'
      isImportingBangumi.value = false
      return
    }
    
    bangumiImportStatus.value = `获取到 ${animeList.length} 个条目，正在处理...`
    
    const animeItems: AnimeItem[] = []
    
    for (const item of animeList) {
      // 优先使用中文标题
      const titleCn = item.titleTranslate?.['zh-Hans']?.[0] || item.titleTranslate?.['zh-Hant']?.[0]
      const name = titleCn || item.title
      
      // 从 sites 中获取图片和链接
      const bangumiSite = item.sites?.find(s => s.site === 'bangumi')
      const bangumiUrl = bangumiSite?.url || (bangumiSite?.id ? `https://bgm.tv/subject/${bangumiSite.id}` : '')
      
      // 尝试获取 bgm.tv 封面图
      let imageUrl = ''
      if (bangumiSite?.id) {
        // 使用 bgm.tv 封面图 API
        imageUrl = `https://api.bgm.tv/v0/subjects/${bangumiSite.id}/image?type=large`
      }
      
      let finalImage: string | Blob = imageUrl
      let finalOriginalImage: string | Blob = imageUrl
      let itemBlob: Blob | undefined = undefined

      if (!imageUrl) {
        const defaultImg = getDefaultImage()
        finalImage = defaultImg.url
        finalOriginalImage = defaultImg.blob
        itemBlob = defaultImg.blob
      }

      const anime: AnimeItem = {
        id: `bgmlist_${item.id}`,
        name: name,
        name_cn: titleCn || undefined,
        image: finalImage,
        date: item.begin ? item.begin.split('T')[0] : undefined,
        originalUrl: bangumiUrl || item.officialSite || '',
        originalImage: finalOriginalImage,
        _blob: itemBlob,
      }
      animeItems.push(anime)
    }
    
    console.log('[ImportModal] Emitting import-items with items:', animeItems.length)
    emit('import-items', animeItems)
    
    bangumiImportStatus.value = `成功导入 ${animeItems.length} 个条目！`
    setTimeout(() => {
      bangumiImportStatus.value = ''
      emit('close')
    }, 1500)
    
  } catch (e: any) {
    console.error('[ImportModal] Bangumi import failed:', e)
    error.value = e.message || '导入失败'
  } finally {
    isImportingBangumi.value = false
  }
}

// 跟踪鼠标按下是否在 overlay 上
const mouseDownOnOverlay = ref(false)

function handleOverlayMouseDown(event: MouseEvent) {
  // 检查是否点击在 overlay 上（而不是 modal-content 上）
  mouseDownOnOverlay.value = (event.target as HTMLElement).classList.contains('modal-overlay')
}

function handleOverlayMouseUp(event: MouseEvent) {
  // 只有当 mousedown 和 mouseup 都在 overlay 上时才关闭
  const mouseUpOnOverlay = (event.target as HTMLElement).classList.contains('modal-overlay')
  if (mouseDownOnOverlay.value && mouseUpOnOverlay) {
    emit('close')
  }
  mouseDownOnOverlay.value = false
}

function handleClose() {
    emit('close')
}
</script>

<template>
  <div class="modal-overlay" @mousedown="handleOverlayMouseDown" @mouseup="handleOverlayMouseUp">
    <div class="modal-content">
      <div class="modal-header">
        <h2 class="modal-title">{{ t('import.title') }}</h2>
        <button class="close-btn" @click="handleClose">×</button>
      </div>

      <div class="tabs">
        <button 
          class="tab-btn" 
          :class="{ active: activeTab === 'file' }"
          @click="activeTab = 'file'; error = ''"
        >
          {{ t('import.fileTab') }}
        </button>
        <button 
          class="tab-btn" 
          :class="{ active: activeTab === 'vndb' }"
          @click="activeTab = 'vndb'; error = ''"
        >
          {{ t('import.vndbTab') }}
        </button>
        <button 
          class="tab-btn" 
          :class="{ active: activeTab === 'bangumi' }"
          @click="activeTab = 'bangumi'; error = ''"
        >
          {{ t('import.bangumiTab') }}
        </button>
      </div>

      <div class="tab-content">
        <!-- File Import -->
        <div v-if="activeTab === 'file'" class="import-section">
            <p class="description">
                {{ t('import.fileDesc') }}
                <br>
                <span class="warning">{{ t('import.fileWarning') }}</span>
            </p>
            <button class="action-btn primary" @click="handleFileClick">
                📄 {{ t('import.selectFile') }}
            </button>
            <input 
                ref="fileInputRef"
                type="file" 
                accept=".json" 
                style="display: none" 
                @change="handleFileChange"
            />
        </div>

        <!-- VNDB Import -->
        <div v-if="activeTab === 'vndb'" class="import-section">
            <p class="description">
                {{ t('import.vndbDesc') }}
            </p>
            <div class="input-group">
                <input 
                    v-model="vndbUserId"
                    type="text" 
                    :placeholder="t('import.vndbPlaceholder')" 
                    class="id-input"
                    @keydown.enter="handleVndbImport"
                    :disabled="isImportingVndb"
                />
                <button 
                    class="action-btn primary" 
                    @click="handleVndbImport"
                    :disabled="isImportingVndb || !vndbUserId.trim()"
                >
                    {{ isImportingVndb ? t('import.importing') : t('import.startImport') }}
                </button>
            </div>
            
            <div class="vndb-guide">
                <details>
                    <summary>{{ t('import.vndbGuide') }}</summary>
                    <ol>
                        <li>{{ t('import.vndbStep1') }}</li>
                        <li>{{ t('import.vndbStep2') }}</li>
                        <li>{{ t('import.vndbStep3') }}</li>
                    </ol>
                </details>
            </div>
            
            <div v-if="vndbImportStatus" class="status-message">{{ vndbImportStatus }}</div>
        </div>

        <!-- Bangumi List Import -->
        <div v-if="activeTab === 'bangumi'" class="import-section">
            <p class="description">
                {{ t('import.bangumiDesc') }}
            </p>
            
            <div class="input-group">
                <input 
                    v-model="seasonInput"
                    type="text" 
                    :placeholder="t('import.bangumiPlaceholder')" 
                    class="id-input"
                    @keydown.enter="handleBangumiImport"
                    :disabled="isImportingBangumi"
                />
                <button 
                    class="action-btn primary" 
                    @click="handleBangumiImport"
                    :disabled="isImportingBangumi || !seasonInput.trim()"
                >
                    {{ isImportingBangumi ? t('import.importing') : t('import.startImport') }}
                </button>
            </div>
            
            <div class="bangumi-guide">
                <details>
                    <summary>{{ t('import.seasonGuide') }}</summary>
                    <p>{{ t('import.seasonFormat') }}</p>
                    <ul>
                        <li>{{ t('import.season4') }}</li>
                        <li>{{ t('import.season3') }}</li>
                        <li>{{ t('import.season2') }}</li>
                        <li>{{ t('import.season1') }}</li>
                    </ul>
                </details>
            </div>
            
            <div v-if="bangumiImportStatus" class="status-message">{{ bangumiImportStatus }}</div>
        </div>
        
        <div v-if="error" class="error-message">{{ error }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
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
  max-width: 500px;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 20px;
  border-bottom: 2px solid var(--border-color);
  background: var(--bg-color);
}

.modal-title {
  font-size: 20px;
  font-weight: bold;
  color: var(--text-color);
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: var(--text-color);
}

.tabs {
  display: flex;
  border-bottom: 2px solid var(--border-color);
}

.tab-btn {
  flex: 1;
  padding: 12px;
  background: var(--bg-light-color);
  border: none;
  border-bottom: 2px solid transparent; /* Placeholder to prevent resizing */
  cursor: pointer;
  font-weight: bold;
  color: var(--text-color);
}

.tab-btn.active {
  background: var(--bg-color);
  border-bottom: 2px solid var(--primary-color, #007bff); /* Or use text decoration */
  color: var(--primary-color, #007bff);
}

.tab-content {
  padding: 20px;
  min-height: 200px;
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.description {
  color: var(--text-color);
  line-height: 1.5;
  margin-bottom: 10px;
}

.warning {
  color: #ff4d4f;
  font-weight: bold;
}

.action-btn {
  padding: 10px 20px;
  border: 2px solid var(--border-color);
  background: var(--bg-color);
  color: var(--text-color);
  cursor: pointer;
  font-weight: bold;
  transition: all 0.2s;
}

.action-btn:hover:not(:disabled) {
  background: var(--border-color);
  color: var(--bg-color);
}

.action-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.action-btn.primary {
  width: 100%;
}

.input-group {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.id-input {
    padding: 10px;
    border: 2px solid var(--border-color);
    background: var(--input-bg, #fff);
    color: var(--text-color);
}

.vndb-guide {
    font-size: 0.9em;
    color: var(--text-color);
    opacity: 0.8;
}

.vndb-guide ol {
    padding-left: 20px;
    margin: 5px 0;
}

.error-message {
  color: #ff4d4f;
  margin-top: 10px;
  text-align: center;
}

.status-message {
    color: var(--green-color, #28a745);
    text-align: center;
    margin-top: 10px;
}

.season-select {
    padding: 10px;
    border: 2px solid var(--border-color);
    background: var(--input-bg, #fff);
    color: var(--text-color);
    width: 100%;
    font-size: 14px;
    cursor: pointer;
}

.season-select:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.loading-message {
    text-align: center;
    color: var(--text-color);
    opacity: 0.8;
    padding: 20px;
}

.bangumi-guide {
    font-size: 0.9em;
    color: var(--text-color);
    opacity: 0.8;
}

.bangumi-guide p {
    margin: 5px 0;
    line-height: 1.4;
}
</style>
