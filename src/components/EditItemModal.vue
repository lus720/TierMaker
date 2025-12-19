<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import type { AnimeItem, CropPosition } from '../types'
import { generateDefaultUrl } from '../utils/url'

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
const cropPosition = ref<CropPosition>('auto')
const previewCropPosition = ref<CropPosition>('auto')
const modalContentRef = ref<HTMLElement | null>(null)
const mouseDownInside = ref(false)
const hasHandledLongPressMouseUp = ref(false)
const originalImageRef = ref<HTMLImageElement | null>(null)
const previewMaskStyle = ref<{ [key: string]: string }>({})
const overlayStyle = ref<{ [key: string]: string }>({})
const cornerTopLeftStyle = ref<{ [key: string]: string }>({ display: 'none' })
const cornerTopRightStyle = ref<{ [key: string]: string }>({ display: 'none' })
const cornerBottomLeftStyle = ref<{ [key: string]: string }>({ display: 'none' })
const cornerBottomRightStyle = ref<{ [key: string]: string }>({ display: 'none' })

watch(() => props.item, (newItem) => {
  if (newItem) {
    name.value = newItem.name || ''
    nameCn.value = newItem.name_cn || ''
    imageUrl.value = newItem.image || ''
    customUrl.value = newItem.url || ''
    imageFile.value = null
    imagePreview.value = newItem.image || ''
    cropPosition.value = newItem.cropPosition || 'auto'
    previewCropPosition.value = newItem.cropPosition || 'auto'
    // 更新预览图片的裁剪位置
    nextTick(() => {
      updatePreviewCrop()
    })
  }
}, { immediate: true })

// 更新预览图片的裁剪位置
function updatePreviewCrop() {
  if (!imagePreview.value) return
  
  const originalImg = originalImageRef.value
  if (!originalImg) return
  
  // 等待图片加载完成
  if (!originalImg.complete) return
  if (!originalImg.naturalWidth || !originalImg.naturalHeight) return
  
  const naturalWidth = originalImg.naturalWidth
  const naturalHeight = originalImg.naturalHeight
  const naturalRatio = naturalWidth / naturalHeight
  const targetRatio = 0.75 // 3:4
  const previewWidth = 100
  const previewHeight = 133
  
  // 确定裁剪位置
  let cropPos = previewCropPosition.value
  if (cropPos === 'auto') {
    // 自动模式：根据图片宽高比决定
    if (naturalRatio < targetRatio) {
      cropPos = 'center top'
    } else {
      cropPos = 'center center'
    }
  }
  
  // 计算预览遮罩在原图中的位置
  // 获取原图在容器中的实际显示尺寸
  const container = originalImg.parentElement
  if (!container) return
  
  // 使用 requestAnimationFrame 确保 DOM 更新完成
  requestAnimationFrame(() => {
    const containerRect = container.getBoundingClientRect()
    const imageRect = originalImg.getBoundingClientRect()
    
    if (imageRect.width === 0 || imageRect.height === 0) {
      // 如果尺寸为0，延迟重试
      setTimeout(() => updatePreviewCrop(), 100)
      return
    }
    
    // ✅ 关键修复：坐标系原点问题
    // getBoundingClientRect() 返回的是相对于视口的 border-box 坐标
    // 但 position: absolute 的定位原点是容器的 padding-box（padding 内边缘），不是 border-box
    // 容器有 border: 2px，所以需要调整坐标原点
    
    // ✅ 使用 padding-box 作为坐标原点（border 内边缘）
    const originX = containerRect.left + container.clientLeft  // clientLeft = border-left-width
    const originY = containerRect.top + container.clientTop     // clientTop = border-top-width
    
    // ✅ 像素对齐函数：将坐标对齐到设备像素网格，避免抗锯齿导致的视觉偏差
    const dpr = window.devicePixelRatio || 1
    const snap = (v: number) => Math.round(v * dpr) / dpr
    
    // <img> 元素相对于容器的位置（使用 padding-box 作为原点）
    const imgElementLeft = imageRect.left - originX
    const imgElementTop = imageRect.top - originY
    const imgElementWidth = imageRect.width
    const imgElementHeight = imageRect.height
    
    // 对于 object-fit: contain，图片内容会在 <img> 元素内居中显示
    // 计算图片内容的实际显示尺寸（保持宽高比，取较小的缩放比例）
    const scaleX = imgElementWidth / naturalWidth
    const scaleY = imgElementHeight / naturalHeight
    const scale = Math.min(scaleX, scaleY)
    
    // 图片内容实际显示的尺寸
    const actualDisplayedWidth = naturalWidth * scale
    const actualDisplayedHeight = naturalHeight * scale
    
    // 图片内容在 <img> 元素内的位置（居中）
    // 这是图片内容相对于 <img> 元素左上角的偏移量
    const imageContentLeftInImg = (imgElementWidth - actualDisplayedWidth) / 2
    const imageContentTopInImg = (imgElementHeight - actualDisplayedHeight) / 2
    
    // ✅ 图片内容相对于容器的绝对位置
    // 这是图片实际显示的左上角位置，白框和红色标记点都使用这个位置
    const imageLeft = imgElementLeft + imageContentLeftInImg
    const imageTop = imgElementTop + imageContentTopInImg
    
    // ✅ 使用与实际裁剪完全相同的逻辑计算裁剪区域（像素级精确）
    // 目标尺寸：100px × 133px (3:4 比例)
    const containerWidth = 100
    const containerHeight = 133
    const targetAspectRatio = 0.75 // 3/4
    
    let sourceX = 0
    let sourceY = 0
    let sourceWidth = naturalWidth
    let sourceHeight = naturalHeight
    
    if (naturalRatio > targetAspectRatio) {
      // s > 0.75：图片较宽
      // 需要从原图中裁剪出对应100px的部分
      // 放缩图片让高度恰好等于作品框高度，然后对宽度居中截取
      const scaleByHeight = containerHeight / naturalHeight
      const targetWidthInOriginal = containerWidth / scaleByHeight
      sourceWidth = targetWidthInOriginal
      
      // 根据裁剪位置计算 sourceX
      if (cropPos === 'left center') {
        sourceX = 0 // 左侧
      } else if (cropPos === 'right center') {
        sourceX = naturalWidth - sourceWidth // 右侧
      } else {
        // center center 或 auto（默认居中）
        sourceX = (naturalWidth - sourceWidth) / 2 // 居中裁剪
      }
      
      sourceY = 0
      sourceHeight = naturalHeight // 从第一排像素到最后一排像素
    } else {
      // s < 0.75：图片较高
      // 需要从原图中裁剪出对应133px的部分
      // 放缩图片让宽度恰好为作品框宽度，然后从顶部开始截取
      const scaleByWidth = containerWidth / naturalWidth
      const targetHeightInOriginal = containerHeight / scaleByWidth
      sourceHeight = targetHeightInOriginal
      
      // 根据裁剪位置计算 sourceY
      if (cropPos === 'center top') {
        sourceY = 0 // 顶部
      } else if (cropPos === 'center bottom') {
        sourceY = naturalHeight - sourceHeight // 底部
      } else {
        // center center 或 auto（默认顶部）
        sourceY = 0 // 保留顶部
      }
      
      sourceX = 0
      sourceWidth = naturalWidth // 每行的每个像素都要高亮
    }
    
    // 将原图坐标转换为显示坐标（使用统一的scale，像素级精确）
    const highlightLeft = sourceX * scale
    const highlightTop = sourceY * scale
    const highlightWidth = sourceWidth * scale
    const highlightHeight = sourceHeight * scale
    
    // ✅ 高亮区域确定后，向外扩张一个单位就得到遮罩框（白框）
    const expandUnit = 1 // 向外扩张一个单位
    const maskLeft = Math.max(0, highlightLeft - expandUnit)
    const maskTop = Math.max(0, highlightTop - expandUnit)
    const maskRight = Math.min(actualDisplayedWidth, highlightLeft + highlightWidth + expandUnit)
    const maskBottom = Math.min(actualDisplayedHeight, highlightTop + highlightHeight + expandUnit)
    const maskWidth = maskRight - maskLeft
    const maskHeight = maskBottom - maskTop
    
    // 设置白框的位置和大小（像素级精确）
    // 白框位置是高亮区域向外扩张一个单位后的位置
    // ✅ 同样使用像素对齐，确保白框和红色标记点使用相同的坐标系统
    const maskLeftSnapped = snap(imageLeft + maskLeft)
    const maskTopSnapped = snap(imageTop + maskTop)
    const maskWidthSnapped = snap(maskWidth)
    const maskHeightSnapped = snap(maskHeight)
    
    previewMaskStyle.value = {
      left: `${maskLeftSnapped}px`,
      top: `${maskTopSnapped}px`,
      width: `${maskWidthSnapped}px`,
      height: `${maskHeightSnapped}px`,
    }
    
    // ✅ 计算遮罩层（加暗未选中部分）
    // 遮罩层覆盖整个容器，但排除白框区域（使用 clip-path）
    // 获取容器的实际尺寸（相对于 padding-box）
    const containerContentWidth = containerRect.width - container.clientLeft * 2
    const containerContentHeight = containerRect.height - container.clientTop * 2
    
    // 计算白框在容器中的百分比位置（相对于容器内容区域）
    const maskLeftPercent = (maskLeftSnapped / containerContentWidth) * 100
    const maskTopPercent = (maskTopSnapped / containerContentHeight) * 100
    const maskRightPercent = ((maskLeftSnapped + maskWidthSnapped) / containerContentWidth) * 100
    const maskBottomPercent = ((maskTopSnapped + maskHeightSnapped) / containerContentHeight) * 100
    
    // 使用 clip-path 创建反向遮罩，排除白框区域
    overlayStyle.value = {
      clipPath: `polygon(
        0% 0%,
        0% 100%,
        ${maskLeftPercent}% 100%,
        ${maskLeftPercent}% ${maskTopPercent}%,
        ${maskRightPercent}% ${maskTopPercent}%,
        ${maskRightPercent}% ${maskBottomPercent}%,
        ${maskLeftPercent}% ${maskBottomPercent}%,
        ${maskLeftPercent}% 100%,
        100% 100%,
        100% 0%
      )`,
    }
    
    // ✅ 设置四个顶点的红色标记点（用于检测图片位置）
    // 标记点大小为 1 像素，直接覆盖在图片顶点处的像素上
    const cornerSize = 1 // 标记点大小（1 像素）
    
    // 对齐到设备像素网格
    const imageLeftSnapped = snap(imageLeft)
    const imageTopSnapped = snap(imageTop)
    const imageRightSnapped = snap(imageLeft + actualDisplayedWidth)
    const imageBottomSnapped = snap(imageTop + actualDisplayedHeight)
    
    // 左上角：直接覆盖在左上角顶点像素
    cornerTopLeftStyle.value = {
      position: 'absolute',
      left: `${imageLeftSnapped}px`,
      top: `${imageTopSnapped}px`,
      width: `${cornerSize}px`,
      height: `${cornerSize}px`,
      backgroundColor: 'red',
      zIndex: '10',
      pointerEvents: 'none',
    }
    
    // 右上角：直接覆盖在右上角顶点像素
    cornerTopRightStyle.value = {
      position: 'absolute',
      left: `${imageRightSnapped - cornerSize}px`,
      top: `${imageTopSnapped}px`,
      width: `${cornerSize}px`,
      height: `${cornerSize}px`,
      backgroundColor: 'red',
      zIndex: '10',
      pointerEvents: 'none',
    }
    
    // 左下角：直接覆盖在左下角顶点像素
    cornerBottomLeftStyle.value = {
      position: 'absolute',
      left: `${imageLeftSnapped}px`,
      top: `${imageBottomSnapped - cornerSize}px`,
      width: `${cornerSize}px`,
      height: `${cornerSize}px`,
      backgroundColor: 'red',
      zIndex: '10',
      pointerEvents: 'none',
    }
    
    // 右下角：直接覆盖在右下角顶点像素
    cornerBottomRightStyle.value = {
      position: 'absolute',
      left: `${imageRightSnapped - cornerSize}px`,
      top: `${imageBottomSnapped - cornerSize}px`,
      width: `${cornerSize}px`,
      height: `${cornerSize}px`,
      backgroundColor: 'red',
      zIndex: '10',
      pointerEvents: 'none',
    }
  })
}

// 监听裁剪位置变化
watch(previewCropPosition, () => {
  nextTick(() => {
    updatePreviewCrop()
  })
})

// 监听图片预览变化
watch(imagePreview, () => {
  nextTick(() => {
    // 等待图片加载完成
    if (originalImageRef.value) {
      if (originalImageRef.value.complete) {
        updatePreviewCrop()
      } else {
        originalImageRef.value.addEventListener('load', updatePreviewCrop, { once: true })
      }
    }
  })
})

// 监听窗口大小变化，重新计算预览位置
if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => {
    if (imagePreview.value) {
      updatePreviewCrop()
    }
  })
}

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
    finalUrl = originalUrl || ''
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
    // 保存裁剪位置（如果为 auto 则不保存，使用默认行为）
    cropPosition: cropPosition.value === 'auto' ? undefined : cropPosition.value,
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
          <div class="image-preview-container" v-if="imagePreview">
            <!-- 原图（尽量大，不拉伸） -->
            <img
              ref="originalImageRef"
              :src="imagePreview"
              alt="原图"
              class="image-preview-original"
              @load="updatePreviewCrop"
            />
            <!-- 遮罩层：将白框外的部分加暗，突出选中区域 -->
            <div class="image-preview-overlay" :style="overlayStyle"></div>
            <!-- 四个顶点红色标记点（用于检测图片位置） -->
            <div class="image-corner-marker" :style="cornerTopLeftStyle"></div>
            <div class="image-corner-marker" :style="cornerTopRightStyle"></div>
            <div class="image-corner-marker" :style="cornerBottomLeftStyle"></div>
            <div class="image-corner-marker" :style="cornerBottomRightStyle"></div>
            <!-- 预览区域（白色框框选的部分就是预览结果） -->
            <div class="image-preview-mask" :style="previewMaskStyle"></div>
          </div>
          <div v-else class="image-placeholder">暂无图片</div>
        </div>
        
        <!-- 裁剪位置设置 -->
        <div class="form-group">
          <label>裁剪位置</label>
          <select
            v-model="previewCropPosition"
            class="form-input"
            @change="cropPosition = previewCropPosition"
            :disabled="!imagePreview"
          >
            <option value="auto">自动（根据图片比例）</option>
            <option value="center top">顶部居中</option>
            <option value="center center">中心</option>
            <option value="center bottom">底部居中</option>
            <option value="left center">左侧居中</option>
            <option value="right center">右侧居中</option>
          </select>
          <div class="form-hint">
            选择图片在卡片中的显示位置。自动模式会根据图片宽高比智能选择。
            <span v-if="!imagePreview" style="color: var(--text-secondary);">（请先设置图片）</span>
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
            留空将根据作品 ID 自动生成链接（Bangumi/VNDB）
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
  background: var(--bg-color);
  border: 2px solid var(--border-color);
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
  border-bottom: 2px solid var(--border-color);
}

.modal-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: bold;
  color: var(--text-color);
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
  color: var(--text-color);
}

.form-input {
  width: 100%;
  padding: 10px;
  border: 2px solid var(--border-color);
  background: var(--input-bg);
  color: var(--text-color);
  font-size: 14px;
  box-sizing: border-box;
}

.form-input:focus {
  outline: none;
  border-color: var(--border-light-color);
}

.form-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  background: var(--bg-light-color);
}

.form-file-input {
  width: 100%;
  padding: 10px;
  border: 2px solid var(--border-color);
  background: var(--input-bg);
  color: var(--text-color);
  font-size: 14px;
  box-sizing: border-box;
  cursor: pointer;
}

.form-hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.image-preview-container {
  position: relative;
  width: 100%;
  min-height: 300px;
  max-height: 500px;
  border: 2px solid var(--border-color);
  overflow: visible;
  background: var(--bg-light-color);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  box-sizing: border-box;
}

.image-preview-original {
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 460px;
  object-fit: contain;
  display: block;
}

.image-preview-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1;
  pointer-events: none;
}

.image-corner-marker {
  position: absolute;
  background-color: red;
  pointer-events: none;
  z-index: 10;
}

.image-preview-mask {
  position: absolute;
  overflow: visible;
  border: 2px solid #ffffff;
  z-index: 2;
  background: transparent;
  pointer-events: none;
  /* 大小通过内联样式动态设置，保持3:4比例 */
}

.image-placeholder {
  color: var(--text-secondary);
  font-size: 14px;
}

.clear-btn {
  margin-left: 8px;
  padding: 2px 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.clear-btn:hover {
  background: var(--border-color);
  color: var(--bg-color);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 20px;
  border-top: 2px solid var(--border-color);
}

.btn {
  padding: 10px 20px;
  border: 2px solid var(--border-color);
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}

.btn:hover {
  background: var(--border-color);
  color: var(--bg-color);
}

.btn-primary {
  background: var(--border-color);
  color: var(--bg-color);
}

.btn-primary:hover {
  opacity: 0.8;
}

.btn-secondary {
  background: var(--bg-color);
  color: var(--text-color);
}
</style>

