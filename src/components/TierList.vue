<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue'
import TierRow from './TierRow.vue'
import type { Tier, TierConfig, AnimeItem } from '../types'

const props = defineProps<{
  tiers: Tier[]
  tierConfigs: TierConfig[]
  isDragging?: boolean
  isExportingImage?: boolean
  duplicateItemIds?: Set<string | number>
  hideItemNames?: boolean
  hideTierLabels?: boolean
}>()

// 暴露方法给父组件调用
defineExpose({
  updateLabelWidth: () => updateMaxLabelWidth()
})

const emit = defineEmits<{
  'add-item': [tierId: string, rowId: string, index: number]
  'add-row': [tierId: string]
  'delete-row': [tierId: string, rowId: string]
  'delete-item': [tierId: string, rowId: string, index: number]
  'edit-item': [tierId: string, rowId: string, item: AnimeItem, index: number, isLongPress?: boolean]
  'move-item': [data: {
    fromTierId: string
    fromRowId: string
    toTierId: string
    toRowId: string
    fromIndex: number
    toIndex: number
    item: AnimeItem
  }]
  'reorder': [tierId: string, rowId: string, newItems: AnimeItem[]]
  'drag-start': []
  'drag-end': []
}>()

const maxLabelWidth = ref<number>(0)

function getTierConfig(tierId: string): TierConfig | undefined {
  return props.tierConfigs.find(c => c.id === tierId)
}

function updateMaxLabelWidth() {
  nextTick(() => {
    requestAnimationFrame(() => {
      // 获取所有等级的配置（去重）
      const uniqueTierIds = [...new Set(props.tiers.map(t => t.id))]
      if (uniqueTierIds.length === 0) return
      
      // 获取一个实际的标签元素作为样式参考
      const sampleLabel = document.querySelector<HTMLElement>('.tier-label')
      const sampleText = document.querySelector<HTMLElement>('.tier-label-text')
      if (!sampleLabel || !sampleText) {
        // 如果 DOM 还没渲染，延迟重试
        setTimeout(updateMaxLabelWidth, 50)
        return
      }
      
      // 获取实际的样式值
      const containerStyle = window.getComputedStyle(sampleLabel)
      const textStyle = window.getComputedStyle(sampleText)
      const paddingLeft = parseFloat(containerStyle.paddingLeft) || 10
      const paddingRight = parseFloat(containerStyle.paddingRight) || 10
      const padding = paddingLeft + paddingRight
      
      // 创建临时文本元素来测量文本宽度
      const tempText = document.createElement('span')
      tempText.className = 'tier-label-text'
      // 应用相同的样式来准确测量文本宽度
      tempText.style.position = 'absolute'
      tempText.style.visibility = 'hidden'
      tempText.style.whiteSpace = 'nowrap'
      tempText.style.fontSize = textStyle.fontSize
      tempText.style.fontWeight = textStyle.fontWeight
      tempText.style.fontFamily = textStyle.fontFamily
      tempText.style.letterSpacing = textStyle.letterSpacing
      document.body.appendChild(tempText)
      
      let maxWidth = 0
      
      // 测量每个等级标签文本的宽度
      uniqueTierIds.forEach(tierId => {
        const config = props.tierConfigs.find(c => c.id === tierId)
        const labelText = config?.label || tierId
        const fontSize = config?.fontSize || 32
        
        // 应用该等级的字号
        tempText.style.fontSize = `${fontSize}px`
        
        // 设置文本内容并测量文本宽度
        tempText.textContent = labelText
        const textWidth = tempText.offsetWidth
        
        // 总宽度 = 文本宽度 + 左padding + 右padding
        const totalWidth = textWidth + padding
        
        if (totalWidth > maxWidth) {
          maxWidth = totalWidth
        }
      })
      
      // 清理临时元素
      document.body.removeChild(tempText)
      
      // 设置最大宽度（至少保留最小宽度 80px）
      maxLabelWidth.value = Math.max(maxWidth, 80)
    })
  })
}

onMounted(() => {
  updateMaxLabelWidth()
})

// 监听配置变化（包括 label 和 fontSize）
watch(() => props.tierConfigs.map(c => `${c.label}|${c.fontSize || 32}`).join('||'), updateMaxLabelWidth, { flush: 'post' })
</script>

<template>
  <div class="tier-list">
    <div
      v-for="tier in tiers"
      :key="tier.id"
      class="tier-group"
    >
      <div
        v-for="row in tier.rows"
        :key="row.id"
        class="tier-row-wrapper"
      >
        <div
          v-if="!props.hideTierLabels"
          class="tier-label"
          :style="{ 
            backgroundColor: getTierConfig(tier.id)?.color || '#000000',
            width: maxLabelWidth > 0 ? `${maxLabelWidth}px` : 'auto'
          }"
        >
          <span 
            class="tier-label-text"
            :style="{ fontSize: `${getTierConfig(tier.id)?.fontSize || 32}px` }"
          >{{ getTierConfig(tier.id)?.label || tier.id }}</span>
        </div>
        
        <TierRow
          :row="row"
          :tier-id="tier.id"
          :row-id="row.id"
          :is-dragging="props.isDragging"
          :is-exporting-image="props.isExportingImage"
          :duplicate-item-ids="props.duplicateItemIds"
          :hide-item-names="props.hideItemNames"
          @add-item="(index) => emit('add-item', tier.id, row.id, index)"
          @delete-item="(index) => emit('delete-item', tier.id, row.id, index)"
          @edit-item="(item, index, isLongPress) => emit('edit-item', tier.id, row.id, item, index, isLongPress)"
          @reorder="(newItems) => emit('reorder', tier.id, row.id, newItems)"
          @drag-start="() => emit('drag-start')"
          @drag-end="() => emit('drag-end')"
          @move-item="(data) => {
            // 需要找到源行和目标行所在的等级
            let fromTierId = tier.id
            let toTierId = tier.id
            
            // 查找源行和目标行所在的等级
            for (const t of props.tiers) {
              if (t.rows.find(r => r.id === data.fromRowId)) {
                fromTierId = t.id
              }
              if (t.rows.find(r => r.id === data.toRowId)) {
                toTierId = t.id
              }
            }
            
            emit('move-item', {
              fromTierId: fromTierId,
              fromRowId: data.fromRowId,
              toTierId: toTierId,
              toRowId: data.toRowId,
              fromIndex: data.fromIndex,
              toIndex: data.toIndex,
              item: data.item,
            })
          }"
        />
        
        <button
          v-if="tier.rows.length > 1"
          class="delete-row-btn"
          @click="emit('delete-row', tier.id, row.id)"
          title="删除此行"
        >
          ×
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tier-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.tier-group {
  display: flex;
  flex-direction: column;
  gap: 0;
  border-top: 2px solid var(--border-color);
}

.tier-group:first-child {
  border-top: none;
}

.tier-row-wrapper {
  display: flex;
  align-items: stretch;
  gap: 0;
  border-top: 1px solid var(--border-color);
}

.tier-row-wrapper:first-child {
  border-top: none;
}

/* 当隐藏作品名时，缩短行间距 */
.tier-group:has(.tier-item.hide-name) .tier-row-wrapper {
  border-top-width: 0;
  margin-top: -1px;
}

.tier-label {
  min-width: 80px; /* 最小宽度 */
  padding: 0 10px; /* 左右内边距，确保文字不贴边 */
  min-height: 120px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  background: var(--border-color);
  color: var(--bg-color);
  flex-shrink: 0;
  align-self: stretch;
  writing-mode: horizontal-tb; /* 强制容器内文字横排 */
  box-sizing: border-box; /* 确保 padding 包含在宽度内 */
}

.tier-label-text {
  font-size: 32px; /* 减小字体大小以适应横排 */
  font-weight: bold;
  color: var(--bg-color);
  writing-mode: horizontal-tb !important; /* 强制所有文字横排显示 */
  text-orientation: mixed !important; /* 确保文字方向正确 */
  white-space: nowrap; /* 防止换行 */
  text-align: center; /* 居中对齐 */
  line-height: 1.2; /* 设置行高 */
  display: block; /* 确保文字以块级元素显示 */
  transform: none !important; /* 确保没有旋转 */
  direction: ltr !important; /* 强制从左到右方向 */
  unicode-bidi: normal !important; /* 确保 Unicode 双向算法正常 */
  word-break: keep-all; /* 防止中文换行 */
  overflow-wrap: normal; /* 防止换行 */
}

.delete-row-btn {
  width: 30px;
  min-width: 30px;
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 24px;
  font-weight: bold;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;
}

.delete-row-btn:hover {
  background: var(--border-color);
  color: var(--bg-color);
}
</style>

