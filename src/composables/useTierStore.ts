import { ref, computed, watch, type Ref } from 'vue'
import type { Tier, AnimeItem, TierConfig } from '../types'
import { loadTierData, saveTierData, generateUuid } from '../utils/storage'

/**
 * Composable for managing tier data (tiers and unrankedTiers)
 */
export function useTierStore() {
  // State
  const tiers = ref<Tier[]>([])
  const unrankedTiers = ref<Tier[]>([{
    id: 'unranked',
    rows: [{
      id: 'unranked-row-0',
      items: []
    }]
  }])

  // Computed
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

  // Watch for auto-save
  watch([tiers, unrankedTiers], async () => {
    await saveTierData([...tiers.value, ...unrankedTiers.value])
  }, { deep: true })

  // Data loading
  async function loadData() {
    const allLoadedTiers = await loadTierData()

    // Extract Unranked Tier
    const loadedUnranked = allLoadedTiers.find(t => t.id === 'unranked')
    if (loadedUnranked) {
      unrankedTiers.value = [loadedUnranked]
    }

    // Assign remaining to tiers
    tiers.value = allLoadedTiers.filter(t => t.id !== 'unranked')

    // Hydration: Convert Blobs to ObjectURLs for display
    const allTiersToHydrate = [...tiers.value, ...(unrankedTiers.value || [])]
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

    // 数据迁移：将 name_cn 迁移到 name，确保只显示一个名字（优先中文）
    let hasChanges = false
    const migrateItem = (item: AnimeItem) => {
      if (item.name_cn) {
        // 如果有中文名，覆盖 name，并删除 name_cn
        if (item.name !== item.name_cn) {
          item.name = item.name_cn
          hasChanges = true
        }
        delete item.name_cn
        hasChanges = true // 删除属性也算变更
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
  }

  // Sync tiers with configs (called from tier config store)
  function syncWithConfigs(tierConfigs: TierConfig[]) {
    const configIds = new Set(tierConfigs.map(c => c.id))

    // 移除配置中不存在的等级 (且不是 unranked)
    tiers.value = tiers.value.filter(t => configIds.has(t.id))

    // 添加配置中存在但 tiers 中不存在的等级
    tierConfigs.forEach(config => {
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

    // 按配置顺序排序
    tiers.value.sort((a, b) => {
      const aOrder = tierConfigs.find(c => c.id === a.id)?.order ?? 999
      const bOrder = tierConfigs.find(c => c.id === b.id)?.order ?? 999
      return aOrder - bOrder
    })

    // Save after sync
    saveTierData([...tiers.value, ...unrankedTiers.value])
  }

  // Core operations
  function addItem(tierId: string, rowId: string, index: number, item: AnimeItem) {
    const allTiers = [...tiers.value, ...unrankedTiers.value]
    const tier = allTiers.find(t => t.id === tierId)
    if (tier) {
      const row = tier.rows.find(r => r.id === rowId)
      if (row) {
        // 确保数组长度足够
        while (row.items.length <= index) {
          row.items.push({} as AnimeItem)
        }
        row.items[index] = item
      }
    }
  }

  function addItemToUnranked(item: AnimeItem) {
    const targetTier = unrankedTiers.value[0]
    if (targetTier.rows.length === 0) {
      targetTier.rows.push({ id: 'unranked-row-0', items: [] })
    }
    const targetRow = targetTier.rows[0]

    // 检查是否已存在（通过 ID）
    const exists = tiers.value.some(t => t.rows.some(r => r.items.some(i => String(i.id) === String(item.id)))) ||
                  unrankedTiers.value.some(t => t.rows.some(r => r.items.some(i => String(i.id) === String(item.id))))

    if (!exists) {
      // 确保每个导入的项目都有 UUID，否则 TierRow 中的 v-for key 会重复 ('empty-slot')
      if (!item.uuid) {
        item.uuid = generateUuid()
      }
      targetRow.items.push(item)
      return true
    }
    return false
  }

  function addMultipleItemsToUnranked(items: AnimeItem[]): number {
    let addedCount = 0
    items.forEach(item => {
      if (addItemToUnranked(item)) {
        addedCount++
      }
    })
    return addedCount
  }

  function addRow(tierId: string) {
    const allTiers = [...tiers.value, ...unrankedTiers.value]
    const tier = allTiers.find(t => t.id === tierId)
    if (tier) {
      const newRowId = `${tierId}-row-${tier.rows.length}`
      tier.rows.push({
        id: newRowId,
        items: [],
      })
    }
  }

  function deleteRow(tierId: string, rowId: string) {
    const allTiers = [...tiers.value, ...unrankedTiers.value]
    const tier = allTiers.find(t => t.id === tierId)
    if (tier && tier.rows.length > 1) {
      const index = tier.rows.findIndex(r => r.id === rowId)
      if (index !== -1) {
        tier.rows.splice(index, 1)
      }
    }
  }

  function deleteItem(tierId: string, rowId: string, index: number) {
    const allTiers = [...tiers.value, ...unrankedTiers.value]
    const tier = allTiers.find(t => t.id === tierId)
    if (tier) {
      const row = tier.rows.find(r => r.id === rowId)
      if (row) {
        row.items.splice(index, 1)
      }
    }
  }

  function moveItem(data: {
    fromTierId: string
    fromRowId: string
    toTierId: string
    toRowId: string
    fromIndex: number
    toIndex: number
    item: AnimeItem
  }) {
    // 找到源行和目标行
    // 必须重新从所有等级中查找，因为 TierList 组件传出来的 TierId 可能是错的（尤其是在 unranked 和 ranked 之间拖动时）
    const allTiers = [...tiers.value, ...unrankedTiers.value]

    // 1. 先通过 RowId 找到真正的 Tier 和 Row
    let realFromTier: Tier | undefined
    let realFromRow: any
    let realToTier: Tier | undefined
    let realToRow: any

    for (const t of allTiers) {
      const fRow = t.rows.find(r => r.id === data.fromRowId)
      if (fRow) {
        realFromTier = t
        realFromRow = fRow
      }
      const tRow = t.rows.find(r => r.id === data.toRowId)
      if (tRow) {
        realToTier = t
        realToRow = tRow
      }
    }

    if (!realFromTier || !realFromRow || !realToTier || !realToRow) return

    // 替换掉 data 中的 TierId
    data.fromTierId = realFromTier.id
    data.toTierId = realToTier.id

    const fromRow = realFromRow
    const toRow = realToRow

    if (!fromRow || !toRow) return

    // 确保源索引有效
    if (data.fromIndex < 0 || data.fromIndex >= fromRow.items.length) {
      return
    }

    // 获取要移动的项目
    const itemToMove = fromRow.items[data.fromIndex]

    // 如果是跨等级拖动或跨行拖动
    if (data.fromTierId !== data.toTierId || data.fromRowId !== data.toRowId) {
      // 从源行移除
      fromRow.items.splice(data.fromIndex, 1)

      // 添加到目标行（确保索引有效，排除空位）
      const targetIndex = Math.min(data.toIndex, toRow.items.length)
      toRow.items.splice(targetIndex, 0, itemToMove)
    }
  }

  function reorder(tierId: string, rowId: string, newItems: AnimeItem[]) {
    const allTiers = [...tiers.value, ...unrankedTiers.value]
    const tier = allTiers.find(t => t.id === tierId)
    if (!tier) return

    const row = tier.rows.find(r => r.id === rowId)
    if (!row) return

    row.items = newItems
  }

  function updateItem(tierId: string, rowId: string, index: number, updatedItem: AnimeItem) {
    const allTiers = [...tiers.value, ...unrankedTiers.value]
    const tier = allTiers.find(t => t.id === tierId)
    if (tier) {
      const row = tier.rows.find(r => r.id === rowId)
      if (row) {
        row.items[index] = updatedItem
      }
    }
  }

  function updateComment(tierId: string, rowId: string, index: number, comment: string) {
    const allTiers = [...tiers.value, ...unrankedTiers.value]
    const tier = allTiers.find(t => t.id === tierId)
    if (tier) {
      const row = tier.rows.find(r => r.id === rowId)
      if (row && row.items[index]) {
        row.items[index].comment = comment
      }
    }
  }

  function updateLeftContent(tierId: string, rowId: string, index: number, leftContent: string) {
    const allTiers = [...tiers.value, ...unrankedTiers.value]
    const tier = allTiers.find(t => t.id === tierId)
    if (tier) {
      const row = tier.rows.find(r => r.id === rowId)
      if (row && row.items[index]) {
        row.items[index].leftContent = leftContent
      }
    }
  }

  function clearAll(tierConfigs: { id: string }[]) {
    // 重置 tiers 为默认结构（清空所有作品）
    tiers.value = tierConfigs.map(config => ({
      id: config.id,
      rows: [{
        id: `${config.id}-row-0`,
        items: [],
      }],
    }))
    // 清空备选框
    unrankedTiers.value = [{
      id: 'unranked',
      rows: [{
        id: 'unranked-row-0',
        items: []
      }]
    }]
  }

  return {
    // State
    tiers,
    unrankedTiers,
    duplicateItemIds,

    // Actions
    loadData,
    syncWithConfigs,
    addItem,
    addItemToUnranked,
    addMultipleItemsToUnranked,
    addRow,
    deleteRow,
    deleteItem,
    moveItem,
    reorder,
    updateItem,
    updateComment,
    updateLeftContent,
    clearAll,
  }
}