<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { fetchVndbUserList } from '../utils/vndb'
import { fetchSeasonAnime, formatSeasonName } from '../utils/bangumiList'
import { getDefaultImage } from '../utils/constants'
import { listTemplates, listTemplateImages, uploadMultipleToTemplate, deleteTemplate } from '../utils/imgbed'
import type { AnimeItem } from '../types'
import type { ExportData } from '../utils/storage'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const emit = defineEmits<{
  close: []
  'import-data': [data: ExportData]
  'import-items': [items: AnimeItem[]]
}>()

const activeTab = ref<'file' | 'vndb' | 'bangumi' | 'template'>('template')

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
        error.value = t('import.invalidFormat')
        return
      }
      emit('import-data', data)
      // Close handled by parent receiving success? or keep open? 
      // Usually import implies closing the modal if successful.
      // We will let App.vue handle closing if it wants, but usually we close here.
      // But App.vue needs to confirm overwrite.
    } catch (e: any) {
      console.error('File parsing error', e)
      error.value = t('import.parseError') + ': ' + e.message
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
    error.value = t('import.vndbEmptyId')
    return
  }
  
  isImportingVndb.value = true
  vndbImportStatus.value = t('import.connectingVndb')
  error.value = ''
  
  try {
    const results = await fetchVndbUserList(vndbUserId.value)
    console.log('[ImportModal] fetchVndbUserList returned items:', results.length)
    
    if (results.length === 0) {
      error.value = t('import.emptyList')
      isImportingVndb.value = false
      return
    }
    
    vndbImportStatus.value = t('import.processing', { count: results.length })// `获取到 ${results.length} 个条目，正在处理...`
    
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

// --- Template Import Logic ---
const templateStep = ref<'list' | 'create'>('list')
const templateList = ref<string[]>([])
const templateImages = ref<string[]>([])
const isLoadingTemplates = ref(false)
const isUploadingTemplate = ref(false)
const templateStatus = ref('')
const newTemplateName = ref('')
const currentTemplateName = ref('')
const templateFileInputRef = ref<HTMLInputElement | null>(null)

async function loadTemplateList() {
  isLoadingTemplates.value = true
  error.value = ''
  try {
    templateList.value = await listTemplates()
  } catch (e: any) {
    console.error('[ImportModal] loadTemplateList failed:', e)
    error.value = e.message || t('import.importFailed')
  } finally {
    isLoadingTemplates.value = false
  }
}

async function handleCreateTemplate() {
  const name = newTemplateName.value.trim()
  if (!name) {
    error.value = t('import.templateNameEmpty')
    return
  }
  // 切换到上传视图
  currentTemplateName.value = name
  templateImages.value = []
  templateStep.value = 'create'
  newTemplateName.value = ''
  error.value = ''
}

function triggerTemplateFileUpload() {
  templateFileInputRef.value?.click()
}

const isDragging = ref(false)

function handleTemplateDrop(event: DragEvent) {
  event.preventDefault()
  isDragging.value = false
  const files = event.dataTransfer?.files
  if (!files || files.length === 0) return
  // 只保留图片文件
  const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
  if (imageFiles.length === 0) return
  processTemplateFiles(imageFiles)
}

async function handleTemplateFileUpload(event: Event) {
  const target = event.target as HTMLInputElement
  const files = target.files
  if (!files || files.length === 0) return
  const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
  if (imageFiles.length === 0) return
  processTemplateFiles(imageFiles)
  if (templateFileInputRef.value) templateFileInputRef.value.value = ''
}

async function processTemplateFiles(fileArray: File[]) {
  isUploadingTemplate.value = true
  error.value = ''
  
  templateStatus.value = t('import.uploadingImages', { current: 0, total: fileArray.length })
  
  try {
    const urls = await uploadMultipleToTemplate(
      currentTemplateName.value,
      fileArray,
      (uploaded, total) => {
        templateStatus.value = t('import.uploadingImages', { current: uploaded, total })
      }
    )
    
    templateImages.value.push(...urls)
    templateStatus.value = t('import.uploadSuccess', { count: urls.length })
    
    setTimeout(() => {
      templateStatus.value = ''
    }, 2000)
  } catch (e: any) {
    console.error('[ImportModal] Template upload failed:', e)
    error.value = e.message || t('import.uploadFailed')
  } finally {
    isUploadingTemplate.value = false
  }
}

async function handleViewTemplate(name: string) {
  currentTemplateName.value = name
  templateStep.value = 'create'
  isLoadingTemplates.value = true
  error.value = ''
  
  try {
    templateImages.value = await listTemplateImages(name)
  } catch (e: any) {
    console.error('[ImportModal] listTemplateImages failed:', e)
    error.value = e.message || t('import.importFailed')
  } finally {
    isLoadingTemplates.value = false
  }
}

async function handleImportTemplate(name: string) {
  isLoadingTemplates.value = true
  error.value = ''
  
  try {
    const imageUrls = await listTemplateImages(name)
    
    if (imageUrls.length === 0) {
      error.value = t('import.templateEmpty')
      isLoadingTemplates.value = false
      return
    }
    
    const animeItems: AnimeItem[] = imageUrls.map((url, index) => {
      // 从 URL 提取文件名作为 name
      const fileName = decodeURIComponent(url.split('/').pop() || `image_${index}`)
      const nameWithoutExt = fileName.replace(/\.[^.]+$/, '')
      
      return {
        id: `template_${name}_${index}_${Date.now()}`,
        name: nameWithoutExt,
        image: url,
        originalImage: url,
      }
    })
    
    console.log('[ImportModal] Emitting import-items from template:', animeItems.length)
    emit('import-items', animeItems)
    
    templateStatus.value = t('import.templateImportSuccess', { count: animeItems.length })
    setTimeout(() => {
      templateStatus.value = ''
      emit('close')
    }, 1500)
  } catch (e: any) {
    console.error('[ImportModal] Import template failed:', e)
    error.value = e.message || t('import.importFailed')
  } finally {
    isLoadingTemplates.value = false
  }
}

async function handleDeleteTemplate(name: string) {
  if (!confirm(t('import.deleteTemplateConfirm', { name }))) {
    return
  }
  
  isLoadingTemplates.value = true
  error.value = ''
  
  try {
    await deleteTemplate(name)
    // 刷新列表
    await loadTemplateList()
    templateStatus.value = t('import.deleteSuccess')
    setTimeout(() => {
      templateStatus.value = ''
    }, 1500)
  } catch (e: any) {
    console.error('[ImportModal] Delete template failed:', e)
    error.value = e.message || t('import.importFailed')
  } finally {
    isLoadingTemplates.value = false
  }
}

function handleBackToList() {
  templateStep.value = 'list'
  currentTemplateName.value = ''
  templateImages.value = []
  error.value = ''
  templateStatus.value = ''
  loadTemplateList()
}

// 当切换到 template tab 时自动加载列表
watch(activeTab, (newTab) => {
  if (newTab === 'template') {
    templateStep.value = 'list'
    loadTemplateList()
  }
})

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
        <button class="close-btn" @click="emit('close')">×</button>
      </div>
      
      <div class="modal-body">
        <div class="tabs">
          <button 
            class="tab-btn" 
            :class="{ active: activeTab === 'template' }"
            @click="activeTab = 'template'"
          >
            {{ t('import.templateTab') }}
          </button>
          <button 
            class="tab-btn" 
            :class="{ active: activeTab === 'file' }"
            @click="activeTab = 'file'"
          >
            {{ t('import.fileTab') }}
          </button>
          <button 
            class="tab-btn" 
            :class="{ active: activeTab === 'vndb' }"
            @click="activeTab = 'vndb'"
          >
            {{ t('import.vndbTab') }}
          </button>
           <button 
            class="tab-btn" 
            :class="{ active: activeTab === 'bangumi' }"
            @click="activeTab = 'bangumi'"
          >
            {{ t('import.bangumiTab') }}
          </button>
        </div>
        
        <div class="tab-content">
          <!-- File Import -->
          <div v-if="activeTab === 'file'" class="import-section">
            <p class="section-desc">{{ t('import.fileDesc') }}</p>
            <p class="warning-text">{{ t('import.fileWarning') }}</p>
            
            <div 
              class="file-drop-area"
              @click="handleFileClick"
            >
              <div class="icon">📄</div>
              <div class="text">{{ t('import.selectFile') }}</div>
              <div class="hint">{{ t('import.fileHint') }}</div>
            </div>    
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
            <p class="section-desc">{{ t('import.vndbDesc') }}</p>
            
            <div class="input-group">
              <input 
                v-model="vndbUserId" 
                type="text" 
                class="modal-input" 
                :placeholder="t('import.vndbPlaceholder')"
                @keydown.enter="handleVndbImport"
                :disabled="isImportingVndb"
              />
              <button 
                class="action-btn" 
                @click="handleVndbImport"
                :disabled="isImportingVndb || !vndbUserId.trim()"
              >
                {{ t('import.startImport') }}
              </button>
            </div>
            
            <div v-if="vndbImportStatus" class="status-text">
              {{ vndbImportStatus }}
            </div>
            
            <div class="help-text">
              <h4>{{ t('import.howToGetId') }}</h4>
              <ol>
                <li>{{ t('import.vndbStep1') }}</li>
                <li>{{ t('import.vndbStep2') }}</li>
                <li>{{ t('import.vndbStep3') }}</li>
              </ol>
            </div>
          </div>
            
        <!-- Bangumi List Import -->
          <div v-if="activeTab === 'bangumi'" class="import-section">
             <p class="section-desc">{{ t('import.bangumiDesc') }}</p>
             <p class="source-info">{{ t('import.seasonDataSource') }} <a href="https://github.com/bangumi-data/bangumi-data" target="_blank">bangumi-data</a></p>
             
             <div class="input-group">
                <input 
                   v-model="seasonInput"
                   type="text"
                   class="modal-input"
                   :placeholder="t('import.bangumiPlaceholder')"
                   @keydown.enter="handleBangumiImport"
                   :disabled="isImportingBangumi"
                />
                <button
                   class="action-btn"
                   @click="handleBangumiImport"
                   :disabled="isImportingBangumi || !seasonInput.trim()"
                >
                   {{ t('import.startImport') }}
                </button>
             </div>
             
             <div v-if="bangumiImportStatus" class="status-text">
                {{ bangumiImportStatus }}
             </div>

             <div class="help-text">
                <h4>{{ t('import.seasonFormat') }}</h4>
                <p>{{ t('import.seasonFormatDesc') }}</p>
                <ul>
                   <li>{{ t('import.seasonQ4') }}: <code>2024q4</code></li>
                   <li>{{ t('import.seasonQ3') }}: <code>2024q3</code></li>
                   <li>{{ t('import.seasonQ2') }}: <code>2024q2</code></li>
                   <li>{{ t('import.seasonQ1') }}: <code>2024q1</code></li>
                </ul>
             </div>
          </div>

          <!-- Template Import -->
          <div v-if="activeTab === 'template'" class="import-section">
            <p class="section-desc">{{ t('import.templateDesc') }}</p>
            
            <!-- Template List View -->
            <div v-if="templateStep === 'list'">
              <!-- Create new template -->
              <div class="input-group">
                <input 
                  v-model="newTemplateName" 
                  type="text" 
                  class="modal-input" 
                  :placeholder="t('import.templateNamePlaceholder')"
                  @keydown.enter="handleCreateTemplate"
                />
                <button 
                  class="action-btn" 
                  @click="handleCreateTemplate"
                  :disabled="!newTemplateName.trim()"
                >
                  {{ t('import.createTemplate') }}
                </button>
              </div>
              
              <div v-if="isLoadingTemplates" class="status-text">
                {{ t('import.loadingTemplates') }}
              </div>
              
              <!-- Template cards -->
              <div v-else-if="templateList.length > 0" class="template-list">
                <div v-for="tpl in templateList" :key="tpl" class="template-card">
                  <div class="template-name" @click="handleViewTemplate(tpl)">📁 {{ tpl }}</div>
                  <div class="template-actions">
                    <button class="template-btn template-btn-import" @click="handleImportTemplate(tpl)" :title="t('import.importTemplate')">
                      {{ t('import.importTemplate') }}
                    </button>
                    <button class="template-btn template-btn-view" @click="handleViewTemplate(tpl)" :title="t('import.viewTemplate')">
                      {{ t('import.viewTemplate') }}
                    </button>
                    <button class="template-btn template-btn-delete" @click="handleDeleteTemplate(tpl)" :title="t('import.deleteTemplate')">
                      ✕
                    </button>
                  </div>
                </div>
              </div>
              
              <div v-else class="empty-text">
                {{ t('import.noTemplates') }}
              </div>
            </div>
            
            <!-- Template Detail / Upload View -->
            <div v-if="templateStep === 'create'">
              <div class="template-detail-header">
                <button class="back-btn" @click="handleBackToList">← {{ t('import.backToList') }}</button>
                <h3 class="template-detail-title">📁 {{ currentTemplateName }}</h3>
              </div>
              
              <!-- Upload area -->
              <div 
                class="file-drop-area"
                :class="{ dragging: isDragging }"
                @click="triggerTemplateFileUpload"
                @dragover.prevent="isDragging = true"
                @dragleave.prevent="isDragging = false"
                @drop="handleTemplateDrop"
              >
                <div class="icon">🖼️</div>
                <div class="text">{{ t('import.uploadImages') }}</div>
                <div class="hint">{{ t('import.uploadImagesHint') }}</div>
              </div>
              <input 
                ref="templateFileInputRef"
                type="file" 
                accept="image/*"
                multiple
                style="display: none" 
                @change="handleTemplateFileUpload"
              />
              
              <!-- Upload progress -->
              <div v-if="isUploadingTemplate" class="status-text">
                {{ templateStatus }}
              </div>
              
              <!-- Image thumbnails -->
              <div v-if="templateImages.length > 0" class="template-images">
                <div class="template-images-header">
                  <span>{{ t('import.uploadedCount', { count: templateImages.length }) }}</span>
                  <button class="action-btn" @click="handleImportTemplate(currentTemplateName)">
                    {{ t('import.importTemplate') }}
                  </button>
                </div>
                <div class="template-thumbnails">
                  <img 
                    v-for="(url, idx) in templateImages" 
                    :key="idx" 
                    :src="url" 
                    class="template-thumb"
                    :alt="`Image ${idx + 1}`"
                  />
                </div>
              </div>
              
              <div v-else-if="!isLoadingTemplates && !isUploadingTemplate" class="empty-text">
                {{ t('import.templateEmpty') }}
              </div>
            </div>
            
            <div v-if="templateStatus && !isUploadingTemplate" class="status-text">
              {{ templateStatus }}
            </div>
          </div>
        </div>
        
        <div v-if="error" class="error-message">{{ error }}</div>
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
  background: var(--modal-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--bg-color);
  border: 2px solid var(--border-color);
  max-width: var(--size-modal-max-width-large, 700px);
  width: 90%;
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
  flex-shrink: 0;
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

.modal-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  position: relative;
  display: flex;
  flex-direction: column;
}

/* 自定义滚动条样式 - WebKit 浏览器（Chrome, Safari, Edge） */
.modal-body::-webkit-scrollbar {
  width: 12px;
}

.modal-body::-webkit-scrollbar-track {
  background: var(--scrollbar-track);
  border-radius: 6px;
}

.modal-body::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 6px;
  border: 2px solid var(--scrollbar-track);
}

.modal-body::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover);
}

/* Firefox 滚动条样式 */
.modal-body {
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
}

.tabs {
  display: flex;
  border-bottom: 2px solid var(--border-color);
  flex-shrink: 0;
}

.tab-btn {
  flex: 1;
  padding: 12px;
  background: var(--bg-light-color);
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  font-weight: bold;
  color: var(--text-color);
  transition: all 0.2s;
}

.tab-btn:hover {
  background: var(--bg-color);
}

.tab-btn.active {
  background: var(--bg-color);
  border-bottom: 2px solid var(--primary-color, #007bff);
  color: var(--primary-color, #007bff);
}

.tab-content {
  padding: var(--size-app-padding, 20px);
  flex: 1;
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
  gap: 10px;
  align-items: center;
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
  padding: 0 var(--size-app-padding, 20px);
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

.modal-input {
  padding: 10px;
  border: 2px solid var(--border-color);
  background: var(--input-bg, #fff);
  color: var(--text-color);
  flex: 1;
  box-sizing: border-box;
  font-size: 14px;
}

.help-text {
  font-size: 0.9em;
  color: var(--text-color);
  opacity: 0.8;
  margin-top: 15px;
}

.help-text ul, .help-text ol {
  padding-left: 20px;
  margin: 5px 0;
}

.help-text h4 {
  margin-bottom: 5px;
  font-size: 1em;
}

.section-desc {
  color: var(--text-secondary, var(--text-color));
  margin-bottom: 10px;
  font-size: 14px;
  line-height: 1.6;
}

.status-text {
  margin-top: 10px;
  color: var(--primary-color, #007bff);
  text-align: center;
  font-weight: bold;
}

.source-info {
  font-size: 12px;
  color: var(--text-color);
  opacity: 0.7;
  margin-bottom: 10px;
}

.file-drop-area {
  border: 2px dashed var(--border-color);
  padding: 30px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--bg-light-color);
}

.file-drop-area:hover,
.file-drop-area.dragging {
  background: var(--border-color);
  color: var(--bg-color);
  border-color: var(--primary-color, #007bff);
}

.file-drop-area .icon {
  font-size: 40px;
  margin-bottom: 10px;
}

.file-drop-area .text {
  font-size: 16px;
  font-weight: bold;
}

.file-drop-area .hint {
  font-size: 12px;
  opacity: 0.7;
  margin-top: 5px;
}

.warning-text {
  color: #ff9800;
  font-size: 12px;
  margin-bottom: 15px;
}

/* Template styles */
.template-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 15px;
}

.template-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 15px;
  border: 2px solid var(--border-color);
  background: var(--bg-light-color);
  transition: all 0.2s;
}

.template-card:hover {
  border-color: var(--primary-color, #007bff);
}

.template-name {
  font-weight: bold;
  color: var(--text-color);
  cursor: pointer;
  flex: 1;
}

.template-name:hover {
  color: var(--primary-color, #007bff);
}

.template-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.template-btn {
  padding: 6px 12px;
  border: 2px solid var(--border-color);
  background: var(--bg-color);
  color: var(--text-color);
  cursor: pointer;
  font-size: 12px;
  font-weight: bold;
  transition: all 0.2s;
}

.template-btn:hover {
  background: var(--border-color);
  color: var(--bg-color);
}

.template-btn-import {
  border-color: var(--primary-color, #007bff);
  color: var(--primary-color, #007bff);
}

.template-btn-import:hover {
  background: var(--primary-color, #007bff);
  color: #fff;
}

.template-btn-view {
  border-color: var(--border-color);
  color: var(--text-color);
}

.template-btn-delete {
  border-color: #cc6666;
  color: #cc6666;
}

.template-btn-delete:hover {
  background: #cc6666;
  color: #fff;
}

.template-detail-header {
  margin-bottom: 15px;
}

.back-btn {
  background: none;
  border: none;
  color: var(--primary-color, #007bff);
  cursor: pointer;
  font-size: 14px;
  padding: 0;
  margin-bottom: 8px;
}

.back-btn:hover {
  text-decoration: underline;
}

.template-detail-title {
  font-size: 18px;
  font-weight: bold;
  color: var(--text-color);
  margin: 0;
}

.template-images {
  margin-top: 15px;
}

.template-images-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  font-size: 14px;
  color: var(--text-color);
}

.template-thumbnails {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
  padding: 4px;
}

/* 缩略图区域滚动条 */
.template-thumbnails::-webkit-scrollbar {
  width: 8px;
}

.template-thumbnails::-webkit-scrollbar-track {
  background: var(--scrollbar-track);
  border-radius: 4px;
}

.template-thumbnails::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 4px;
}

.template-thumbnails::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover);
}

.template-thumbnails {
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
}

.template-thumb {
  width: 60px;
  height: 80px;
  object-fit: cover;
  border: 2px solid var(--border-color);
}

.empty-text {
  text-align: center;
  color: var(--text-color);
  opacity: 0.6;
  margin-top: 20px;
  font-size: 14px;
}
</style>
