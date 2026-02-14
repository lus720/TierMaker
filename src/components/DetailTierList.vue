<script setup lang="ts">
import { computed } from 'vue'
import DetailTierRow from './DetailTierRow.vue'
import { getContrastColor } from '../utils/colors'
import type { Tier, TierConfig, AnimeItem } from '../types'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps<{
  tiers: Tier[]
  tierConfigs: TierConfig[]
  isExporting?: boolean
  hideTierLabels?: boolean
}>()

const emit = defineEmits<{
  'update-comment': [tierId: string, rowId: string, index: number, comment: string]
  'update-left-content': [tierId: string, rowId: string, index: number, leftContent: string]
  'delete-item': [tierId: string, rowId: string, index: number]
  'edit-item': [tierId: string, rowId: string, item: AnimeItem, index: number, isLongPress?: boolean]
}>()

const visibleTiers = computed(() => props.tiers.filter(t => t.rows.some(r => r.items.length > 0)))

function getTierConfig(tierId: string): TierConfig | undefined {
  return props.tierConfigs.find(c => c.id === tierId)
}

function handleUpdateComment(tierId: string, rowId: string, index: number, comment: string) {
  emit('update-comment', tierId, rowId, index, comment)
}

function handleUpdateLeftContent(tierId: string, rowId: string, index: number, leftContent: string) {
  emit('update-left-content', tierId, rowId, index, leftContent)
}

function handleDeleteItem(tierId: string, rowId: string, index: number) {
  emit('delete-item', tierId, rowId, index)
}

function handleEditItem(tierId: string, rowId: string, item: AnimeItem, index: number, isLongPress?: boolean) {
  emit('edit-item', tierId, rowId, item, index, isLongPress)
}
</script>

<template>
  <div class="detail-tier-list">
    <div
      v-for="tier in visibleTiers"
      :key="tier.id"
      class="detail-tier-group"
    >
      <!-- Tier 标签 -->
      <div
        v-if="!props.hideTierLabels"
        class="detail-tier-label"
        :style="{
          backgroundColor: getTierConfig(tier.id)?.color || '#000000',
          color: getContrastColor(getTierConfig(tier.id)?.color || '#000000'),
        }"
      >
        <span class="detail-tier-label-text">
          {{ getTierConfig(tier.id)?.label || tier.id }}
        </span>
      </div>

      <!-- 作品列表 -->
      <div class="detail-tier-items">
        <template v-for="row in tier.rows" :key="row.id">
          <DetailTierRow
            v-for="(item, index) in row.items"
            :key="item.uuid || `${item.id}-${index}`"
            :item="item"
            :tier-id="tier.id"
            :index="index"
            :is-exporting="props.isExporting"
            @update-comment="(idx, comment) => handleUpdateComment(tier.id, row.id, idx, comment)"
            @update-left-content="(idx, content) => handleUpdateLeftContent(tier.id, row.id, idx, content)"
            @delete-item="(idx) => handleDeleteItem(tier.id, row.id, idx)"
            @edit-item="(item, idx, longPress) => handleEditItem(tier.id, row.id, item, idx, longPress)"
          />
        </template>


      </div>
    </div>
  </div>
</template>

<style scoped>
.detail-tier-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.detail-tier-group {
  border-top: 2px solid var(--border-color);
}

.detail-tier-group:first-child {
  border-top: none;
}

.detail-tier-label {
  padding: 10px 16px;
  font-weight: bold;
}

.detail-tier-label-text {
  font-size: 18px;
  letter-spacing: 1px;
}

.detail-tier-items {
  display: flex;
  flex-direction: column;
}

.detail-empty-state {
  padding: 24px;
  text-align: center;
  color: var(--border-light-color, #aaa);
  font-size: 14px;
  font-style: italic;
}
</style>
