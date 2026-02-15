<script setup lang="ts">
import { onMounted, watch, nextTick } from 'vue'
import TierList from './components/TierList.vue'
import SearchModal from './components/SearchModal.vue'
import ConfigModal from './components/ConfigModal.vue'
import EditItemModal from './components/EditItemModal.vue'
import ImportModal from './components/ImportModal.vue'
import ExportModal from './components/ExportModal.vue'
import DetailTierList from './components/DetailTierList.vue'
import { useI18n } from 'vue-i18n'
import { initConfigStyles } from './utils/configManager'
import type { Tier, AnimeItem, TierConfig, ViewMode } from './types'
import type { ExportData } from './utils/storage'
import { useTierStore } from './composables/useTierStore'
import { useTierConfigStore } from './composables/useTierConfigStore'
import { useUIStore } from './composables/useUIStore'
import { useAppSettings } from './composables/useAppSettings'

const { t, locale } = useI18n()

// Initialize composables
const tierStore = useTierStore()
const tierConfigStore = useTierConfigStore()
const uiStore = useUIStore()
const appSettings = useAppSettings()

// Destructure for convenience
const { tiers, unrankedTiers, duplicateItemIds } = tierStore
const { tierConfigs } = tierConfigStore
const {
  showSearch,
  showConfig,
  showEditItem,
  showImportModal,
  showExportModal,
  showClearConfirm,
  currentTierId,
  currentRowId,
  currentIndex,
  currentEditItem,
  isLongPressEdit,
  isDragging,
  viewMode,
  toggleViewMode,
  tierListRef,
  titleRef,
  appContentRef,
  fileInputRef,
  configModalKey,
  isEditingTitle
} = uiStore
const {
  title,
  titleFontSize,
  hideItemNames,
  exportScale,
  detailExportScale
} = appSettings

// Initialize config styles and theme
onMounted(async () => {
  initConfigStyles()
  appSettings.initTheme()

  // Load data
  await tierStore.loadData()
  tierConfigStore.loadConfigs()

  // Sync tiers with configs
  tierStore.syncWithConfigs(tierConfigs.value)

  // Set title and other settings
  title.value = appSettings.title.value
  titleFontSize.value = appSettings.titleFontSize.value
  hideItemNames.value = appSettings.hideItemNames.value
  exportScale.value = appSettings.exportScale.value
  detailExportScale.value = appSettings.detailExportScale.value

  // Set title DOM content
  nextTick(() => {
    if (titleRef.value) {
      titleRef.value.textContent = title.value
    }
  })
})

// Watch for config modal close to update label width
watch(uiStore.showConfig, (newVal, oldVal) => {
  if (oldVal === true && newVal === false) {
    nextTick(() => {
      setTimeout(() => {
        tierListRef.value?.updateLabelWidth()
      }, 150)
    })
  }
})

// Watch title changes to update DOM when not editing
watch(title, (newTitle) => {
  if (!isEditingTitle.value && titleRef.value) {
    titleRef.value.textContent = newTitle
  }
})

// Detail view update handlers
function handleDetailUpdateComment(tierId: string, rowId: string, index: number, comment: string) {
  tierStore.updateComment(tierId, rowId, index, comment)
}

function handleDetailUpdateLeftContent(tierId: string, rowId: string, index: number, leftContent: string) {
  tierStore.updateLeftContent(tierId, rowId, index, leftContent)
}

// Event handlers
function handleAddItem(tierId: string, rowId: string, index: number) {
  uiStore.openSearch(tierId, rowId, index)
}

function handleSelectAnime(anime: AnimeItem) {
  if (currentTierId.value && currentRowId.value && currentIndex.value !== null) {
    tierStore.addItem(currentTierId.value, currentRowId.value, currentIndex.value, anime)
    uiStore.closeSearch()
  }
}

function handleSelectAnimeMultiple(animes: AnimeItem[]) {
  const addedCount = tierStore.addMultipleItemsToUnranked(animes)
  if (addedCount > 0) {
    console.log(`已导入 ${addedCount} 个项目`)
  }
  uiStore.closeSearch()
}

function handleAddRow(tierId: string) {
  tierStore.addRow(tierId)
}

function handleDeleteRow(tierId: string, rowId: string) {
  tierStore.deleteRow(tierId, rowId)
}

function handleDeleteItem(tierId: string, rowId: string, index: number) {
  tierStore.deleteItem(tierId, rowId, index)
}

function handleMoveItem(data: {
  fromTierId: string
  fromRowId: string
  toTierId: string
  toRowId: string
  fromIndex: number
  toIndex: number
  item: AnimeItem
}) {
  tierStore.moveItem(data)
}

function handleReorder(tierId: string, rowId: string, newItems: AnimeItem[]) {
  tierStore.reorder(tierId, rowId, newItems)
}

function handleEditItem(tierId: string, rowId: string, item: AnimeItem, index: number, isLongPress?: boolean) {
  uiStore.openEditItem(tierId, rowId, item, index, isLongPress)
}

function handleSaveEditItem(updatedItem: AnimeItem) {
  if (currentTierId.value && currentRowId.value && currentIndex.value !== null) {
    tierStore.updateItem(currentTierId.value, currentRowId.value, currentIndex.value, updatedItem)
    uiStore.closeEditItem()
  }
}

function handleCloseEditItem() {
  uiStore.closeEditItem()
}

function handleUpdateConfigs(newConfigs: TierConfig[]) {
  tierConfigStore.updateConfigs(newConfigs, {
    tiers: tierStore.tiers,
    unrankedTiers: tierStore.unrankedTiers,
    addMultipleItemsToUnranked: tierStore.addMultipleItemsToUnranked
  })
}

function handleUpdateTitleFontSize(newFontSize: number) {
  appSettings.titleFontSize.value = newFontSize
}

function handleUpdateTheme(theme: 'light' | 'dark' | 'auto') {
  appSettings.applyTheme(theme)
}

function handleUpdateHideItemNames(hide: boolean) {
  appSettings.hideItemNames.value = hide
}

function handleUpdateExportScale(scale: number) {
  appSettings.updateExportScale(scale, viewMode.value)
}

async function handleClearAll() {
  const result = await appSettings.clearAll(tierConfigs.value)
  if (result.success) {
    tierStore.clearAll(tierConfigs.value)
    // Reset title and font size already handled in clearAll
    nextTick(() => {
      if (titleRef.value) {
        titleRef.value.textContent = title.value
      }
    })
  } else {
    console.error('清空数据失败:', result.error)
    alert('清空数据失败，请刷新页面重试')
  }
}

function handleResetSettings() {
  const result = appSettings.resetSettingsOperation()
  if (result.success) {
    tierConfigStore.resetToDefault(locale.value)
    if (showConfig.value) {
      uiStore.refreshConfigModal()
    }
  } else {
    console.error('重置设置失败:', result.error)
    alert('重置设置失败，请刷新页面重试')
  }
}

function handleTitleInput(e: Event) {
  const target = e.target as HTMLHeadingElement
  const newTitle = target.textContent?.trim() || ''
  appSettings.title.value = newTitle || 'Tier List'
}

function handleTitleBlur(e: Event) {
  const target = e.target as HTMLHeadingElement
  uiStore.isEditingTitle.value = false

  const newTitle = target.textContent?.trim() || ''
  if (newTitle) {
    appSettings.title.value = newTitle
  } else {
    const defaultTitle = 'Tier List'
    appSettings.title.value = defaultTitle
    target.textContent = defaultTitle
  }
}

function handleTitleFocus() {
  uiStore.isEditingTitle.value = true
}

function handleClearClick() {
  uiStore.showClearConfirm.value = true
}

function handleConfirmClear() {
  uiStore.showClearConfirm.value = false
  handleClearAll()
}

function handleCancelClear() {
  uiStore.showClearConfirm.value = false
}

function toggleLanguage() {
  appSettings.toggleLanguage()
  tierConfigStore.loadConfigs()
}

function handleImportClick() {
  uiStore.showImportModal.value = true
}

async function handleDataImport(data: ExportData) {
  if (!confirm('导入数据将覆盖当前所有数据，是否继续？')) {
    return
  }

  const result = await appSettings.importData(data)
  if (result.success) {
    await tierStore.loadData()
    tierConfigStore.loadConfigs()
    tierStore.syncWithConfigs(tierConfigs.value)

    nextTick(() => {
      if (titleRef.value) {
        titleRef.value.textContent = title.value
      }
    })

    uiStore.showImportModal.value = false
  } else {
    alert(`${t('app.importFailed')}: ${result.error || t('app.unknownError')}`)
  }
}

function handleFileImport(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = async (event) => {
    try {
      const jsonStr = event.target?.result as string
      const data: ExportData = JSON.parse(jsonStr)

      if (!data.tiers || !data.tierConfigs) {
        alert('文件格式不正确')
        return
      }

      if (confirm('导入数据将覆盖当前所有数据，是否继续？')) {
        const result = await appSettings.importData(data)
        if (result.success) {
          await tierStore.loadData()
          tierConfigStore.loadConfigs()
          tierStore.syncWithConfigs(tierConfigs.value)

          nextTick(() => {
            if (titleRef.value) {
              titleRef.value.textContent = title.value
            }
          })
        } else {
          alert(`导入失败: ${result.error || '未知错误'}`)
        }
      }
    } catch (error) {
      console.error('导入失败:', error)
      alert('文件格式不正确或已损坏')
    }

    if (target) {
      target.value = ''
    }
  }
  reader.readAsText(file)
}
</script>

<template>
  <div class="app" ref="appContentRef">
    <header class="header" :style="{ paddingBottom: `${titleFontSize / 2}px` }">
      <div class="header-left"></div>
      <h1
        class="title"
        :style="{ fontSize: `${titleFontSize}px` }"
        contenteditable="true"
        @input="handleTitleInput"
        @blur="handleTitleBlur"
        @focus="handleTitleFocus"
        @keydown.enter.prevent="titleRef?.blur()"
        @keydown.esc.prevent="titleRef?.blur()"
        ref="titleRef"
        :title="t('app.editTitle')"
      ></h1>
      <div class="header-actions">
        <button
          class="btn btn-secondary view-toggle-btn"
          @click="toggleViewMode"
          :title="viewMode === 'card' ? t('detailView.detailView') : t('detailView.cardView')"
        >
          {{ viewMode === 'card' ? '📋' : '🃏' }}
        </button>
        <button class="btn btn-secondary" @click="toggleLanguage" :title="t('config.language')">
           {{ locale === 'zh' ? 'English' : '中文' }}
        </button>
        <button
          class="btn btn-secondary"
          @click="showExportModal = true"
          :title="t('app.export')"
        >
          {{ t('app.export') }}
        </button>
        <button class="btn btn-secondary" @click="handleImportClick" :title="t('app.import')">
          {{ t('app.import') }}
        </button>
        <input
          ref="fileInputRef"
          type="file"
          accept=".json"
          style="display: none"
          @change="handleFileImport"
        />
        <button class="btn btn-danger" @click="handleClearClick" :title="t('app.clearData')">
          {{ t('app.clearData') }}
        </button>
        <button class="btn btn-secondary" @click="showConfig = true">
          {{ t('app.settings') }}
        </button>
      </div>
    </header>

    <!-- 卡片视图 -->
    <template v-if="viewMode === 'card'">
      <TierList
        ref="tierListRef"
        :tiers="tiers"
        :tier-configs="tierConfigs"
        :is-dragging="isDragging"
        :is-exporting-image="false"
        :duplicate-item-ids="duplicateItemIds"
        :hide-item-names="hideItemNames"
        @add-item="handleAddItem"
        @add-row="handleAddRow"
        @delete-row="handleDeleteRow"
        @delete-item="handleDeleteItem"
        @edit-item="handleEditItem"
        @move-item="handleMoveItem"
        @reorder="handleReorder"
        @drag-start="isDragging = true"
        @drag-end="isDragging = false"
      />

      <div class="divider"></div>

      <TierList
        :tiers="unrankedTiers"
        :tier-configs="[{ id: 'unranked', label: '', color: 'transparent', order: 9999 }]"
        :is-dragging="isDragging"
        :is-exporting-image="false"
        :duplicate-item-ids="duplicateItemIds"
        :hide-item-names="hideItemNames"
        :hide-tier-labels="true"
        @add-item="handleAddItem"
        @add-row="handleAddRow"
        @delete-row="handleDeleteRow"
        @delete-item="handleDeleteItem"
        @edit-item="handleEditItem"
        @move-item="handleMoveItem"
        @reorder="handleReorder"
        @drag-start="isDragging = true"
        @drag-end="isDragging = false"
      />
    </template>

    <!-- 详情视图 -->
    <template v-else>
      <DetailTierList
        :tiers="tiers"
        :tier-configs="tierConfigs"
        @update-comment="handleDetailUpdateComment"
        @update-left-content="handleDetailUpdateLeftContent"
        @delete-item="handleDeleteItem"
        @edit-item="handleEditItem"
      />

      <div class="divider"></div>

      <DetailTierList
        :tiers="unrankedTiers"
        :tier-configs="[{ id: 'unranked', label: '', color: 'transparent', order: 9999 }]"
        :hide-tier-labels="true"
        @update-comment="handleDetailUpdateComment"
        @update-left-content="handleDetailUpdateLeftContent"
        @delete-item="handleDeleteItem"
        @edit-item="handleEditItem"
      />

    </template>



    <SearchModal
      v-if="showSearch"
      @close="showSearch = false"
      @select="handleSelectAnime"
      @select-multiple="handleSelectAnimeMultiple"
    />

    <ConfigModal
      v-if="showConfig"
      :key="configModalKey"
      :configs="tierConfigs"
      :initial-export-scale="viewMode === 'detail' ? detailExportScale : exportScale"
      @close="showConfig = false"
      @update="handleUpdateConfigs"
      @update-title-font-size="handleUpdateTitleFontSize"
      @update-theme="handleUpdateTheme"
      @update-hide-item-names="handleUpdateHideItemNames"
      @update-export-scale="handleUpdateExportScale"
      @reset-settings="handleResetSettings"
    />

    <!-- 清空数据确认弹窗 -->
    <div v-if="showClearConfirm" class="confirm-overlay" @click.self="handleCancelClear">
      <div class="confirm-modal">
        <div class="confirm-header">
          <h3 class="confirm-title">⚠️ 警告</h3>
        </div>
        <div class="confirm-body">
          <p>您确定要清空所有作品吗？</p>
          <p class="confirm-warning">此操作将删除：</p>
          <ul class="confirm-list">
            <li>所有已添加的作品</li>
            <li>标题（恢复为默认标题）</li>
          </ul>
          <p class="confirm-info">⚠️ 注意：此操作不会删除您的设置（主题、导出倍率、评分等级配置等）</p>
          <p class="confirm-danger">此操作不可恢复！</p>
        </div>
        <div class="confirm-footer">
          <button class="btn btn-cancel" @click="handleCancelClear">取消</button>
          <button class="btn btn-danger-confirm" @click="handleConfirmClear">确认清空</button>
        </div>
      </div>
    </div>

    <EditItemModal
      v-if="showEditItem"
      :item="currentEditItem"
      :is-long-press-triggered="isLongPressEdit"
      @close="handleCloseEditItem"
      @save="handleSaveEditItem"
    />

    <ImportModal
      v-if="showImportModal"
      @close="showImportModal = false"
      @import-data="handleDataImport"
      @import-items="handleSelectAnimeMultiple"
    />

    <ExportModal
      v-if="showExportModal"
      :tiers="tiers"
      :tier-configs="tierConfigs"
      :app-content-ref="appContentRef"
      :title="title"
      :title-font-size="titleFontSize"
      :export-scale="viewMode === 'detail' ? detailExportScale : exportScale"
      :view-mode="viewMode"
      @close="showExportModal = false"
    />
  </div>
</template>

<style scoped>
.divider {
  height: 4px;
  background-color: var(--text-color);
  margin: 0;
  border-radius: 2px;
  width: 100%;
}

.app {
  max-width: var(--size-app-max-width, 1400px);
  margin: 0 auto;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  align-items: center;
  margin-bottom: 0;
  border-bottom: var(--size-border-width-thick, 2px) solid var(--border-color);
  position: relative;
}

.header-left {
  flex: 1;
}

.title {
  font-weight: bold;
  color: var(--text-color);
  letter-spacing: 2px;
  cursor: text;
  outline: none;
  transition: opacity 0.2s;
  text-align: center;
  flex: 1;
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  width: fit-content;
}

.title:hover {
  opacity: 0.7;
}

.title:focus {
  opacity: 1;
  border-bottom: 2px dashed var(--border-color);
}

.header-actions {
  display: flex;
  gap: 10px;
}

.btn {
  padding: var(--size-btn-padding-y, 10px) var(--size-btn-padding-x, 20px);
  border: var(--size-border-width-thick, 2px) solid var(--border-color);
  background: var(--bg-color);
  color: var(--text-color);
  font-size: var(--size-btn-font-size, 14px);
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}

.btn:hover {
  background: var(--border-color);
  color: var(--bg-color);
}

.btn-secondary {
  background: var(--bg-color);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn:disabled:hover {
  background: var(--bg-color);
  color: var(--text-color);
}

.btn-danger {
  background: var(--bg-color);
  color: #cc6666;
  border-color: #cc6666;
}

.btn-danger:hover {
  background: #cc6666;
  color: #ffffff;
}

.confirm-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--modal-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.confirm-modal {
  background: var(--bg-color);
  border: var(--size-border-width-modal, 3px) solid var(--border-color);
  width: 90%;
  max-width: var(--size-modal-max-width, 500px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.confirm-header {
  padding: 20px;
  border-bottom: 2px solid var(--border-color);
  background: var(--warning-bg, #fff3cd);
}

.confirm-title {
  font-size: 20px;
  font-weight: bold;
  margin: 0;
  color: #cc6666;
}

.confirm-body {
  padding: var(--size-app-padding, 20px);
}

.confirm-body p {
  margin: 10px 0;
  line-height: 1.6;
  color: var(--text-color);
}

.confirm-warning {
  font-weight: bold;
  color: var(--text-secondary);
  margin-top: 15px !important;
}

.confirm-info {
  font-weight: bold;
  color: #ff9800;
  margin-top: 15px !important;
  font-size: 14px;
}

.confirm-danger {
  font-weight: bold;
  color: #cc6666;
  font-size: 16px;
  margin-top: 15px !important;
}

.confirm-list {
  margin: 10px 0;
  padding-left: 25px;
  line-height: 1.8;
  color: var(--text-color);
}

.confirm-list li {
  margin: 5px 0;
}

.confirm-footer {
  padding: 20px;
  border-top: 2px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn-cancel {
  background: var(--bg-color);
  color: var(--text-color);
  border: 2px solid var(--border-color);
}

.btn-cancel:hover {
  background: var(--bg-hover-color, var(--border-color));
}

.btn-danger-confirm {
  background: #cc6666;
  color: #ffffff;
  border-color: #cc6666;
}

.btn-danger-confirm:hover {
  background: #b85555;
  border-color: #b85555;
}
</style>