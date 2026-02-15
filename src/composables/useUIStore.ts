import { ref, type Ref } from 'vue'
import type { Tier, AnimeItem, ViewMode } from '../types'
import { loadViewMode, saveViewMode } from '../utils/storage'
import TierList from '../components/TierList.vue'

/**
 * Composable for managing UI state
 */
export function useUIStore() {
  // Modal visibility
  const showSearch = ref(false)
  const showConfig = ref(false)
  const showEditItem = ref(false)
  const showImportModal = ref(false)
  const showExportModal = ref(false)
  const showClearConfirm = ref(false)

  // Current editing state
  const currentTierId = ref<string | null>(null)
  const currentRowId = ref<string | null>(null)
  const currentIndex = ref<number | null>(null)
  const currentEditItem = ref<AnimeItem | null>(null)
  const isLongPressEdit = ref(false)

  // Drag state
  const isDragging = ref(false)

  // View mode
  const viewMode = ref<ViewMode>(loadViewMode())

  // Component refs
  const tierListRef = ref<InstanceType<typeof TierList> | null>(null)
  const titleRef = ref<HTMLHeadingElement | null>(null)
  const appContentRef = ref<HTMLElement | null>(null)
  const fileInputRef = ref<HTMLInputElement | null>(null)

  // Other UI state
  const configModalKey = ref<number>(0)
  const isEditingTitle = ref(false)

  // Actions
  function openSearch(tierId: string, rowId: string, index: number) {
    currentTierId.value = tierId
    currentRowId.value = rowId
    currentIndex.value = index
    showSearch.value = true
  }

  function closeSearch() {
    showSearch.value = false
    resetCurrentEditing()
  }

  function openEditItem(tierId: string, rowId: string, item: AnimeItem, index: number, isLongPress = false) {
    currentTierId.value = tierId
    currentRowId.value = rowId
    currentIndex.value = index
    currentEditItem.value = { ...item }
    isLongPressEdit.value = isLongPress
    showEditItem.value = true
  }

  function closeEditItem() {
    showEditItem.value = false
    resetCurrentEditing()
    isLongPressEdit.value = false
  }

  function resetCurrentEditing() {
    currentTierId.value = null
    currentRowId.value = null
    currentIndex.value = null
    currentEditItem.value = null
  }

  function toggleViewMode() {
    viewMode.value = viewMode.value === 'card' ? 'detail' : 'card'
    saveViewMode(viewMode.value)
  }

  function setViewMode(mode: ViewMode) {
    viewMode.value = mode
    saveViewMode(mode)
  }

  function startDrag() {
    isDragging.value = true
  }

  function endDrag() {
    isDragging.value = false
  }

  function refreshConfigModal() {
    configModalKey.value++
  }

  return {
    // State
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
    tierListRef,
    titleRef,
    appContentRef,
    fileInputRef,
    configModalKey,
    isEditingTitle,

    // Actions
    openSearch,
    closeSearch,
    openEditItem,
    closeEditItem,
    resetCurrentEditing,
    toggleViewMode,
    setViewMode,
    startDrag,
    endDrag,
    refreshConfigModal,
  }
}