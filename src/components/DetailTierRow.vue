
<script setup lang="ts">
import { computed, ref } from 'vue'
import RichTextEditor from './RichTextEditor.vue'
import { getSize, getSetting } from '../utils/configManager'
import { getItemUrl } from '../utils/url'
import { adaptCropToRatio, normalizeCropResolution } from '../utils/cropUtils'
import { DetailViewCropStrategy } from '../strategies/cropStrategy'
import type { AnimeItem } from '../types'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps<{
  item: AnimeItem
  tierId: string
  index: number
  isExporting?: boolean
}>()

const emit = defineEmits<{
  'update-comment': [index: number, comment: string]
  'update-left-content': [index: number, leftContent: string]
  'delete-item': [index: number]
  'edit-item': [item: AnimeItem, index: number, isLongPress?: boolean]
}>()

// Crop strategy for detail view
const cropStrategy = new DetailViewCropStrategy()

// Long press logic
const pressing = ref(false)
let longPressTimer: ReturnType<typeof setTimeout> | null = null

function handlePointerDown(event: PointerEvent) {
  if (event.button !== 0) return // Only left click
  if (props.isExporting) return

  pressing.value = true
  
  longPressTimer = setTimeout(() => {
    emit('edit-item', props.item, props.index, true)
    pressing.value = false
    longPressTimer = null
  }, 500)
}

function handlePointerUp() {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
  pressing.value = false
}

function handlePointerLeave() {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
  pressing.value = false
}

// Shared calculation
const dimensionStyles = computed(() => {
  return cropStrategy.getContainerDimensions()
})

const containerStyle = computed(() => {
   const { width, height } = dimensionStyles.value
   return {
      width: `${width}px`,
      height: `${height}px`
   }
})

const fontConfig = computed(() => {
  const titleSize = getSize('detail-title-font-size')
  const textSize = getSize('detail-text-font-size')
  
  return {
    title: titleSize ? `${titleSize}px` : '24px', // Default from config.yaml
    text: Number(textSize) || 16 // RichTextEditor expects number
  }
})

const rightColumnStyle = computed(() => {
   const { width } = dimensionStyles.value
   // left padding 12px + gap 16px + width
   const leftOffset = 12 + width + 16
   return {
      position: 'absolute',
      top: '12px',
      bottom: '12px',
      right: '12px',
      left: `${leftOffset}px`,
      overflowY: 'hidden' // Let RichTextEditor handle scroll, but constrain container
   }
})

function getImageStyle() {
  return cropStrategy.getImageStyle(props.item)
}

function handleImageLoad(event: Event) {
  const img = event.target as HTMLImageElement
  const itemId = img.getAttribute('data-item-id')
  // We can just update prop item since it is an object reference?
  // Props are readonly. But item properties might be mutable if it is a reactive object passed down.
  // In Vue props are readonly, but if item is an object, mutating its properties is technically possible but anti-pattern.
  // However validation might fail.
  // TierRow modifies item.naturalWidth.
  // We should rely on the fact that 'item' is the same object reference from store.
  
  if (props.item) {
     props.item.naturalWidth = img.naturalWidth
     props.item.naturalHeight = img.naturalHeight
  }
}

const itemUrl = computed(() => getItemUrl(props.item))

function handleCommentUpdate(html: string) {
  emit('update-comment', props.index, html)
}

function handleLeftContentUpdate(html: string) {
  emit('update-left-content', props.index, html)
}

function handleDelete(e: Event) {
  e.stopPropagation()
  emit('delete-item', props.index)
}

function handleLinkClick() {
  if (itemUrl.value) {
    window.open(itemUrl.value, '_blank')
  }
}
</script>

<template>
  <div class="detail-row">
    <!-- 左侧：图片 + 左侧富文本 -->
    <div 
      class="detail-left"
      @pointerdown="handlePointerDown"
      @pointerup="handlePointerUp"
      @pointerleave="handlePointerLeave"
      :style="{ width: containerStyle.width }"
    >
      <div class="image-container" :style="containerStyle">
        <img
          v-if="item.image"
          :src="item.image as string"
          :alt="item.name || ''"
          class="detail-image"
          :data-item-id="item.id || ''"
          @load="handleImageLoad"
          :style="getImageStyle()"
        />
        <div v-else class="image-placeholder">
          <span>无图片</span>
        </div>
        
        <!-- 长按加载动画 -->
        <div v-if="pressing" class="long-press-overlay">
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
        <!-- 删除按钮移动到图片右上角 -->
        <button
          v-if="!props.isExporting"
          class="delete-btn"
          @click="handleDelete"
          :title="t('tierRow.delete')"
        >×</button>
      </div>
      
      <!-- 此处为标题区域 -->
      <div class="left-info">
        <h3 class="item-title" :style="{ fontSize: fontConfig.title }">{{ item.name }}</h3>
        <div class="item-meta">
          <span v-if="item.date" class="meta-tag">{{ item.date }}</span>
          <span v-if="item.score" class="meta-tag">⭐{{ item.score }}</span>
        </div>
      </div>


      <!-- 预留左侧 slot -->
      <slot name="detail-left-extra" />
    </div>

    <!-- 右侧：评论 -->
    <div class="detail-right" :style="rightColumnStyle as any">
      <!-- 右侧富文本评论编辑器 -->
      <div class="comment-section">
        <RichTextEditor :hide-toolbar="true"
          :model-value="item.comment || ''"
          :placeholder="t('detailView.commentPlaceholder') || '写下你的评价...'"
          :readonly="props.isExporting"
          :font-size="fontConfig.text"
          :fill-height="true"
          @update:model-value="handleCommentUpdate"
        />
      </div>

      <!-- 预留右侧 slot -->
      <slot name="detail-right-extra" />
    </div>
  </div>
</template>

<style scoped>
.detail-row {
  position: relative; /* Context for absolute right column */
  display: flex;
  gap: 16px;
  padding: 12px;
  border-bottom: 1px solid var(--border-light-color, #eee);
  background: var(--bg-color, #fff);
  transition: background 0.2s;
}

.detail-row:hover {
  background: var(--bg-light-color, #f9f9f9);
}

/* 左侧 */
.detail-left {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: auto; /* Let image container dictate width, or config width */
  position: relative;
  cursor: pointer;
}

.image-container {
  overflow: hidden;
  border-radius: 4px;
  background: var(--bg-light-color, #f0f0f0);
  position: relative;
  width: 100%;
}

.image-container:hover .delete-btn {
  opacity: 1;
}

.left-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
  text-align: center;
}

.item-title {
  margin: 0;
  font-size: 15px;
  font-weight: bold;
  color: var(--text-color, #333);
  word-break: break-word;
}

.item-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
}

.meta-tag {
  font-size: 12px;
  color: var(--text-color, #888);
}

.detail-image {
  display: block;
  border-radius: 4px;
  width: 100%;
  height: auto;
  object-fit: cover;
}

.image-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--border-light-color, #aaa);
  font-size: 14px;
  border-radius: 4px;
  width: 100%;
  aspect-ratio: 0.75;
}

.delete-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  border: 1px solid var(--border-color, #ccc);
  background: var(--bg-color, #fff);
  color: var(--text-color, #333);
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  border-radius: 0; /* Match TierRow style more closely or keep rounded? TierRow has no border-radius set */
  opacity: 0;
  transition: all 0.2s;
  z-index: 10;
}

.delete-btn:hover {
  background: var(--border-color, #ccc);
  color: var(--bg-color, #fff);
}

/* 右侧 */
.detail-right {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.comment-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.long-press-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  pointer-events: none;
}

.progress-ring {
  width: 50px;
  height: 50px;
}

.progress-ring-circle {
  stroke-dasharray: 75.4; /* 2 * PI * 12 ≈ 75.4 */
  stroke-dashoffset: 75.4;
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
</style>
