<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter, useRoute } from 'vue-router'
import TierList from '../components/TierList.vue'
import SearchModal from '../components/SearchModal.vue'
import ConfigModal from '../components/ConfigModal.vue'
import EditItemModal from '../components/EditItemModal.vue'
import ImportModal from '../components/ImportModal.vue'
import ExportModal from '../components/ExportModal.vue'

import { initConfigStyles, getSetting } from '../utils/configManager'
import type { Tier, AnimeItem, TierConfig } from '../types'
import { loadTierData, saveTierData, loadTierConfigs, saveTierConfigs, loadTitle, saveTitle, loadTitleFontSize, saveTitleFontSize, importAllData, clearItemsAndTitle, resetSettings, loadThemePreference, loadHideItemNames, loadExportScale, DEFAULT_TIER_CONFIGS, generateUuid, type ExportData } from '../utils/storage'

const { t, locale } = useI18n()
const router = useRouter()
const route = useRoute()

const tiers = ref<Tier[]>([])
const unrankedTiers = ref<Tier[]>([{
  id: 'unranked',
  rows: [{
    id: 'unranked-row-0',
    items: []
  }]
}])
const tierConfigs = ref<TierConfig[]>([])
const showSearch = ref(false)
const showConfig = ref(false)
const showEditItem = ref(false)
const showImportModal = ref(false)
const currentTierId = ref<string | null>(null)
const currentRowId = ref<string | null>(null)
const currentIndex = ref<number | null>(null)
const currentEditItem = ref<AnimeItem | null>(null)
const isLongPressEdit = ref(false)
const title = ref<string>('Tier List')
const titleFontSize = ref<number>(32)
const hideItemNames = ref<boolean>(false)
const exportScale = ref<number>(4)
const isDragging = ref(false)
const tierListRef = ref<InstanceType<typeof TierList> | null>(null)
const configModalKey = ref<number>(0)

// Language switching
const currentLang = computed(() => route.params.lang as string || 'zh')

function switchLanguage() {
  const newLang = currentLang.value === 'zh' ? 'en' : 'zh'
  router.push(`/${newLang}/`)
}

// 检测重复的条目（根据ID）
const duplicateItemIds = computed(() => {
  const idCount = new Map<string | number, number>()
  
  const allTiers = [...tiers.value, ...unrankedTiers.value]
  allTiers.forEach(tier => {
    tier.rows.forEach(row => {
      row.items.forEach(item => {
        if (item.id) {
          const count = idCount.get(item.id) || 0
          idCount.set(item.id, count + 1)
        }
      })
    })
  })
  
  const duplicates = new Set<string | number>()
  idCount.forEach((count, id) => {
    if (count > 1) {
      duplicates.add(id)
    }
  })
  
  return duplicates
})

// 应用主题设置
function applyTheme(theme: 'light' | 'dark' | 'auto') {
  const html = document.documentElement
  html.setAttribute('data-theme', theme)
}

// 获取当前主题对应的背景色
function getCurrentThemeBackgroundColor(): string {
  const computedStyle = getComputedStyle(document.documentElement)
  const bgColor = computedStyle.getPropertyValue('--bg-color').trim()
  
  if (bgColor) {
    return bgColor
  }
  
  const html = document.documentElement
  const theme = html.getAttribute('data-theme') || 'auto'
  
  if (theme === 'dark') {
    return '#1a1a1a'
  }
  
  if (theme === 'auto') {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return '#1a1a1a'
    }
  }
  
  return '#ffffff'
}

// 初始化主题
function initTheme() {
  const savedTheme = loadThemePreference()
  applyTheme(savedTheme)
  
  // 监听系统主题变化
  if (window.matchMedia) {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleSystemThemeChange = (e: MediaQueryListEvent) => {
      const currentTheme = document.documentElement.getAttribute('data-theme')
      if (currentTheme === 'auto') {
        // 强制重新应用 auto 主题以触发 CSS 媒体查询
        applyTheme('auto')
      }
    }
    mediaQuery.addEventListener('change', handleSystemThemeChange)
  }
}

// 加载数据
onMounted(async () => {
  initConfigStyles()
  initTheme()
  title.value = loadTitle()
  titleFontSize.value = loadTitleFontSize()
  hideItemNames.value = loadHideItemNames()
  exportScale.value = loadExportScale()
  tierConfigs.value = loadTierConfigs()
  tiers.value = await loadTierData()
  
  // Hydration: 将 Blob 转换为 URL
  const allTiersToHydrate = [...tiers.value, ...unrankedTiers.value]
  allTiersToHydrate.forEach(tier => {
    tier.rows.forEach(row => {
      row.items.forEach(item => {
        if (item.image instanceof Blob) {
          item._blob = item.image
          item.image = URL.createObjectURL(item.image)
        }
        if (item.originalImage instanceof Blob) {
           item.originalImage = URL.createObjectURL(item.originalImage)
        }
      })
    })
  })

  // 数据迁移
  let hasChanges = false
  function migrateItem(item: AnimeItem) {
    if ((item as any).name_cn && !(item as any)._migrated) {
      if ((item as any).name_cn !== item.name) {
        item.name = (item as any).name_cn
      }
      delete (item as any).name_cn
      ;(item as any)._migrated = true
      hasChanges = true
    }
  }
  
  allTiersToHydrate.forEach(tier => {
    tier.rows.forEach(row => {
      row.items.forEach(item => {
        if (item.id) migrateItem(item)
      })
    })
  })
  
  if (hasChanges) {
    await saveTierData([...tiers.value, ...unrankedTiers.value])
  }
  
  // 同步 tiers 和 tierConfigs
  const configIds = new Set(tierConfigs.value.map(c => c.id))
  tiers.value = tiers.value.filter(t => configIds.has(t.id))
  
  tierConfigs.value.forEach(config => {
    if (!tiers.value.find(t => t.id === config.id)) {
      tiers.value.push({
        id: config.id,
        rows: [{
          id: `${config.id}-row-0`,
          items: [],
        }],
      })
    }
  })
  
  tiers.value.sort((a, b) => {
    const aOrder = tierConfigs.value.find(c => c.id === a.id)?.order ?? 999
    const bOrder = tierConfigs.value.find(c => c.id === b.id)?.order ?? 999
    return aOrder - bOrder
  })
  
  await saveTierData([...tiers.value, ...unrankedTiers.value])
  
  // Initialize title display
  nextTick(() => {
    if (titleRef.value) {
      titleRef.value.textContent = title.value
    }
  })
})

onUnmounted(() => {
  // No cleanup needed
})

// 监听数据变化，自动保存
watch([tiers, unrankedTiers], async () => {
  await saveTierData([...tiers.value, ...unrankedTiers.value])
}, { deep: true })

function handleAddItem(tierId: string, rowId: string, index: number) {
  currentTierId.value = tierId
  currentRowId.value = rowId
  currentIndex.value = index
  showSearch.value = true
}

function handleSelectAnime(anime: AnimeItem) {
  if (currentTierId.value !== null && currentRowId.value !== null && currentIndex.value !== null) {
    const allTiers = [...tiers.value, ...unrankedTiers.value]
    const tier = allTiers.find(t => t.id === currentTierId.value)
    const row = tier?.rows.find(r => r.id === currentRowId.value)
    if (row) {
      const newItem: AnimeItem = {
        ...anime,
        uuid: generateUuid()
      }
      row.items.splice(currentIndex.value, 0, newItem)
    }
  }
  showSearch.value = false
  currentTierId.value = null
  currentRowId.value = null
  currentIndex.value = null
}

function handleSelectAnimeMultiple(animes: AnimeItem[]) {
  if (animes.length === 0) return
  
  // 找到 unranked tier
  const unrankedTier = unrankedTiers.value[0]
  if (!unrankedTier) return
  
  // 找到第一行
  let targetRow = unrankedTier.rows[0]
  if (!targetRow) {
    targetRow = {
      id: 'unranked-row-0',
      items: []
    }
    unrankedTier.rows.push(targetRow)
  }
  
  // 添加所有动画
  animes.forEach(anime => {
    const newItem: AnimeItem = {
      ...anime,
      uuid: generateUuid()
    }
    targetRow.items.push(newItem)
  })
  
  showSearch.value = false
  showImportModal.value = false
}

function handleAddRow(tierId: string) {
  const tier = tiers.value.find(t => t.id === tierId)
  if (tier) {
    const newRowId = `${tierId}-row-${tier.rows.length}`
    tier.rows.push({
      id: newRowId,
      items: [],
    })
  }
}

function handleDeleteRow(tierId: string, rowId: string) {
  const tier = tiers.value.find(t => t.id === tierId)
  if (tier && tier.rows.length > 1) {
    const rowIndex = tier.rows.findIndex(r => r.id === rowId)
    if (rowIndex !== -1) {
      tier.rows.splice(rowIndex, 1)
    }
  }
}

function handleDeleteItem(tierId: string, rowId: string, index: number) {
  const allTiers = [...tiers.value, ...unrankedTiers.value]
  const tier = allTiers.find(t => t.id === tierId)
  const row = tier?.rows.find(r => r.id === rowId)
  if (row) {
    row.items.splice(index, 1)
  }
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
  const allTiers = [...tiers.value, ...unrankedTiers.value]
  
  const fromTier = allTiers.find(t => t.id === data.fromTierId)
  const toTier = allTiers.find(t => t.id === data.toTierId)
  
  if (!fromTier || !toTier) return
  
  const fromRow = fromTier.rows.find(r => r.id === data.fromRowId)
  const toRow = toTier.rows.find(r => r.id === data.toRowId)
  
  if (!fromRow || !toRow) return
  
  // 从原位置移除
  const [movedItem] = fromRow.items.splice(data.fromIndex, 1)
  
  // 如果是同一行，需要调整目标索引
  if (data.fromRowId === data.toRowId) {
    const adjustedIndex = data.fromIndex < data.toIndex ? data.toIndex - 1 : data.toIndex
    toRow.items.splice(adjustedIndex, 0, movedItem)
  } else {
    toRow.items.splice(data.toIndex, 0, movedItem)
  }
}

function handleReorder(tierId: string, rowId: string, newItems: AnimeItem[]) {
  const allTiers = [...tiers.value, ...unrankedTiers.value]
  const tier = allTiers.find(t => t.id === tierId)
  const row = tier?.rows.find(r => r.id === rowId)
  if (row) {
    row.items = newItems
  }
}

function handleEditItem(tierId: string, rowId: string, item: AnimeItem, index: number, isLongPress?: boolean) {
  currentTierId.value = tierId
  currentRowId.value = rowId
  currentIndex.value = index
  currentEditItem.value = { ...item }
  isLongPressEdit.value = isLongPress || false
  showEditItem.value = true
}

function handleSaveEditItem(updatedItem: AnimeItem) {
  if (currentTierId.value !== null && currentRowId.value !== null && currentIndex.value !== null) {
    const allTiers = [...tiers.value, ...unrankedTiers.value]
    const tier = allTiers.find(t => t.id === currentTierId.value)
    const row = tier?.rows.find(r => r.id === currentRowId.value)
    if (row && currentIndex.value < row.items.length) {
      row.items[currentIndex.value] = updatedItem
    }
  }
  handleCloseEditItem()
}

function handleCloseEditItem() {
  showEditItem.value = false
  currentTierId.value = null
  currentRowId.value = null
  currentIndex.value = null
  currentEditItem.value = null
  isLongPressEdit.value = false
}

function handleUpdateConfigs(newConfigs: TierConfig[]) {
  const oldConfigs = tierConfigs.value
  const oldTierByOrder = new Map<number, Tier>()
  tiers.value.forEach(tier => {
    const oldConfig = oldConfigs.find(c => c.id === tier.id)
    if (oldConfig) {
      oldTierByOrder.set(oldConfig.order, tier)
    }
  })
  
  tierConfigs.value = newConfigs
  saveTierConfigs(newConfigs)
  
  const newTiers: Tier[] = []
  const processedOldTiers = new Set<Tier>()
  
  newConfigs.forEach(config => {
    const oldTier = oldTierByOrder.get(config.order)
    
    if (oldTier) {
      oldTier.id = config.id
      oldTier.rows.forEach((row, rowIndex) => {
        if (rowIndex === 0) {
          row.id = `${config.id}-row-0`
        } else {
          const match = row.id.match(/-row-(\d+)$/)
          if (match) {
            row.id = `${config.id}-row-${match[1]}`
          } else {
            row.id = `${config.id}-row-${rowIndex}`
          }
        }
      })
      newTiers.push(oldTier)
      processedOldTiers.add(oldTier)
    } else {
      newTiers.push({
        id: config.id,
        rows: [{
          id: `${config.id}-row-0`,
          items: [],
        }],
      })
    }
  })
  
  tiers.value = newTiers
  saveTierData([...tiers.value, ...unrankedTiers.value])
  
  nextTick(() => {
    setTimeout(() => {
      tierListRef.value?.updateLabelWidth()
    }, 100)
  })
}

function handleUpdateTitleFontSize(newFontSize: number) {
  titleFontSize.value = newFontSize
  saveTitleFontSize(newFontSize)
}

function handleUpdateTheme(theme: 'light' | 'dark' | 'auto') {
  applyTheme(theme)
}

function handleUpdateHideItemNames(hide: boolean) {
  hideItemNames.value = hide
}

function handleUpdateExportScale(scale: number) {
  exportScale.value = scale
}

async function handleClearAll() {
  try {
    await clearItemsAndTitle()
    
    tiers.value = tierConfigs.value.map(config => ({
      id: config.id,
      rows: [{
        id: `${config.id}-row-0`,
        items: [],
      }],
    }))
    
    unrankedTiers.value = [{
      id: 'unranked',
      rows: [{
        id: 'unranked-row-0',
        items: []
      }]
    }]

    await saveTierData([...tiers.value, ...unrankedTiers.value])
    
    title.value = 'Tier List'
    titleFontSize.value = 32
    saveTitle(title.value)
    saveTitleFontSize(titleFontSize.value)
    
    nextTick(() => {
      if (titleRef.value) {
        titleRef.value.textContent = title.value
      }
    })
  } catch (error) {
    console.error('清空数据失败:', error)
    alert(t('errors.clearFailed'))
  }
}

function handleResetSettings() {
  try {
    resetSettings()
    
    tierConfigs.value = JSON.parse(JSON.stringify(DEFAULT_TIER_CONFIGS))
    saveTierConfigs(tierConfigs.value)
    
    titleFontSize.value = 32
    saveTitleFontSize(titleFontSize.value)
    
    const theme = loadThemePreference()
    applyTheme(theme)
    
    hideItemNames.value = getSetting('hide-item-names') ?? false
    exportScale.value = 4
    
    const configIds = new Set(tierConfigs.value.map(c => c.id))
    tiers.value = tiers.value.filter(t => configIds.has(t.id))
    
    tierConfigs.value.forEach(config => {
      if (!tiers.value.find(t => t.id === config.id)) {
        tiers.value.push({
          id: config.id,
          rows: [{
            id: `${config.id}-row-0`,
            items: [],
          }],
        })
      }
    })
    
    tiers.value.sort((a, b) => {
      const aOrder = tierConfigs.value.find(c => c.id === a.id)?.order ?? 999
      const bOrder = tierConfigs.value.find(c => c.id === b.id)?.order ?? 999
      return aOrder - bOrder
    })
    
    saveTierData([...tiers.value, ...unrankedTiers.value])
    
    if (showConfig.value) {
      configModalKey.value++
    }
  } catch (error) {
    console.error('重置设置失败:', error)
    alert(t('errors.resetFailed'))
  }
}

watch(showConfig, (newVal, oldVal) => {
  if (oldVal === true && newVal === false) {
    nextTick(() => {
      setTimeout(() => {
        tierListRef.value?.updateLabelWidth()
      }, 150)
    })
  }
})

const titleRef = ref<HTMLHeadingElement | null>(null)
const isEditingTitle = ref(false)
const appContentRef = ref<HTMLElement | null>(null)
const showExportModal = ref(false)
const showClearConfirm = ref(false)

function handleTitleInput(e: Event) {
  const target = e.target as HTMLHeadingElement
  const newTitle = target.textContent?.trim() || ''
  title.value = newTitle || 'Tier List'
  saveTitle(title.value)
}

function handleTitleBlur(e: Event) {
  const target = e.target as HTMLHeadingElement
  isEditingTitle.value = false
  
  const newTitle = target.textContent?.trim() || ''
  if (newTitle) {
    title.value = newTitle
    saveTitle(title.value)
  } else {
    const defaultTitle = 'Tier List'
    title.value = defaultTitle
    target.textContent = defaultTitle
    saveTitle(defaultTitle)
  }
}

function handleTitleFocus() {
  isEditingTitle.value = true
}

watch(title, (newTitle) => {
  if (!isEditingTitle.value && titleRef.value) {
    titleRef.value.textContent = newTitle
  }
})

function handleClearClick() {
  showClearConfirm.value = true
}

function handleConfirmClear() {
  showClearConfirm.value = false
  handleClearAll()
}

function handleCancelClear() {
  showClearConfirm.value = false
}

const fileInputRef = ref<HTMLInputElement | null>(null)

function handleImportClick() {
  showImportModal.value = true
}

async function handleDataImport(data: ExportData) {
  if (!confirm(t('import.confirmOverwrite'))) {
    return
  }

  try {
     const result = await importAllData(data)
     if (result.success) {
        title.value = loadTitle()
        tierConfigs.value = loadTierConfigs()
        tiers.value = await loadTierData()
        
        tiers.value.forEach(tier => {
          tier.rows.forEach(row => {
            row.items.forEach(item => {
              if (item.image instanceof Blob) {
                item._blob = item.image
                item.image = URL.createObjectURL(item.image)
              }
              if (item.originalImage instanceof Blob) {
                item.originalImage = URL.createObjectURL(item.originalImage)
              }
            })
          })
        })
        
        const configIds = new Set(tierConfigs.value.map(c => c.id))
        tiers.value = tiers.value.filter(t => configIds.has(t.id))
        
        tierConfigs.value.forEach(config => {
          if (!tiers.value.find(t => t.id === config.id)) {
            tiers.value.push({
              id: config.id,
              rows: [{
                id: `${config.id}-row-0`,
                items: [],
              }],
            })
          }
        })
        
        tiers.value.sort((a, b) => {
          const aOrder = tierConfigs.value.find(c => c.id === a.id)?.order ?? 999
          const bOrder = tierConfigs.value.find(c => c.id === b.id)?.order ?? 999
          return aOrder - bOrder
        })
        
        nextTick(() => {
          if (titleRef.value) {
            titleRef.value.textContent = title.value
          }
        })
        
        showImportModal.value = false
     } else {
        alert(`${t('import.failed')}: ${result.error || ''}`)
     }
  } catch (error) {
     console.error('导入失败:', error)
     alert(t('errors.importFailed'))
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
        alert(t('import.invalidFormat'))
        return
      }
      
      if (confirm(t('import.confirmOverwrite'))) {
        const result = await importAllData(data)
        if (result.success) {
          title.value = loadTitle()
          tierConfigs.value = loadTierConfigs()
          tiers.value = await loadTierData()
          
          tiers.value.forEach(tier => {
            tier.rows.forEach(row => {
              row.items.forEach(item => {
                if (item.image instanceof Blob) {
                  item._blob = item.image
                  item.image = URL.createObjectURL(item.image)
                }
                if (item.originalImage instanceof Blob) {
                  item.originalImage = URL.createObjectURL(item.originalImage)
                }
              })
            })
          })
          
          const configIds = new Set(tierConfigs.value.map(c => c.id))
          tiers.value = tiers.value.filter(t => configIds.has(t.id))
          
          tierConfigs.value.forEach(config => {
            if (!tiers.value.find(t => t.id === config.id)) {
              tiers.value.push({
                id: config.id,
                rows: [{
                  id: `${config.id}-row-0`,
                  items: [],
                }],
              })
            }
          })
          
          tiers.value.sort((a, b) => {
            const aOrder = tierConfigs.value.find(c => c.id === a.id)?.order ?? 999
            const bOrder = tierConfigs.value.find(c => c.id === b.id)?.order ?? 999
            return aOrder - bOrder
          })
          
          nextTick(() => {
            if (titleRef.value) {
              titleRef.value.textContent = title.value
            }
          })
        } else {
          alert(`${t('import.failed')}: ${result.error || ''}`)
        }
      }
    } catch (error) {
      console.error('导入失败:', error)
      alert(t('import.corrupted'))
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
        :title="t('header.editTitleHint')"
      ></h1>
      <div class="header-actions">
        <button 
          class="btn btn-lang"
          @click="switchLanguage"
          :title="t('header.language')"
        >
          {{ currentLang === 'zh' ? 'EN' : '中' }}
        </button>
        <button 
          class="btn btn-secondary" 
          @click="showExportModal = true"
          :title="t('header.export')"
        >
          {{ t('header.export') }}
        </button>
        <button class="btn btn-secondary" @click="handleImportClick" :title="t('header.import')">
          {{ t('header.import') }}
        </button>
        <input
          ref="fileInputRef"
          type="file"
          accept=".json"
          style="display: none"
          @change="handleFileImport"
        />
        <button class="btn btn-danger" @click="handleClearClick" :title="t('header.clearData')">
          {{ t('header.clearData') }}
        </button>
        <button class="btn btn-secondary" @click="showConfig = true">
          {{ t('header.settings') }}
        </button>
      </div>
    </header>

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
          <h3 class="confirm-title">{{ t('clearConfirm.title') }}</h3>
        </div>
        <div class="confirm-body">
          <p>{{ t('clearConfirm.message') }}</p>
          <p class="confirm-warning">{{ t('clearConfirm.willDelete') }}</p>
          <ul class="confirm-list">
            <li>{{ t('clearConfirm.allItems') }}</li>
            <li>{{ t('clearConfirm.resetTitle') }}</li>
          </ul>
          <p class="confirm-info">{{ t('clearConfirm.settingsNote') }}</p>
          <p class="confirm-danger">{{ t('clearConfirm.irreversible') }}</p>
        </div>
        <div class="confirm-footer">
          <button class="btn btn-cancel" @click="handleCancelClear">{{ t('common.cancel') }}</button>
          <button class="btn btn-danger-confirm" @click="handleConfirmClear">{{ t('clearConfirm.confirmButton') }}</button>
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
      :export-scale="exportScale"
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

.btn-lang {
  min-width: 44px;
  padding: var(--size-btn-padding-y, 10px) 12px;
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
