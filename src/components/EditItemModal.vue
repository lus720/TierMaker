<script setup lang="ts">
import { ref, watch } from 'vue'
import type { AnimeItem } from '../types'

const props = defineProps<{
  item: AnimeItem | null
  isLongPressTriggered?: boolean
}>()

const emit = defineEmits<{
  close: []
  save: [item: AnimeItem]
}>()

const name = ref('')
const nameCn = ref('')
const imageUrl = ref('')
const customUrl = ref('')
const imageFile = ref<File | null>(null)
const imagePreview = ref<string>('')
const modalContentRef = ref<HTMLElement | null>(null)
const mouseDownInside = ref(false)
const mouseDownTime = ref<number>(0)
const hasHandledLongPressMouseUp = ref(false)

// 根据 id 生成默认的 web 链接
function generateDefaultUrl(id: number | string): string | undefined {
  if (!id) return undefined
  
  const idStr = String(id)
  
  // AniDB: id 格式为 "anidb_12345"
  if (idStr.startsWith('anidb_')) {
    const aid = idStr.replace('anidb_', '')
    return `https://anidb.net/anime/${aid}`
  }
  
  // VNDB: id 格式为 "v12345"
  if (idStr.startsWith('v')) {
    return `https://vndb.org/${idStr}`
  }
  
  // Bangumi: id 是数字
  if (/^\d+$/.test(idStr)) {
    return `https://bgm.tv/subject/${idStr}`
  }
  
  return undefined
}

watch(() => props.item, (newItem) => {
  if (newItem) {
    name.value = newItem.name || ''
    nameCn.value = newItem.name_cn || ''
    imageUrl.value = newItem.image || ''
    customUrl.value = newItem.url || ''
    imageFile.value = null
    imagePreview.value = newItem.image || ''
  }
}, { immediate: true })

watch(() => props.isLongPressTriggered, (value) => {
  // 当长按标志变化时，重置处理标志
  if (value) {
    hasHandledLongPressMouseUp.value = false
  }
}, { immediate: true })

function handleFileSelect(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件')
      return
    }
    imageFile.value = file
    // 创建预览
    const reader = new FileReader()
    reader.onload = (e) => {
      imagePreview.value = e.target?.result as string
    }
    reader.readAsDataURL(file)
  }
}

function handleImageUrlChange() {
  if (imageUrl.value && !imageFile.value) {
    imagePreview.value = imageUrl.value
  }
}

function handleSave() {
  if (!props.item) return
  
  // 对于旧数据，如果没有originalUrl或originalImage，使用当前值作为默认值
  let originalUrl = props.item.originalUrl
  let originalImage = props.item.originalImage
  
  if (!originalUrl) {
    // 如果当前有自定义url，使用它；否则生成默认url
    originalUrl = props.item.url || generateDefaultUrl(props.item.id)
  }
  
  if (!originalImage) {
    // 使用当前image作为原始值
    originalImage = props.item.image
  }
  
  // 确定最终图片 URL
  let finalImageUrl = imageUrl.value.trim()
  if (imageFile.value) {
    // 如果有文件，使用文件预览 URL（base64 data URL）
    finalImageUrl = imagePreview.value
  } else if (!finalImageUrl) {
    // 如果用户清空了图片 URL 且没有上传新文件，使用原始默认封面图
    finalImageUrl = originalImage || ''
  }
  
  if (!finalImageUrl) {
    alert('请设置图片（URL 或上传文件）')
    return
  }
  
  // 确定最终 web 链接
  let finalUrl = customUrl.value.trim()
  if (!finalUrl) {
    // 如果用户清空了自定义链接，使用原始默认链接
    finalUrl = originalUrl || undefined
  }
  
  const updatedItem: AnimeItem = {
    ...props.item,
    name: name.value.trim() || props.item.name,
    name_cn: nameCn.value.trim() || undefined,
    image: finalImageUrl,
    url: finalUrl,
    // 保存原始默认值（如果是旧数据，现在也会被设置）
    originalUrl: originalUrl,
    originalImage: originalImage,
  }
  
  emit('save', updatedItem)
}

function handleCancel() {
  emit('close')
}

function clearCustomUrl() {
  customUrl.value = ''
}

function isInsideModalContent(x: number, y: number): boolean {
  if (!modalContentRef.value) return false
  const rect = modalContentRef.value.getBoundingClientRect()
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

function handleMouseDown(event: MouseEvent) {
  mouseDownInside.value = isInsideModalContent(event.clientX, event.clientY)
  mouseDownTime.value = Date.now()
}

function handleMouseUp(event: MouseEvent) {
  // 如果是长按触发的编辑，且还没有处理过mouseup，绝对不触发退出
  if (props.isLongPressTriggered && !hasHandledLongPressMouseUp.value) {
    mouseDownInside.value = false
    hasHandledLongPressMouseUp.value = true
    return
  }
  
  const mouseUpInside = isInsideModalContent(event.clientX, event.clientY)
  if (!mouseDownInside.value && !mouseUpInside) {
    emit('close')
  }
  mouseDownInside.value = false
}
</script>

<template>
  <div v-if="item" class="modal-overlay" @mousedown="handleMouseDown" @mouseup="handleMouseUp">
    <div class="modal-content" ref="modalContentRef">
      <div class="modal-header">
        <h2>编辑作品</h2>
        <button class="close-btn" @click="handleCancel">×</button>
      </div>
      
      <div class="modal-body">
        <!-- 作品名称 -->
        <div class="form-group">
          <label>作品名称（日文/英文）</label>
          <input
            v-model="name"
            type="text"
            placeholder="输入作品名称"
            class="form-input"
          />
        </div>
        
        <!-- 中文名称 -->
        <div class="form-group">
          <label>中文名称（可选）</label>
          <input
            v-model="nameCn"
            type="text"
            placeholder="输入中文名称"
            class="form-input"
          />
        </div>
        
        <!-- 图片预览 -->
        <div class="form-group">
          <label>图片预览</label>
          <div class="image-preview-container">
            <img
              v-if="imagePreview"
              :src="imagePreview"
              alt="预览"
              class="image-preview"
            />
            <div v-else class="image-placeholder">暂无图片</div>
          </div>
        </div>
        
        <!-- 图片 URL -->
        <div class="form-group">
          <label>图片 URL</label>
          <input
            v-model="imageUrl"
            type="url"
            placeholder="输入图片 URL"
            class="form-input"
            @input="handleImageUrlChange"
          />
        </div>
        
        <!-- 上传本地文件 -->
        <div class="form-group">
          <label>或上传本地图片</label>
          <input
            type="file"
            accept="image/*"
            class="form-file-input"
            @change="handleFileSelect"
          />
        </div>
        
        <!-- 自定义链接 -->
        <div class="form-group">
          <label>
            自定义链接（可选）
            <button
              v-if="customUrl"
              class="clear-btn"
              @click="clearCustomUrl"
              title="清除自定义链接"
            >
              清除
            </button>
          </label>
          <input
            v-model="customUrl"
            type="url"
            placeholder="输入自定义链接（留空则使用默认链接）"
            class="form-input"
          />
          <div class="form-hint">
            留空将根据作品 ID 自动生成链接（Bangumi/VNDB/AniDB）
          </div>
        </div>
      </div>
      
      <div class="modal-footer">
        <button class="btn btn-secondary" @click="handleCancel">取消</button>
        <button class="btn btn-primary" @click="handleSave">保存</button>
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
  max-width: 600px;
  width: 90%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 2px solid #000000;
}

.modal-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: bold;
}

.close-btn {
  width: 30px;
  height: 30px;
  border: 2px solid #000000;
  background: #ffffff;
  color: #000000;
  font-size: 24px;
  font-weight: bold;
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

.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: bold;
  color: #000000;
}

.form-input {
  width: 100%;
  padding: 10px;
  border: 2px solid #000000;
  background: #ffffff;
  font-size: 14px;
  box-sizing: border-box;
}

.form-input:focus {
  outline: none;
  border-color: #666666;
}

.form-file-input {
  width: 100%;
  padding: 10px;
  border: 2px solid #000000;
  background: #ffffff;
  font-size: 14px;
  box-sizing: border-box;
  cursor: pointer;
}

.form-hint {
  margin-top: 4px;
  font-size: 12px;
  color: #666666;
}

.image-preview-container {
  width: 100%;
  height: 200px;
  border: 2px solid #000000;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #f5f5f5;
}

.image-preview {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.image-placeholder {
  color: #999999;
  font-size: 14px;
}

.clear-btn {
  margin-left: 8px;
  padding: 2px 8px;
  border: 1px solid #000000;
  background: #ffffff;
  color: #000000;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.clear-btn:hover {
  background: #000000;
  color: #ffffff;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 20px;
  border-top: 2px solid #000000;
}

.btn {
  padding: 10px 20px;
  border: 2px solid #000000;
  background: #ffffff;
  color: #000000;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}

.btn:hover {
  background: #000000;
  color: #ffffff;
}

.btn-primary {
  background: #000000;
  color: #ffffff;
}

.btn-primary:hover {
  background: #333333;
}

.btn-secondary {
  background: #ffffff;
  color: #000000;
}
</style>

