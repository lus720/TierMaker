<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { registerContainer, unregisterContainer, startDrag, cancelDrag } from '../utils/dragManager'
import { getItemUrl } from '../utils/url'
import { getSize, getConfig } from '../utils/configManager'
import { generateUuid } from '../utils/storage'
import { adaptCropToRatio, normalizeCropResolution } from '../utils/cropUtils'
import type { TierRow, AnimeItem } from '../types'

// ... (props definition remains same)


const props = defineProps<{
  row: TierRow
  tierId: string
  rowId: string
  isDragging?: boolean
  isExportingImage?: boolean
  duplicateItemIds?: Set<string | number>
  hideItemNames?: boolean
}>()

const emit = defineEmits<{
  'add-item': [index: number]
  'delete-item': [index: number]
  'edit-item': [item: AnimeItem, index: number, isLongPress?: boolean]
  'move-item': [data: {
    fromRowId: string
    toRowId: string
    fromIndex: number
    toIndex: number
    item: AnimeItem
  }]
  'reorder': [newItems: AnimeItem[]]
  'drag-start': []
  'drag-end': []
}>()

const rowElement = ref<HTMLElement | null>(null)
let longPressTimer: ReturnType<typeof setTimeout> | undefined
const pressingItemId = ref<string | number | null>(null)

// 双击检测状态
const lastClickTime = ref<number>(0)
const lastClickItemId = ref<string | number | null>(null)

const displayItems = computed(() => {
  const items = [...props.row.items]
  // 给空位设置一个默认名字，以符合"图片+作品名"的格式
  items.push({} as AnimeItem) 
  return items
})

// 自定义拖拽 drop 处理
function handleDrop(payload: { item: AnimeItem, fromRowId: string, fromIndex: number }, newIndex: number) {
  const { item, fromRowId, fromIndex } = payload
  const targetRowId = props.rowId

  // 跨容器移动
  if (fromRowId !== targetRowId) {
     emit('move-item', {
        fromRowId,
        toRowId: targetRowId,
        fromIndex,
        toIndex: newIndex,
        item
     })
     return
  }

  // 同容器重排序
  const items = [...props.row.items]
  
  // 校正索引：如果从后面移到前面，index 不变。如果要移到自己后面，index 可能受影响？
  // newIndex 是基于"排除自己"后的列表的位置。
  // 例如 [A, B, C], 拖动 A (index 0). 剩余 [B, C].
  // 放在 C 后面 -> newIndex = 2.
  // 最终结果 [B, C, A].
  // array.splice 插入：
  // items.splice(oldIndex, 1) -> [B, C]
  // items.splice(newIndex, 0, A) -> [B, C, A]. Correct.
  
  if (fromIndex !== newIndex && fromIndex !== -1) {
      // 这里的 items 必须是纯数据，不包含空位
      const [moved] = items.splice(fromIndex, 1)
      // 边界检查
      let targetIndex = newIndex
      if (targetIndex > items.length) targetIndex = items.length
      
      items.splice(targetIndex, 0, moved)
      emit('reorder', items)
  }
}

// 处理容器点击（来自 dragManager 的回调）
function handleContainerClick(payload: { item: AnimeItem }, event: PointerEvent) {
  const { item } = payload
  if (!item || !item.id) return

  // 1. 优先处理修饰键点击 (Ctrl/Shift/RightClick)
  // 注意：DragManager 已经过滤了非左键，但我们可以检查键盘修饰符
  if (event.ctrlKey || event.metaKey || event.shiftKey) {
     const url = getItemUrl(item)
     if (url) window.open(url, '_blank')
     return
  }

  // 2. 双击检测
  const now = Date.now()
  const DOUBLE_CLICK_DELAY = 300 // ms

  if (lastClickItemId.value === item.id && (now - lastClickTime.value) < DOUBLE_CLICK_DELAY) {
      // 触发双击
      const url = getItemUrl(item)
      if (url) window.open(url, '_blank')
      
      // 重置，防止三击触发两次
      lastClickTime.value = 0 
      lastClickItemId.value = null
  } else {
      // 记录第一次点击
      lastClickTime.value = now
      lastClickItemId.value = item.id
  }
}

// 指针按下处理
function handlePointerDown(item: AnimeItem, index: number, event: PointerEvent) {
  if (!item.id) return // 不拖动空位
  
  // 只有左键
  if (event.button !== 0) return

  // 忽略按钮点击 (如删除按钮)
  if ((event.target as HTMLElement).closest('button')) return
  
  const target = event.currentTarget as HTMLElement
  

  
  // 启动长按定时器
  pressingItemId.value = item.id
  longPressTimer = setTimeout(() => {
    emit('edit-item', item, index, true)
    
    // reset state
    pressingItemId.value = null
    cancelDrag()
    longPressTimer = undefined
  }, 500)

  startDrag(event, target, {
    item,
    fromRowId: props.rowId,
    fromIndex: index
  })
}

onMounted(() => {
  if (rowElement.value) {
    registerContainer(props.rowId, rowElement.value, {
      containerId: props.rowId,
      onDrop: handleDrop,
      onClick: handleContainerClick,
      onDragStart: () => {
        // 如果开始拖拽（超过阈值），清除长按定时器
        if (longPressTimer) {
          clearTimeout(longPressTimer)
          longPressTimer = undefined
        }
        pressingItemId.value = null
        emit('drag-start')
      },
      onDragEnd: () => emit('drag-end')
    })
  }
})

const rowStyle = computed(() => {
  return {}
})

// ensureEmptySlotLast 不需要了，因为我们通过 displayItems 和 CSS order 控制
// ...


function handleItemClick(index: number) {
  // 如果点击发生了（说明没有触发长按），清除定时器
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = undefined
  }
  pressingItemId.value = null

  if (index === props.row.items.length) {
    // 点击空位，添加新项
    emit('add-item', index)
  }
}

function getImageStyle(item: AnimeItem) {
  const containerWidth = Number(getSize('image-width')) || 100
  const containerHeight = Number(getSize('image-height')) || 133
  
  // Default style (Cover or unmodified)
  const baseStyle: any = {
    width: `${containerWidth}px`,
    height: `${containerHeight}px`,
    objectFit: 'cover',
    objectPosition: 'center',
  }
  
  const crop = item.cropPosition
  
  // Custom Crop (Canvas replacement)
  if (typeof crop === 'object' && crop !== null && 'sourceX' in crop) {
     // Need natural dimensions to calculate scale
     if (!item.naturalWidth || !item.naturalHeight) {
        return {
           ...baseStyle,
           visibility: 'hidden', 
        }
     }
     
     const nw = item.naturalWidth
     const nh = item.naturalHeight
     
     // 1. 获取目标参数
     const currentTargetRatio = containerWidth / containerHeight
     
     // 2. 规范化分辨率 (处理高清保存/低清预览问题) -> 得到在当前 nw/nh 下的正确 crop
     let effectiveCrop = normalizeCropResolution(crop as any, item.naturalWidth, nw)
     
     // 3. 动态适配当前宽高比 (处理尺寸设置变更问题) -> 得到 perfect crop for current view
     effectiveCrop = adaptCropToRatio(effectiveCrop, currentTargetRatio, nw, nh)
     
     const { sourceX, sourceY, sourceWidth } = effectiveCrop
     
     // 4. 计算显示样式 (Css-based cropping)
     const scale = containerWidth / sourceWidth
     const finalWidth = nw * scale
     const finalHeight = nh * scale
     const offsetX = -sourceX * scale
     const offsetY = -sourceY * scale
     
     return {
        width: `${finalWidth}px`,
        height: `${finalHeight}px`,
        position: 'absolute',
        left: `${offsetX}px`,
        top: `${offsetY}px`,
        objectFit: 'fill', 
        maxWidth: 'none',
        maxHeight: 'none'
     }
  }
  
  // Predefined String Positions
  if (typeof crop === 'string' && crop !== 'auto') {
     return {
        ...baseStyle,
        objectPosition: crop
     }
  }
  
  // Auto: 根据宽高比智能选择裁剪位置
  if (item.naturalWidth && item.naturalHeight) {
     const targetRatio = Number(getSize('image-aspect-ratio')) || (containerWidth / containerHeight)
     const naturalRatio = item.naturalWidth / item.naturalHeight
     
     return {
        ...baseStyle,
        objectPosition: naturalRatio > targetRatio ? 'center center' : 'center top'
     }
  }
  
  // naturalWidth/Height 未就绪时，先隐藏避免闪烁
  return {
     ...baseStyle,
     visibility: 'hidden'
  }
}

function handleImageLoad(event: Event) {
  const img = event.target as HTMLImageElement
  
  const itemId = img.getAttribute('data-item-id')
  const item = itemId ? props.row.items.find(i => String(i.id) === String(itemId)) : null
  
  if (item) {
     // 更新 naturalWidth/Height，这会触发 Vue 响应式更新
     // getImageStyle() 会使用这些值计算正确的裁剪位置
     item.naturalWidth = img.naturalWidth
     item.naturalHeight = img.naturalHeight
  }
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
    error: (event as ErrorEvent).message || '未知错误'
  }
  
  // 尝试从 item 中获取更多信息（如果可用）
  const itemId = img.getAttribute('data-item-id')
  if (itemId) {
    errorInfo.itemId = itemId
  }
  
  console.warn('❌ 图片加载失败:', errorInfo)
  
  // 直接使用占位图，不做无意义的 CDN 回退尝试
  img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2VlZSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj7lm77niYfliqDovb3lpLHotKU8L3RleHQ+PC9zdmc+'
}

// 处理右键点击跳转
function handleRightClick(item: AnimeItem) {
  const url = getItemUrl(item)
  if (url) {
    window.open(url, '_blank')
  }
}

function handleItemDelete(index: number, e: Event) {
  e.stopPropagation()
  emit('delete-item', index)
}





// 处理文件拖放
function processFile(file: File): Promise<AnimeItem | null> {
  return new Promise((resolve) => {
    // 检查文件类型
    if (!file.type.startsWith('image/')) {
      console.error('请上传图片文件')
      resolve(null)
      return
    }
    
    // 检查文件大小（限制为 10MB）
    if (file.size > 10 * 1024 * 1024) {
      console.error('图片大小不能超过 10MB')
      resolve(null)
      return
    }
    
    // 使用文件名（去掉扩展名）作为作品名
    const fileName = file.name.replace(/\.[^/.]+$/, '')
    
    // 生成唯一的 ID
    const itemId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    // 使用 ObjectURL 而不是 Base64
    const blobUrl = URL.createObjectURL(file)
    
    const anime: AnimeItem = {
      id: itemId,
      uuid: generateUuid(),
      name: fileName || '未命名作品',
      image: blobUrl,
      originalImage: blobUrl,
      _blob: file, // 关键：保存 Blob 对象以便持久化
    }
    
    resolve(anime)
  })
}

function handleDragOver(event: DragEvent) {
  // 只处理文件拖放，不影响 Sortable 的内部拖动
  if (event.dataTransfer?.types.includes('Files')) {
    event.preventDefault()
    event.stopPropagation()
  }
}

function handleDragEnter(event: DragEvent) {
  // 只处理文件拖放，不影响 Sortable 的内部拖动
  if (event.dataTransfer?.types.includes('Files')) {
    event.preventDefault()
    event.stopPropagation()
  }
}

function handleDragLeave(event: DragEvent) {
  // 只处理文件拖放，不影响 Sortable 的内部拖动
  if (event.dataTransfer?.types.includes('Files')) {
    event.preventDefault()
    event.stopPropagation()
  }
}

async function handleFileDrop(event: DragEvent) {
  // 只处理文件拖放，不影响 Dragula 的内部拖动
  if (!event.dataTransfer?.types.includes('Files')) {
    return
  }
  
  event.preventDefault()
  event.stopPropagation()
  
  const files = event.dataTransfer?.files
  if (!files || files.length === 0) return
  
  // 处理所有拖放的文件，添加到行的末尾
  const newItems: AnimeItem[] = []
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const item = await processFile(file)
    if (item) {
      newItems.push(item)
    }
  }
  
  // 批量添加所有文件到行的末尾
  if (newItems.length > 0) {
    const currentItems = [...props.row.items]
    emit('reorder', [...currentItems, ...newItems])
  }
}
</script>

<template>
  <div 
    ref="rowElement" 
    class="tier-row" 
    :data-row-id="rowId"
    @dragover="handleDragOver"
    @dragenter="handleDragEnter"
    @dragleave="handleDragLeave"
    @drop="handleFileDrop"
    :style="rowStyle"
  >
    <div
      v-for="(item, index) in displayItems"
      :key="item.uuid || 'empty-slot'"
      class="tier-item"
      :data-item-id="item.id || ''"
      :class="{ 
        'empty': !item.id,
        'duplicate': item.id && props.duplicateItemIds?.has(item.id),
        'hide-name': props.hideItemNames,
        'custom-dragging-source': false /* 可以在这里控制源元素样式 */
      }"
      @click="handleItemClick(index)"
      @pointerdown="handlePointerDown(item, index, $event)"
    >
      <div 
        v-if="item.image" 
        class="item-image-container"
      >
        <img
          :key="`img-${item.id}`"
          :src="item.image as string"
          :data-original-src="item.image as string"
          :data-item-id="item.id || ''"
          :alt="item.name || ''"
          class="item-image"
          :class="{ 'clickable': getItemUrl(item) }"
          @contextmenu.prevent="handleRightClick(item)"
          @error="handleImageError"
          @load="handleImageLoad"
          :title="getItemUrl(item) ? '双击或 Ctrl+点击或右键点击跳转到详情页' : ''"
          :style="getImageStyle(item)"
        />
        <!-- 长按加载条 (圆形) - 移到图片容器内 -->
        <div 
          v-if="pressingItemId === item.id" 
          class="long-press-indicator-circle"
        >
          <svg viewBox="0 0 40 40" class="progress-ring">
            <circle
              class="progress-ring-circle"
              stroke="white"
              stroke-width="2"
              fill="transparent"
              r="12"
              cx="20"
              cy="20"
            />
          </svg>
        </div>
      </div>
      <div v-else class="item-placeholder">
        <span class="placeholder-text">+</span>
      </div>
      <div v-if="item.name && !props.hideItemNames" class="item-name">{{ item.name }}</div>

      <button
        v-if="item.id"
        class="delete-btn"
        @click="handleItemDelete(index, $event)"
        title="删除"
      >
        ×
      </button>
      

    </div>
  </div>
</template>

<style scoped>
.tier-row {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start; /* Ensure items start from top */
  gap: var(--size-row-gap, 10px);
  /* flex: 1; Remove flex: 1 to allow fixed width */
  min-height: var(--size-row-min-height, 120px);
  padding: var(--size-container-padding-top, 10px) var(--size-row-padding, 10px) var(--size-container-padding-bottom, 10px) var(--size-row-padding, 10px);
  background: var(--bg-color);
  /* align-self: stretch; Remove stretch to respect width */
  box-sizing: border-box;
  /* width: var(--tier-row-width, auto);  Removed fixed width */
  flex: 1; /* Restore flex 1 to fill available space */
}

.tier-item {
  position: relative;
  width: var(--size-item-width, 100px);
  height: var(--size-item-height, 173px);
  border: none;
  background: var(--bg-color);
  cursor: pointer;
  transition: all 0.2s;
  overflow: hidden;
}

.long-press-indicator-circle {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 100;
  pointer-events: none;
  background: rgba(0, 0, 0, 0.6); /* Darker overlay */
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  opacity: 0; /* 初始隐藏 */
  animation: fadeIn 0.05s linear 0.2s forwards; /* 0.2s 后显示 */
}

@keyframes fadeIn {
  to {
    opacity: 1;
  }
}

.progress-ring {
  display: block;
  width: var(--size-long-press-size, 50px);
  height: var(--size-long-press-size, 50px);
}

.progress-ring-circle {
  stroke-dasharray: 100.5; /* 2 * PI * 16 ≈ 100.5 */
  stroke-dashoffset: 100.5;
  stroke-linecap: round;
  transform: rotate(-90deg);
  transform-origin: 50% 50%;
  /* 0.2s 延迟，0.3s 动画时长，总计 0.5s */
  animation: progressRing 0.3s linear 0.2s forwards;
}

@keyframes progressRing {
  to {
    stroke-dashoffset: 0;
  }
}

/* 拖拽过程中禁用动画，防止计算抖动 */
.tier-row.no-transition .tier-item {
  transition: none !important;
}

/* 角色条目：保持与普通条目相同的尺寸 */

.tier-item:hover:not(.empty) {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
}

.tier-item.empty {
  border: var(--size-border-width-empty-item, 2px) dashed var(--border-light-color);
  cursor: pointer;
  order: 9999; /* 确保空位始终在最后 */
}

/* 当隐藏作品名时，调整作品项高度（排除空位） */
.tier-item.hide-name:not(.empty) {
  height: var(--size-item-height-hide-name, 133px) !important;
}

/* 当隐藏作品名时，空位也只显示占位符部分（封面） */
.tier-item.empty.hide-name {
  height: var(--size-item-height-hide-name, 133px) !important;
}

/* 重复条目的红色高亮 */
.tier-item.duplicate {
  border: var(--size-border-width-item-duplicate, 3px) solid #ff0000 !important;
  box-shadow: 0 0 8px rgba(255, 0, 0, 0.5);
}

/* 拖动时原位置的半透明样式 (Dragula: gu-transit) */
.tier-item.gu-transit {
  opacity: 0.4;
}

/* 拖动中跟随鼠标的条目样式 (Dragula: gu-mirror) */
.tier-item.gu-mirror {
  opacity: 1 !important;
  transform: rotate(5deg);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
  z-index: 9999;
  pointer-events: none;
}

/* 拖动中的条目不显示进度条 */
.tier-item.gu-mirror .long-press-loader {
  display: none !important;
}

/* 选中时的样式 */
.tier-item:active {
  cursor: grabbing;
}

.item-image-container {
  width: var(--size-image-width, 100px); /* 固定宽度 */
  /* 如果设置了 aspect-ratio，优先使用它控制比例 */
  height: var(--size-image-height, auto);
  position: relative; /* Add relative position for absolute children */
  aspect-ratio: var(--size-image-aspect-ratio, auto);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-light-color);
}

.item-image {
  width: var(--size-image-width, 100px); /* 固定宽度 */
  height: 100%; /* 高度跟随容器 */
  object-fit: cover; /* 使用 cover 模式，由 JavaScript 动态设置 object-position */
  object-position: center; /* 默认居中，JavaScript 会根据宽高比调整 */
  display: block;
}


.item-image.clickable {
  cursor: pointer;
}

.item-image.clickable:hover {
  opacity: 0.8;
}

.item-placeholder {
  width: 100%;
  height: var(--size-image-height, 133px);
  /* min-height: var(--size-image-height, 133px); */
  aspect-ratio: var(--size-image-aspect-ratio, auto);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-light-color);
}

.placeholder-text {
  font-size: var(--size-placeholder-font-size, 32px);
  color: var(--border-light-color);
  font-weight: bold;
}

.item-name {
  height: var(--size-item-name-height, 40px);
  padding: 4px;
  font-size: 12px;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  /* background: var(--bg-color); */
  border-top: none;
}

.delete-btn {
  position: absolute;
  top: var(--size-delete-btn-offset, 4px);
  right: var(--size-delete-btn-offset, 4px);
  width: var(--size-delete-btn-size, 20px);
  height: var(--size-delete-btn-size, 20px);
  border: 1px solid var(--border-color);
  background: var(--bg-color);
  color: var(--text-color);
  font-size: var(--size-delete-btn-font-size, 16px);
  font-weight: bold;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  opacity: 0;
  transition: all 0.2s;
  z-index: 10;
}

.tier-item:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  background: var(--border-color);
  color: var(--bg-color);
}

.long-press-loader {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.7);
  z-index: 20;
  pointer-events: none;
  color: var(--border-color);
}

/* 根据 data-theme 属性设置背景色 - 深色模式 */
[data-theme="dark"] .long-press-loader {
  background: rgba(26, 26, 26, 0.7);
}

/* 当 data-theme="auto" 且系统为深色模式时 */
@media (prefers-color-scheme: dark) {
  [data-theme="auto"] .long-press-loader {
    background: rgba(26, 26, 26, 0.7);
  }
}

.progress-ring {
  width: 60px;
  height: 60px;
}

.progress-ring-circle {
  transition: stroke-dashoffset 0.05s linear;
}
</style>
