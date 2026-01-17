<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { registerContainer, unregisterContainer } from '../utils/dragManager'
import SearchModal from './SearchModal.vue'
import type { AnimeItem } from '../types'

const props = defineProps<{
  items: AnimeItem[]
  isDragging?: boolean
  hideItemNames?: boolean
}>()

const emit = defineEmits<{
  'add-item': []
  'delete-item': [index: number]
  'move-item': [data: {
    fromTierId: string
    fromRowId: string
    fromIndex: number
    toTierId: string
    toRowId: string
    toIndex: number
    item: AnimeItem
  }]
  'reorder': [newItems: AnimeItem[]]
  'drag-start': []
  'drag-end': []
}>()

const candidatesElement = ref<HTMLElement | null>(null)
const showSearch = ref(false)

const displayItems = computed(() => {
  return [...props.items]
})

function handleSelectAnime(anime: AnimeItem) {
  emit('reorder', [...props.items, anime])
  showSearch.value = false
}

function handleSelectMultiple(animes: AnimeItem[]) {
  // 批量添加所有角色到备选框
  emit('reorder', [...props.items, ...animes])
  showSearch.value = false
}

function handleItemDelete(index: number, event: Event) {
  event.stopPropagation()
  const newItems = [...props.items]
  newItems.splice(index, 1)
  emit('reorder', newItems)
}

function handleClearAll() {
  emit('reorder', [])
}

function getImageUrl(item: AnimeItem): string {
  // 直接返回图片URL，如果没有则返回空字符串
  return item.image || ''
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
  // 只处理文件拖放，不影响 Dragula 的内部拖动
  if (event.dataTransfer?.types.includes('Files')) {
    event.preventDefault()
    event.stopPropagation()
  }
}

function handleDragEnter(event: DragEvent) {
  // 只处理文件拖放，不影响 Dragula 的内部拖动
  if (event.dataTransfer?.types.includes('Files')) {
    event.preventDefault()
    event.stopPropagation()
  }
}

function handleDragLeave(event: DragEvent) {
  // 只处理文件拖放，不影响 Dragula 的内部拖动
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
  
  // 处理所有拖放的文件
  const newItems: AnimeItem[] = []
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const item = await processFile(file)
    if (item) {
      newItems.push(item)
    }
  }
  
  // 批量添加所有文件
  if (newItems.length > 0) {
    emit('reorder', [...props.items, ...newItems])
  }
}

function handleImageError(event: Event) {
  const img = event.target as HTMLImageElement
  img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2VlZSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj7lm77niYfliqDovb3lpLHotKU8L3RleHQ+PC9zdmc+'
}

// Dragula drop 处理函数
function handleDrop(el: Element, target: Element, source: Element, sibling: Element | null) {
  const sourceRowId = source.getAttribute('data-row-id')
  const targetRowId = target.getAttribute('data-row-id')
  
  if (!sourceRowId || !targetRowId) return
  
  // 计算新位置索引
  let newIndex = 0
  if (sibling) {
    const children = Array.from(target.children).filter(c => !c.classList.contains('gu-transit'))
    newIndex = children.indexOf(sibling)
    if (newIndex === -1) newIndex = children.length
  } else {
    const children = Array.from(target.children).filter(c => !c.classList.contains('gu-transit'))
    newIndex = children.length
  }
  
  // 获取被拖动元素的原始索引
  const itemId = el.getAttribute('data-item-id')
  const oldIndex = props.items.findIndex(item => String(item.id) === itemId)
  
  // 如果是从我们这里拖走的（到其他容器）
  if (sourceRowId === 'candidates' && targetRowId !== 'candidates') {
    if (oldIndex >= 0) {
      const movedItem = props.items[oldIndex]
      emit('move-item', {
        fromTierId: 'candidates',
        fromRowId: 'candidates',
        fromIndex: oldIndex,
        toTierId: '',
        toRowId: targetRowId,
        toIndex: newIndex,
        item: movedItem,
      })
    }
    return
  }
  
  // 如果是同一容器内的重排序
  if (sourceRowId === 'candidates' && targetRowId === 'candidates') {
    if (oldIndex >= 0 && oldIndex !== newIndex) {
      const items = [...props.items]
      const targetIndex = Math.min(newIndex, items.length - 1)
      const [moved] = items.splice(oldIndex, 1)
      items.splice(targetIndex, 0, moved)
      emit('reorder', items)
    }
  }
}

onMounted(() => {
  if (candidatesElement.value) {
    // 注册到共享 Dragula 管理器
    registerContainer('candidates', candidatesElement.value, {
      containerId: 'candidates',
      onDrop: handleDrop,
      onDragStart: () => {
        emit('drag-start')
      },
      onDragEnd: () => {
        emit('drag-end')
      }
    })
  }
})

onBeforeUnmount(() => {
  // 从共享 Dragula 管理器注销
  unregisterContainer('candidates')
})
</script>

<template>
  <div class="candidates-box">
    <div class="candidates-header">
      <h3 class="candidates-title">备选作品</h3>
      <div class="header-buttons">
        <button 
          v-if="displayItems.length > 0"
          class="btn-clear" 
          @click="handleClearAll" 
          title="清空备选选项"
        >
          清空
        </button>
        <button class="btn-add" @click="showSearch = true" title="添加作品">
          + 添加
        </button>
      </div>
    </div>
    <div
      ref="candidatesElement"
      class="candidates-grid"
      data-row-id="candidates"
      @dragover="handleDragOver"
      @dragenter="handleDragEnter"
      @dragleave="handleDragLeave"
      @drop="handleFileDrop"
    >
      <div
        v-for="(item, index) in displayItems"
        :key="item.id || index"
        class="candidate-item"
        :data-item-id="item.id || ''"
      >
        <img
          :src="getImageUrl(item)"
          :alt="item.name"
          class="candidate-image"
          @error="handleImageError"
        />
        <div v-if="!hideItemNames" class="candidate-info">
          <div class="candidate-name">
            {{ item.name_cn || item.name }}
          </div>
        </div>
        <button
          class="delete-btn"
          @click="handleItemDelete(index, $event)"
          title="删除"
        >
          ×
        </button>
      </div>
      <div v-if="displayItems.length === 0" class="candidates-empty">
        点击"添加"按钮搜索并添加作品
      </div>
    </div>
    
    <SearchModal
      v-if="showSearch"
      :enable-import-characters="true"
      @close="showSearch = false"
      @select="handleSelectAnime"
      @select-multiple="handleSelectMultiple"
    />
  </div>
</template>

<style scoped>
.candidates-box {
  border: 2px solid var(--border-color);
  border-radius: 8px;
  margin: 20px 0;
  background: var(--bg-color);
}

.candidates-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 20px;
  border-bottom: 2px solid var(--border-color);
  background: var(--bg-light-color);
}

.candidates-title {
  font-size: 18px;
  font-weight: bold;
  color: var(--text-color);
  margin: 0;
}

.header-buttons {
  display: flex;
  gap: 10px;
  align-items: center;
}

.btn-add,
.btn-clear {
  padding: 8px 16px;
  border: 2px solid var(--border-color);
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
  border-radius: 4px;
}

.btn-add:hover {
  background: var(--border-color);
  color: var(--bg-color);
}

.btn-clear {
  border-color: #cc6666;
  color: #cc6666;
}

.btn-clear:hover {
  background: #cc6666;
  color: #ffffff;
}

.candidates-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 15px;
  min-height: 120px;
}

.candidate-item {
  position: relative;
  width: 100px;
  height: 173px;
  border: 2px solid var(--border-color);
  background: var(--bg-color);
  cursor: move;
  transition: all 0.2s;
  overflow: hidden;
}

.candidate-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
}

.candidate-item.hide-name {
  height: 133px !important;
}

.candidate-image {
  width: 100%;
  height: 133px;
  object-fit: cover;
  display: block;
}

.candidate-info {
  padding: 8px;
}

.candidate-name {
  font-size: 12px;
  font-weight: bold;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.delete-btn {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 24px;
  height: 24px;
  border: 2px solid var(--border-color);
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 18px;
  font-weight: bold;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s;
  line-height: 1;
  opacity: 0.8;
}

.delete-btn:hover {
  background: var(--border-color);
  color: var(--bg-color);
  opacity: 1;
}

.candidates-empty {
  width: 100%;
  text-align: center;
  padding: 40px;
  color: var(--text-secondary);
  font-size: 14px;
}

/* 拖动样式 (Dragula) */
.candidate-item.gu-transit {
  opacity: 0.4;
}

.candidate-item:active {
  cursor: grabbing;
}

.candidate-item.gu-mirror {
  opacity: 1 !important;
  transform: rotate(5deg);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
  z-index: 9999;
  pointer-events: none;
}
</style>

