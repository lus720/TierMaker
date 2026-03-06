<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  listTemplateImages,
  listPendingTemplateImages,
  uploadMultipleToTemplate,
  uploadMultipleToPendingTemplate,
  deleteFileByUrl,
} from '../utils/imgbed'
import type { AnimeItem } from '../types'

const props = defineProps<{
  templateName: string
  isPending: boolean
  userId: string
}>()

const emit = defineEmits<{
  back: []
  'import-items': [items: AnimeItem[]]
}>()

const { t } = useI18n()

const images = ref<string[]>([])
const isLoading = ref(false)
const isUploading = ref(false)
const uploadStatus = ref('')
const error = ref('')
const isDragging = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

async function loadImages() {
  isLoading.value = true
  error.value = ''
  try {
    if (props.isPending) {
      images.value = await listPendingTemplateImages(props.templateName)
    } else {
      images.value = await listTemplateImages(props.templateName)
    }
  } catch (e: any) {
    error.value = e.message || t('import.loadFailed')
  } finally {
    isLoading.value = false
  }
}

function triggerUpload() {
  fileInputRef.value?.click()
}

function handleDrop(event: DragEvent) {
  event.preventDefault()
  isDragging.value = false
  const files = event.dataTransfer?.files
  if (!files || files.length === 0) return
  const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
  if (imageFiles.length > 0) processFiles(imageFiles)
}

async function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  const files = target.files
  if (!files || files.length === 0) return
  const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
  if (imageFiles.length > 0) processFiles(imageFiles)
  if (fileInputRef.value) fileInputRef.value.value = ''
}

async function processFiles(fileArray: File[]) {
  isUploading.value = true
  error.value = ''
  uploadStatus.value = `正在上传 0 / ${fileArray.length}...`
  try {
    let urls: string[]
    if (props.isPending) {
      urls = await uploadMultipleToPendingTemplate(
        props.templateName,
        fileArray,
        (uploaded, total) => {
          uploadStatus.value = t('import.uploadingImages', { current: uploaded, total })
        }
      )
    } else {
      urls = await uploadMultipleToTemplate(
        props.templateName,
        fileArray,
        (uploaded, total) => {
          uploadStatus.value = t('import.uploadingImages', { current: uploaded, total })
        }
      )
    }
    images.value.push(...urls)
    uploadStatus.value = `✓ ` + t('import.uploadSuccess', { count: urls.length })
    setTimeout(() => { uploadStatus.value = '' }, 2000)
  } catch (e: any) {
    error.value = e.message || t('import.uploadFailed')
  } finally {
    isUploading.value = false
  }
}

function handleImport() {
  if (images.value.length === 0) {
    error.value = t('import.templateEmpty')
    return
  }
  const animeItems: AnimeItem[] = images.value.map((url, index) => {
    const fileName = decodeURIComponent(url.split('/').pop() || `image_${index}`)
    const nameWithoutExt = fileName.replace(/\.[^.]+$/, '')
    return {
      id: `template_${props.templateName}_${index}_${Date.now()}`,
      name: nameWithoutExt,
      image: url,
      originalImage: url,
    }
  })
  emit('import-items', animeItems)
}

async function removeImage(idx: number) {
  const url = images.value[idx]
  // 先从本地移除（即时反馈）
  images.value.splice(idx, 1)
  // 异步尝试从服务器删除（静默失败）
  try {
    await deleteFileByUrl(url)
  } catch (e) {
    console.warn('[TemplateDetail] deleteFileByUrl failed:', e)
  }
}

onMounted(loadImages)
</script>

<template>
  <div class="template-detail">
    <!-- 顶部栏 -->
    <div class="detail-header">
      <button class="back-btn" @click="emit('back')">← {{ t('import.back') }}</button>
      <div class="detail-title-row">
        <h3 class="detail-title">
          {{ templateName }}
          <span v-if="isPending" class="pending-badge">{{ t('import.pendingApproval') }}</span>
        </h3>
        <button
          v-if="images.length > 0"
          class="import-btn"
          @click="handleImport"
        >
          {{ t('import.importThisTemplate', { count: images.length }) }}
        </button>
      </div>
    </div>

    <!-- 上传区域（仅自己的待审核模板可上传） -->
    <div v-if="isPending">
      <div
        class="upload-area"
        :class="{ dragging: isDragging }"
        @click="triggerUpload"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop="handleDrop"
      >
        <div class="upload-icon">🖼️</div>
        <div class="upload-text">{{ t('import.uploadImagesHintClickDrag') }}</div>
        <div class="upload-hint">{{ t('import.uploadImagesFormatHint') }}</div>
      </div>
      <input
        ref="fileInputRef"
        type="file"
        accept="image/*"
        multiple
        style="display: none"
        @change="handleFileChange"
      />
    </div>
    <!-- 公开模板提示 -->
    <div v-else class="readonly-hint">
      {{ t('import.publicTemplateReadOnly') }}
    </div>

    <!-- 上传进度 -->
    <div v-if="isUploading" class="status-text">{{ uploadStatus }}</div>
    <div v-else-if="uploadStatus" class="status-text success">{{ uploadStatus }}</div>

    <!-- 加载中 -->
    <div v-if="isLoading" class="status-text">{{ t('import.loading') }}</div>

    <!-- 图片网格 -->
    <div v-if="images.length > 0" class="thumbnails-grid">
      <div
        v-for="(url, idx) in images"
        :key="idx"
        class="thumb-wrapper"
      >
        <img
          :src="url"
          :alt="t('import.imageIndex', { index: idx + 1 })"
          class="thumb"
        />
        <!-- 右上角关闭按钮（仅自己的待审核模板显示） -->
        <button
          v-if="isPending"
          class="thumb-close-btn"
          @click.stop="removeImage(idx)"
          :title="t('import.removeImageTooltip')"
        >×</button>
      </div>
    </div>
    <div v-else-if="!isLoading" class="empty-hint">
      {{ isPending ? t('import.noImagesPleaseUpload') : t('import.templateEmpty') }}
    </div>

    <div v-if="error" class="error-text">{{ error }}</div>
  </div>
</template>

<style scoped>
.template-detail {
  display: flex;
  flex-direction: column;
  gap: 14px;
  height: 100%;
}

.detail-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.back-btn {
  background: none;
  border: none;
  color: var(--primary-color, #4a9eff);
  cursor: pointer;
  font-size: 14px;
  padding: 0;
  width: fit-content;
  transition: opacity 0.2s;
}
.back-btn:hover { opacity: 0.7; }

.detail-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.detail-title {
  font-size: 18px;
  font-weight: bold;
  color: var(--text-color);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.pending-badge {
  font-size: 11px;
  font-weight: 600;
  background: #f59e0b;
  color: #000;
  padding: 2px 7px;
  border-radius: 10px;
  letter-spacing: 0.3px;
}

.import-btn {
  padding: 8px 16px;
  background: var(--primary-color, #4a9eff);
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  transition: opacity 0.2s;
  flex-shrink: 0;
}
.import-btn:hover { opacity: 0.85; }

.upload-area {
  border: 2px dashed var(--border-color);
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: var(--bg-light-color);
  border-radius: 6px;
  transition: all 0.2s;
  gap: 6px;
}
.upload-area:hover,
.upload-area.dragging {
  border-color: var(--primary-color, #4a9eff);
  background: rgba(74, 158, 255, 0.06);
}

.upload-icon { font-size: 32px; }
.upload-text { font-size: 14px; font-weight: 600; color: var(--text-color); }
.upload-hint { font-size: 12px; opacity: 0.6; color: var(--text-color); }

.status-text {
  text-align: center;
  font-size: 13px;
  color: var(--primary-color, #4a9eff);
  font-weight: 600;
}
.status-text.success { color: #22c55e; }

.thumbnails-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(144px, 1fr));
  gap: 8px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  padding: 4px;
  align-content: start;
}
.thumbnails-grid::-webkit-scrollbar { width: 6px; }
.thumbnails-grid::-webkit-scrollbar-track { background: var(--scrollbar-track); border-radius: 3px; }
.thumbnails-grid::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 3px; }

/* 缩略图外层容器 */
.thumb-wrapper {
  position: relative;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid var(--border-color);
}
.thumb-wrapper:hover .thumb-close-btn {
  opacity: 1;
}

.thumb {
  width: 100%;
  height: auto;
  display: block;
}

/* 左上角关闭按钮 —— 风格与主页面 delete-btn 保持一致 */
.thumb-close-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  border: 1px solid var(--border-color);
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  opacity: 0;
  transition: all 0.2s;
  z-index: 10;
  padding: 0;
}
.thumb-wrapper:hover .thumb-close-btn {
  opacity: 1;
}
.thumb-close-btn:hover {
  background: var(--border-color);
  color: var(--bg-color);
}

.empty-hint, .error-text {
  text-align: center;
  font-size: 13px;
  opacity: 0.6;
  color: var(--text-color);
}
.error-text { color: #f87171; opacity: 1; }

.readonly-hint {
  text-align: center;
  font-size: 12px;
  padding: 10px 14px;
  background: var(--bg-light-color);
  border-radius: 6px;
  color: var(--text-color);
  opacity: 0.65;
  border: 1px dashed var(--border-color);
}
</style>
