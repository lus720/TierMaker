import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TierConfig } from '../types'
import type { ExportData } from '../utils/storage'
import { getSetting } from '../utils/configManager'
import {
  loadTitle,
  saveTitle,
  loadTitleFontSize,
  saveTitleFontSize,
  loadHideItemNames,
  loadExportScale,
  saveExportScale,
  loadDetailExportScale,
  saveDetailExportScale,
  loadThemePreference,
  saveThemePreference,
  clearItemsAndTitle,
  importAllData,
  resetSettings,
  handleLanguageChange,
} from '../utils/storage'

/**
 * Composable for managing application settings
 */
export function useAppSettings() {
  const { locale } = useI18n()

  // State
  const title = ref<string>(loadTitle())
  const titleFontSize = ref<number>(loadTitleFontSize())
  const hideItemNames = ref<boolean>(loadHideItemNames())
  const exportScale = ref<number>(loadExportScale())
  const detailExportScale = ref<number>(loadDetailExportScale())

  // Watch for changes to persist
  watch(title, (newTitle) => {
    saveTitle(newTitle)
  })

  watch(titleFontSize, (newSize) => {
    saveTitleFontSize(newSize)
  })

  watch(exportScale, (newScale) => {
    saveExportScale(newScale)
  })

  watch(detailExportScale, (newScale) => {
    saveDetailExportScale(newScale)
  })

  // Theme functions
  function applyTheme(theme: 'light' | 'dark' | 'auto') {
    const html = document.documentElement
    html.setAttribute('data-theme', theme)
  }

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

  function initTheme() {
    const theme = loadThemePreference()
    applyTheme(theme)

    if (theme === 'auto') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      const handleSystemThemeChange = (e: MediaQueryListEvent) => {
        const currentTheme = loadThemePreference()
        if (currentTheme === 'auto') {
          applyTheme('auto')
        }
      }
      mediaQuery.addEventListener('change', handleSystemThemeChange)
    }
  }

  // Language
  function toggleLanguage() {
    const current = locale.value
    const next = current === 'zh' ? 'en' : 'zh'
    handleLanguageChange(next)
  }

  // Clear all items and title
  async function clearAll(tierConfigs: TierConfig[]) {
    try {
      await clearItemsAndTitle()

      // Reset title and font size
      title.value = 'Tier List'
      titleFontSize.value = 32

      return { success: true }
    } catch (error) {
      console.error('清空数据失败:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  // Reset settings (preserve data)
  function resetSettingsOperation() {
    try {
      resetSettings()
      console.log('[App] handleResetSettings triggered')

      // Reset title font size
      titleFontSize.value = 32

      // Reset hide item names
      hideItemNames.value = getSetting('hide-item-names') ?? false

      // Reset export scales
      exportScale.value = 4
      detailExportScale.value = 1

      // Apply current theme
      const theme = loadThemePreference()
      applyTheme(theme)

      return { success: true }
    } catch (error) {
      console.error('重置设置失败:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  // Import data
  async function importData(data: ExportData) {
    try {
      const result = await importAllData(data)
      if (result.success) {
        // Reload title
        title.value = loadTitle()
        return { success: true }
      } else {
        return { success: false, error: result.error }
      }
    } catch (error) {
      console.error('导入失败:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  // Update export scale based on view mode
  function updateExportScale(scale: number, viewMode: 'card' | 'detail') {
    if (viewMode === 'detail') {
      detailExportScale.value = scale
    } else {
      exportScale.value = scale
    }
  }

  return {
    // State
    title,
    titleFontSize,
    hideItemNames,
    exportScale,
    detailExportScale,

    // Actions
    applyTheme,
    getCurrentThemeBackgroundColor,
    initTheme,
    toggleLanguage,
    clearAll,
    resetSettingsOperation,
    importData,
    updateExportScale,
  }
}