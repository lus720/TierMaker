<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { registerContainer, unregisterContainer, startDrag, cancelDrag } from '../utils/dragManager'
import { getItemUrl } from '../utils/url'
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

const displayItems = computed(() => {
  const items = [...props.row.items]
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

onBeforeUnmount(() => {
  unregisterContainer(props.rowId)
  // 如果还有其他清理逻辑
})

// ensureEmptySlotLast 不需要了，因为我们通过 displayItems 和 CSS order 控制
// 或者我们需要保留它以确保 placeholder 不会搞乱顺序？
// placeholder 是由 dragManager 控制插入 DOM 的。
// 当 drop 后，DOM 会被 component re-render 覆盖。
// 所以不需要手动 DOM 操作。

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

function handleItemDelete(index: number, e: Event) {
  e.stopPropagation()
  emit('delete-item', index)
}

function handleImageLoad(event: Event) {
  const img = event.target as HTMLImageElement
  
  const itemId = img.getAttribute('data-item-id')
  const item = itemId ? props.row.items.find(i => String(i.id) === String(itemId)) : null
  const cropPosition = item?.cropPosition || 'auto'
  
  console.log('🖼️ handleImageLoad 被调用:', {
    itemId,
    itemName: item?.name,
    cropPosition,
    isCustomPosition: typeof cropPosition === 'object' && cropPosition !== null && 'sourceX' in cropPosition,
    imgSrc: img.src,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    allItemIds: props.row.items.map(i => String(i.id))
  })
  
  // 统一处理所有图片，使用相同的裁剪规则
  // 目标宽高比 target = 0.75 (3:4)，容器尺寸 100px × 133px
  const targetAspectRatio = 0.75 // 3/4
  const containerWidth = 100
  const containerHeight = 133
  const naturalAspectRatio = img.naturalWidth / img.naturalHeight
  
  // ✅ 如果已经是裁剪后的 dataURL，就不要再裁一次（避免二次 load 循环）
  if (img.dataset.cropped === '1') {
    console.log('✅ 图片已裁剪，跳过处理')
    return
  }
  
  // ✅ 如果裁剪位置是自定义坐标对象，使用 canvas 裁剪
  if (typeof cropPosition === 'object' && cropPosition !== null && 'sourceX' in cropPosition) {
    console.log('✅ 检测到自定义坐标，开始裁剪:', {
      itemId,
      cropPosition,
      currentSrc: img.src
    })
    
    // ✅ 永远用原始 src 来裁剪（不要用 img.src，因为 img.src 会被改成 dataURL）
    const originalSrc = img.getAttribute('data-original-src') || img.currentSrc || img.src
    
    console.log('✅ 使用原始图片地址裁剪:', originalSrc)
    
    // 使用 canvas 裁剪图片（需要重新加载图片以设置 crossOrigin）
    cropImageWithCanvasForDisplay(originalSrc, cropPosition).then((dataUrl) => {
      if (!dataUrl) return
      
      console.log('✅ 裁剪成功，更新图片 src')
      img.dataset.cropped = '1' // ✅ 打标记，防止二次裁剪
      img.src = dataUrl // ✅ 替换为裁剪后的图
      // 确保图片尺寸正确
      img.style.width = `${containerWidth}px`
      img.style.height = `${containerHeight}px`
      img.style.objectFit = 'none' // 使用 none 模式，因为已经是裁剪后的图片
    }).catch((error) => {
      console.error('❌ 裁剪图片失败（可能是 CORS 问题）:', {
        error,
        imageSrc: originalSrc,
        itemId,
        itemName: item?.name
      })
      
      // 如果裁剪失败，使用 object-position 回退方案
      // ⚠️ 注意：这不是精确的，导出时可能仍会有偏差
      img.style.objectFit = 'cover'
      img.style.width = `${containerWidth}px`
      img.style.height = `${containerHeight}px`
      
      // 根据自定义坐标计算 object-position（使用正确的 maxX/maxY 映射）
      const { sourceX, sourceY, sourceWidth, sourceHeight } = cropPosition
      const naturalWidth = img.naturalWidth
      const naturalHeight = img.naturalHeight
      
      if (naturalWidth && naturalHeight) {
        // ✅ 修复：使用可移动范围计算百分比，避免"向中心偏移"
        // object-fit: cover 时，图片会被缩放，我们需要计算在缩放后的图片中，裁剪区域的位置
        const targetAspectRatio = containerWidth / containerHeight // 0.75
        
        // 计算图片在 cover 模式下的实际显示尺寸
        let displayedWidth = naturalWidth
        let displayedHeight = naturalHeight
        let offsetX = 0
        let offsetY = 0
        
        if (naturalWidth / naturalHeight > targetAspectRatio) {
          // 图片较宽，高度填满，宽度超出
          displayedHeight = containerHeight
          displayedWidth = naturalWidth * (containerHeight / naturalHeight)
          offsetX = (displayedWidth - containerWidth) / 2
        } else {
          // 图片较高，宽度填满，高度超出
          displayedWidth = containerWidth
          displayedHeight = naturalHeight * (containerWidth / naturalWidth)
          offsetY = (displayedHeight - containerHeight) / 2
        }
        
        // 计算裁剪区域在缩放后图片中的位置
        const scaleX = displayedWidth / naturalWidth
        const scaleY = displayedHeight / naturalHeight
        const scaledSourceX = sourceX * scaleX
        const scaledSourceY = sourceY * scaleY
        const scaledSourceWidth = sourceWidth * scaleX
        const scaledSourceHeight = sourceHeight * scaleY
        
        // 计算裁剪区域中心点相对于缩放后图片的位置
        const cropCenterX = scaledSourceX + scaledSourceWidth / 2
        const cropCenterY = scaledSourceY + scaledSourceHeight / 2
        
        // 计算可移动范围
        const maxX = Math.max(0, displayedWidth - containerWidth)
        const maxY = Math.max(0, displayedHeight - containerHeight)
        
        // 计算百分比（相对于可移动范围）
        const xPercent = maxX === 0 ? 50 : ((cropCenterX - containerWidth / 2) / maxX) * 100
        const yPercent = maxY === 0 ? 50 : ((cropCenterY - containerHeight / 2) / maxY) * 100
        
        // 限制在 0-100% 范围内
        const clampedXPercent = Math.max(0, Math.min(100, xPercent))
        const clampedYPercent = Math.max(0, Math.min(100, yPercent))
        
        img.style.objectPosition = `${clampedXPercent}% ${clampedYPercent}%`
        
        console.warn('⚠️ 使用 object-position 回退方案（不精确，导出可能仍有偏差）:', { 
          xPercent: clampedXPercent, 
          yPercent: clampedYPercent,
          originalXPercent: xPercent,
          originalYPercent: yPercent,
          cropCenterX,
          cropCenterY,
          displayedWidth,
          displayedHeight,
          maxX,
          maxY,
          naturalWidth,
          naturalHeight,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight
        })
      }
    })
    return
  }
  
  // 统一使用 cover 模式
  img.style.objectFit = 'cover'
  img.style.width = `${containerWidth}px`
  img.style.height = `${containerHeight}px`
  
  // 根据保存的裁剪位置或自动判断
  if (cropPosition === 'auto') {
    // 自动模式：根据宽高比设置不同的裁剪位置
    if (naturalAspectRatio > targetAspectRatio) {
      // s > 0.75：图片较宽，居中裁剪
      img.style.objectPosition = 'center center'
    } else {
      // s < 0.75：图片较高，保留顶部
      img.style.objectPosition = 'center top'
    }
  } else if (typeof cropPosition === 'string') {
    // 使用保存的预设裁剪位置
    img.style.objectPosition = cropPosition
  }
}

function getCorsProxyUrl(url: string): string {
  if (!url) return ''
  if (url.includes('wsrv.nl')) return url
  if (url.includes('vndb.org') || url.includes('t.vndb.org')) {
    return url
  }
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&output=png`
}

// 使用 canvas 裁剪图片用于显示（自定义坐标）
async function cropImageWithCanvasForDisplay(
  imageSrc: string,
  cropPosition: { sourceX: number; sourceY: number; sourceWidth: number; sourceHeight: number }
): Promise<string | null> {
  const { sourceX, sourceY, sourceWidth, sourceHeight } = cropPosition
  const containerWidth = 100
  const containerHeight = 133
  
  console.log('🎨 开始裁剪图片:', {
    imageSrc,
    cropPosition: { sourceX, sourceY, sourceWidth, sourceHeight },
    targetSize: { containerWidth, containerHeight }
  })
  
  return new Promise((resolve, reject) => {
    // 创建新的 Image 对象，设置 crossOrigin 以避免 CORS 问题
    const img = new Image()
    img.crossOrigin = 'anonymous'
    
    // ✅ 使用 CORS 代理 URL 来解决跨域问题
    const proxyUrl = getCorsProxyUrl(imageSrc)
    console.log('🔗 使用 CORS 代理:', { original: imageSrc, proxy: proxyUrl })
    
    img.onload = () => {
      console.log('✅ 图片加载成功，开始裁剪:', {
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        cropArea: { sourceX, sourceY, sourceWidth, sourceHeight },
        proxyUrl,
        originalUrl: imageSrc
      })
      
      try {
        const canvas = document.createElement('canvas')
        canvas.width = containerWidth
        canvas.height = containerHeight
        const ctx = canvas.getContext('2d')
        
        if (!ctx) {
          reject(new Error('无法获取 canvas context'))
          return
        }
        
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        
        ctx.drawImage(
          img,
          Math.round(sourceX), Math.round(sourceY), Math.round(sourceWidth), Math.round(sourceHeight),
          0, 0, containerWidth, containerHeight
        )
        
        // 返回裁剪后的base64
        const dataUrl = canvas.toDataURL('image/png', 1.0)
        console.log('✅ 裁剪完成，生成 data URL，长度:', dataUrl.length)
        resolve(dataUrl)
      } catch (error) {
        console.error('❌ 裁剪过程中出错:', error)
        reject(error)
      }
    }
    
    img.onerror = (error) => {
      console.error('❌ 图片加载失败（可能是 CORS 或网络问题）:', {
        error,
        originalUrl: imageSrc,
        proxyUrl
      })
      reject(new Error('图片加载失败'))
    }
    
    // 加载图片（使用 CORS 代理 URL）
    img.src = proxyUrl
  })
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

// 处理图片点击跳转
function handleImageClick(item: AnimeItem, e: MouseEvent) {
  // 右键点击或 Ctrl/Cmd+点击直接跳转
  if (e.ctrlKey || e.metaKey || e.button === 2) {
    e.preventDefault()
    e.stopPropagation()
    const url = getItemUrl(item)
    if (url) {
      window.open(url, '_blank')
    }
    return
  }
  
  // 双击跳转
  if (e.detail === 2) {
    e.preventDefault()
    e.stopPropagation()
    const url = getItemUrl(item)
    if (url) {
      window.open(url, '_blank')
    }
  }
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
    
    // 读取文件并转换为 base64
    const reader = new FileReader()
    reader.onload = (e) => {
      const result = e.target?.result as string
      
      // 使用文件名（去掉扩展名）作为作品名
      const fileName = file.name.replace(/\.[^/.]+$/, '')
      
      // 生成唯一的 ID
      const itemId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      
      const anime: AnimeItem = {
        id: itemId,
        name: fileName || '未命名作品',
        image: result,
        originalImage: result,
      }
      
      resolve(anime)
    }
    reader.onerror = () => {
      console.error('图片读取失败')
      resolve(null)
    }
    reader.readAsDataURL(file)
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
  >
    <div
      v-for="(item, index) in displayItems"
      :key="`${item.id || 'empty'}-${index}`"
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
          :key="`img-${item.id}-${JSON.stringify(item.cropPosition || 'auto')}`"
          :src="item.image"
          :data-original-src="item.image"
          :data-item-id="item.id || ''"
          :alt="item.name || ''"
          class="item-image"
          :class="{ 'clickable': getItemUrl(item) }"
          @click="handleImageClick(item, $event)"
          @contextmenu="handleImageClick(item, $event)"
          @error="handleImageError"
          @load="handleImageLoad"
          :title="getItemUrl(item) ? '双击或 Ctrl+点击或右键点击跳转到详情页' : ''"
        />
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
      
      <!-- 长按加载条 (圆形) -->
      <div 
        v-if="pressingItemId === item.id" 
        class="long-press-indicator-circle"
      >
        <svg viewBox="0 0 40 40" class="progress-ring">
          <circle
            class="progress-ring-circle"
            stroke="white"
            stroke-width="4"
            fill="transparent"
            r="16"
            cx="20"
            cy="20"
          />
        </svg>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tier-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  flex: 1;
  min-height: 120px;
  padding: 10px;
  background: var(--bg-color);
  align-self: stretch;
}

.tier-item {
  position: relative;
  width: 100px;
  height: 173px;
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
}

.progress-ring {
  display: block;
  width: 50px;
  height: 50px;
}

.progress-ring-circle {
  stroke-dasharray: 100.5; /* 2 * PI * 16 ≈ 100.5 */
  stroke-dashoffset: 100.5;
  stroke-linecap: round;
  transform: rotate(-90deg);
  transform-origin: 50% 50%;
  animation: progressRing 0.5s linear forwards;
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
  border: 2px dashed var(--border-light-color);
  cursor: pointer;
  order: 9999; /* 确保空位始终在最后 */
}

/* 当隐藏作品名时，调整作品项高度（排除空位） */
.tier-item.hide-name:not(.empty) {
  height: 133px !important;
}

/* 当隐藏作品名时，空位也只显示占位符部分（封面） */
.tier-item.empty.hide-name {
  height: 133px !important;
}

/* 重复条目的红色高亮 */
.tier-item.duplicate {
  border: 3px solid #ff0000 !important;
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
  width: 100px; /* 固定宽度 */
  height: 133px; /* 3:4 比例：100 * 4 / 3 = 133.33px */
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-light-color);
}

.item-image {
  width: 100px; /* 固定宽度 */
  height: 133px; /* 固定高度，与容器一致 */
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
  height: 133px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-light-color);
}

.placeholder-text {
  font-size: 32px;
  color: var(--border-light-color);
  font-weight: bold;
}

.item-name {
  height: 40px;
  padding: 4px;
  font-size: 12px;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  background: var(--bg-color);
  border-top: none;
}

.delete-btn {
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
