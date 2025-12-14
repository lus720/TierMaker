<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import Sortable from 'sortablejs'
import { getItemUrl } from '../utils/url'
import type { TierRow, AnimeItem } from '../types'

const props = defineProps<{
  row: TierRow
  tierId: string
  rowId: string
  isDragging?: boolean
  isExportingImage?: boolean
  duplicateItemIds?: Set<string | number>
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
let sortableInstance: Sortable | null = null

const displayItems = computed(() => {
  // 始终显示至少一个空位（包括导出图片时，以保持高度统一）
  const items = [...props.row.items]
  // 始终添加空位，即使在导出图片时也保留（在onclone中会处理）
  items.push({} as AnimeItem) // 添加空位用于添加新项
  return items
})

onMounted(() => {
  if (rowElement.value) {
    sortableInstance = new Sortable(rowElement.value, {
      animation: 150,
      // 移除 handle 选项，让整个 tier-item 都可以拖动（除了空位和删除按钮）
      filter: '.empty, .delete-btn', // 过滤空位和删除按钮
      group: {
        name: 'tier-items',
        pull: true, // 允许拖出
        put: true, // 允许放入
      },
      draggable: '.tier-item:not(.empty)', // 只有非空项可以拖动
      ghostClass: 'sortable-ghost', // 拖动时的半透明样式（原位置）
      chosenClass: 'sortable-chosen', // 选中时的样式
      dragClass: 'sortable-drag', // 拖动中的样式（跟随鼠标的）
      forceFallback: false, // 使用原生 HTML5 拖动
      fallbackOnBody: true,
      swapThreshold: 0.65,
      invertSwap: false, // 不反转交换
      preventOnFilter: true, // 过滤的元素阻止默认行为
      onMove: (evt) => {
        const related = evt.related as HTMLElement
        const to = evt.to as HTMLElement
        
        if (!related || !to) {
          return true
        }
        
        // 如果 related 是空位
        if (related.classList.contains('empty')) {
          // 如果尝试插入到空位之后，不允许
          if (evt.willInsertAfter) {
            return false
          }
          // 如果插入到空位之前，允许（预览位置会显示在空位之前）
          return true
        }
        
        // 允许移动到任何容器（包括其他等级）
        return true
      },
      onChange: (evt) => {
        // 在拖动过程中，确保空位始终在最后
        const to = evt.to as HTMLElement
        if (to) {
          ensureEmptySlotLast(to)
        }
      },
      onStart: (evt) => {
        // 拖动开始时，立刻终止所有长按并恢复到正常状态
        emit('drag-start')
        
        // 确保所有容器中的空位都在最后（包括当前容器和其他容器）
        const allTierRows = document.querySelectorAll('[data-row-id]')
        allTierRows.forEach(row => {
          ensureEmptySlotLast(row as HTMLElement)
        })
        
        // 清除所有项目的长按状态
        longPressTimers.value.forEach((timer, idx) => {
          clearTimeout(timer)
          cancelLongPress(idx)
        })
        longPressTimers.value.clear()
        longPressProgress.value.clear()
        progressIntervals.value.forEach((interval) => {
          clearInterval(interval)
        })
        progressIntervals.value.clear()
      },
      onEnd: (evt) => {
        emit('drag-end')
        const oldIndex = evt.oldIndex
        const newIndex = evt.newIndex
        const fromElement = evt.from as HTMLElement
        const toElement = evt.to as HTMLElement
        
        // 获取源和目标行的信息
        const fromRowId = fromElement.getAttribute('data-row-id')
        const toRowId = toElement.getAttribute('data-row-id')
        
        // 检查是否是真正的跨容器拖动
        const isCrossContainer = fromElement !== toElement
        
        if (oldIndex === undefined || newIndex === undefined) {
          // 确保空位在最后
          nextTick(() => {
            ensureEmptySlotLast(fromElement)
            ensureEmptySlotLast(toElement)
          })
          return
        }
        
        // 如果是跨容器拖动
        if (isCrossContainer && fromRowId && toRowId) {
          // 只在源行的 onEnd 中处理跨行拖动
          if (fromRowId === props.rowId) {
            // 确保索引有效（排除空位）
            const fromItems = props.row.items
            if (oldIndex >= 0 && oldIndex < fromItems.length) {
              const movedItem = fromItems[oldIndex]
              
              // 触发跨行拖动事件
              emit('move-item', {
                fromRowId,
                toRowId,
                fromIndex: oldIndex,
                toIndex: newIndex,
                item: movedItem,
              })
            }
          }
        } else if (!isCrossContainer && oldIndex !== newIndex && fromRowId === props.rowId) {
          // 同一行内拖动，只在当前行处理
          const fromItems = props.row.items
          if (oldIndex >= 0 && oldIndex < fromItems.length) {
            const items = [...fromItems]
            // 确保目标索引不超过实际项目数（排除空位）
            const targetIndex = Math.min(newIndex, items.length - 1)
            const [moved] = items.splice(oldIndex, 1)
            items.splice(targetIndex, 0, moved)
            emit('reorder', items)
          }
        }
        
        // 确保空位始终在最后（源和目标都要处理）
        nextTick(() => {
          ensureEmptySlotLast(fromElement)
          ensureEmptySlotLast(toElement)
        })
      },
    })
  }
})

onBeforeUnmount(() => {
  if (sortableInstance) {
    sortableInstance.destroy()
    sortableInstance = null
  }
})

// 确保空位在最后
function ensureEmptySlotLast(container: HTMLElement) {
  const items = Array.from(container.children) as HTMLElement[]
  const emptySlots = items.filter(item => item.classList.contains('empty'))
  const nonEmptyItems = items.filter(item => !item.classList.contains('empty'))
  
  // 将所有空位移到最后
  emptySlots.forEach(emptySlot => {
    container.appendChild(emptySlot)
  })
}

function handleItemClick(index: number) {
  // 如果刚刚触发了长按编辑，阻止点击事件
  if (justTriggeredLongPress.value.get(index)) {
    return
  }
  
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
  console.log('✅ 图片加载成功:', img.src)
  
  // 检查图片是否需要裁剪
  // 按3:4比例计算，宽度100px对应高度133.33px
  const targetHeight = 133.33
  const naturalAspectRatio = img.naturalWidth / img.naturalHeight
  const targetAspectRatio = 3 / 4 // 0.75
  
  if (naturalAspectRatio < targetAspectRatio) {
    // 图片更高（或更窄），按100px宽度缩放后高度会超过133px，需要裁剪
    img.style.objectFit = 'cover'
    img.style.width = '100px'
    img.style.height = '133px'
  } else {
    // 图片更宽（或更矮），按100px宽度缩放后高度不超过133px，不拉伸保持原样
    img.style.objectFit = 'contain'
    img.style.width = '100px'
    img.style.height = 'auto'
    img.style.maxHeight = '133px'
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
    // 如果是 AniDB，提取 AID
    if (itemId.startsWith('anidb_')) {
      const aid = itemId.replace('anidb_', '')
      errorInfo.aid = aid
      errorInfo.isAnidbImage = true
    }
  }
  
  // 尝试从 URL 中提取图片 ID（如果是 AniDB 图片）
  if (currentSrc.includes('anidb.net')) {
    const imageIdMatch = currentSrc.match(/images\/main\/(\d+)\.jpg/)
    if (imageIdMatch) {
      errorInfo.imageId = imageIdMatch[1]
    }
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

// 判断图片是否是 AniDB 图片
function isAnidbImage(url: string | null | undefined): boolean {
  if (!url) return false
  return url.includes('anidb.net')
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

// 长按检测
const longPressTimers = ref<Map<number, ReturnType<typeof setTimeout>>>(new Map())
const longPressProgress = ref<Map<number, number>>(new Map())
const progressIntervals = ref<Map<number, ReturnType<typeof setInterval>>>(new Map())
const justTriggeredLongPress = ref<Map<number, boolean>>(new Map())
const LONG_PRESS_DURATION = 800 // 长按持续时间（毫秒）
const PROGRESS_UPDATE_INTERVAL = 16 // 进度更新间隔（约 60fps）

function startLongPress(item: AnimeItem, index: number, _e: MouseEvent | TouchEvent) {
  if (!item.id || index === props.row.items.length) return
  
  // 清除之前的定时器
  cancelLongPress(index)
  
  // 初始化进度
  longPressProgress.value.set(index, 0)
  
  // 开始进度更新
  const startTime = Date.now()
  const progressInterval = setInterval(() => {
    const elapsed = Date.now() - startTime
    const progress = Math.min((elapsed / LONG_PRESS_DURATION) * 100, 100)
    longPressProgress.value.set(index, progress)
    
    // 如果已经取消，停止更新
    if (!longPressTimers.value.has(index)) {
      clearInterval(progressInterval)
      progressIntervals.value.delete(index)
      longPressProgress.value.delete(index)
    }
  }, PROGRESS_UPDATE_INTERVAL)
  
  progressIntervals.value.set(index, progressInterval)
  
  // 设置长按定时器
  const timer = setTimeout(() => {
    // 清除进度更新
    const interval = progressIntervals.value.get(index)
    if (interval) {
      clearInterval(interval)
      progressIntervals.value.delete(index)
    }
    longPressProgress.value.delete(index)
    longPressTimers.value.delete(index)
    
    // 标记刚刚触发了长按
    justTriggeredLongPress.value.set(index, true)
    setTimeout(() => {
      justTriggeredLongPress.value.delete(index)
    }, 100) // 100ms 后清除标志
    
    // 触发编辑事件，传递长按标志
    emit('edit-item', item, index, true) // 第三个参数表示是长按触发的
  }, LONG_PRESS_DURATION)
  
  longPressTimers.value.set(index, timer)
}

function cancelLongPress(index: number) {
  const timer = longPressTimers.value.get(index)
  if (timer) {
    clearTimeout(timer)
    longPressTimers.value.delete(index)
  }
  
  // 清除进度更新
  const interval = progressIntervals.value.get(index)
  if (interval) {
    clearInterval(interval)
    progressIntervals.value.delete(index)
  }
  
  // 立即清除进度显示
  longPressProgress.value.delete(index)
}

function handleMouseDown(item: AnimeItem, index: number, e: MouseEvent) {
  // 只处理有内容的项目（排除空位）
  if (e.button !== 0 || !item.id || index === props.row.items.length) {
    return
  }
  
  // 立即启动长按检测
  startLongPress(item, index, e)
}

function handleMouseUp(index: number, e: MouseEvent) {
  // 如果刚刚触发了长按，阻止点击事件
  if (justTriggeredLongPress.value.get(index)) {
    e.stopPropagation()
  } else {
    // 取消长按
    cancelLongPress(index)
  }
}

function handleMouseLeave(index: number) {
  // 鼠标离开时取消长按
  cancelLongPress(index)
}

function handleTouchStart(item: AnimeItem, index: number, e: TouchEvent) {
  if (item.id && index !== props.row.items.length) {
    // 立即启动长按检测
    startLongPress(item, index, e)
  }
}

function handleTouchEnd(index: number, e: TouchEvent) {
  // 如果刚刚触发了长按，阻止点击事件
  if (justTriggeredLongPress.value.get(index)) {
    e.preventDefault()
    e.stopPropagation()
  } else {
    // 取消长按
    cancelLongPress(index)
  }
}

function handleTouchCancel(index: number) {
  // 触摸取消时取消长按
  cancelLongPress(index)
}

function getLongPressProgress(index: number): number {
  return longPressProgress.value.get(index) || 0
}
</script>

<template>
  <div ref="rowElement" class="tier-row" :data-row-id="rowId">
    <div
      v-for="(item, index) in displayItems"
      :key="`${item.id || 'empty'}-${index}`"
      class="tier-item"
      :class="{ 
        'empty': !item.id,
        'duplicate': item.id && props.duplicateItemIds?.has(item.id)
      }"
      @click="handleItemClick(index)"
      @mousedown="handleMouseDown(item, index, $event)"
      @mouseup="handleMouseUp(index, $event)"
      @mouseleave="handleMouseLeave(index)"
      @touchstart="handleTouchStart(item, index, $event)"
      @touchend="handleTouchEnd(index, $event)"
      @touchcancel="handleTouchCancel(index)"
    >
      <div v-if="item.image" class="item-image-container">
        <img
          :src="item.image"
          :data-original-src="item.image"
          :data-item-id="item.id || ''"
          :alt="item.name || ''"
          class="item-image"
          :class="{ 'clickable': getItemUrl(item) }"
          :crossorigin="isAnidbImage(item.image) ? 'anonymous' : undefined"
          :referrerpolicy="isAnidbImage(item.image) ? 'no-referrer' : undefined"
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
      <div v-if="item.name" class="item-name">{{ item.name_cn || item.name }}</div>
      <!-- 长按加载条 -->
      <div
        v-if="item.id && getLongPressProgress(index) > 0 && !props.isDragging"
        class="long-press-loader"
      >
        <svg class="progress-ring" viewBox="0 0 100 100">
          <circle
            class="progress-ring-circle"
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="#000000"
            stroke-width="5"
            :stroke-dasharray="`${2 * Math.PI * 45}`"
            :stroke-dashoffset="`${2 * Math.PI * 45 * (1 - getLongPressProgress(index) / 100)}`"
            transform="rotate(-90 50 50)"
          />
        </svg>
      </div>
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
  gap: 10px;
  flex: 1;
  min-height: 120px;
  padding: 10px;
  background: #ffffff;
  align-self: stretch;
}

.tier-item {
  position: relative;
  width: 100px;
  height: 173px;
  border: none;
  background: #ffffff;
  cursor: pointer;
  transition: all 0.2s;
  overflow: hidden;
}

.tier-item:hover:not(.empty) {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
}

.tier-item.empty {
  border: 2px dashed #cccccc;
  cursor: pointer;
  order: 9999; /* 确保空位始终在最后 */
}

/* 重复条目的红色高亮 */
.tier-item.duplicate {
  border: 3px solid #ff0000 !important;
  box-shadow: 0 0 8px rgba(255, 0, 0, 0.5);
}

/* 拖动时原位置的半透明样式 */
.tier-item.sortable-ghost {
  opacity: 0.4;
}

/* 拖动中跟随鼠标的条目样式 */
.tier-item.sortable-drag {
  opacity: 1 !important;
  transform: rotate(5deg);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
}

/* 拖动中的条目不显示进度条 */
.tier-item.sortable-drag .long-press-loader {
  display: none !important;
}

/* 选中时的样式 */
.tier-item.sortable-chosen {
  cursor: grabbing;
}

.item-image-container {
  width: 100px; /* 固定宽度 */
  height: 133px; /* 3:4 比例：100 * 4 / 3 = 133.33px */
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f5f5;
}

.item-image {
  width: 100px; /* 固定宽度 */
  height: auto;
  object-fit: contain; /* 默认不拉伸，保持原样 */
  object-position: center;
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
  background: #f5f5f5;
}

.placeholder-text {
  font-size: 32px;
  color: #cccccc;
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
  background: #ffffff;
  border-top: none;
}

.delete-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  border: 1px solid #000000;
  background: #ffffff;
  color: #000000;
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
  background: #000000;
  color: #ffffff;
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
  background: rgba(255, 255, 255, 0.9);
  z-index: 20;
  pointer-events: none;
}

.progress-ring {
  width: 60px;
  height: 60px;
}

.progress-ring-circle {
  transition: stroke-dashoffset 0.05s linear;
}
</style>
