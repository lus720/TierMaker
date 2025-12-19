<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick, computed } from 'vue'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import TierList from './components/TierList.vue'
import SearchModal from './components/SearchModal.vue'
import ConfigModal from './components/ConfigModal.vue'
import EditItemModal from './components/EditItemModal.vue'
import { getItemUrl } from './utils/url'
import type { Tier, AnimeItem, TierConfig } from './types'
import { loadTierData, saveTierData, loadTierConfigs, saveTierConfigs, loadTitle, saveTitle, loadTitleFontSize, saveTitleFontSize, exportAllData, importAllData, clearItemsAndTitle, resetSettings, loadThemePreference, loadHideItemNames, loadExportScale, DEFAULT_TIER_CONFIGS, type ExportData } from './utils/storage'

const tiers = ref<Tier[]>([])
const tierConfigs = ref<TierConfig[]>([])
const showSearch = ref(false)
const showConfig = ref(false)
const showEditItem = ref(false)
const currentTierId = ref<string | null>(null)
const currentRowId = ref<string | null>(null)
const currentIndex = ref<number | null>(null)
const currentEditItem = ref<AnimeItem | null>(null)
const isLongPressEdit = ref(false)
const title = ref<string>('Tier List')
const titleFontSize = ref<number>(32)
const hideItemNames = ref<boolean>(false)
const exportScale = ref<number>(4)
const isDragging = ref(false) // 全局拖动状态
const tierListRef = ref<InstanceType<typeof TierList> | null>(null)
const configModalKey = ref<number>(0) // 用于强制重新渲染 ConfigModal

// 检测重复的条目（根据ID）
const duplicateItemIds = computed(() => {
  const idCount = new Map<string | number, number>()
  
  // 统计每个ID出现的次数
  tiers.value.forEach(tier => {
    tier.rows.forEach(row => {
      row.items.forEach(item => {
        if (item.id) {
          const count = idCount.get(item.id) || 0
          idCount.set(item.id, count + 1)
        }
      })
    })
  })
  
  // 返回出现次数大于1的ID集合
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
  // 直接从 CSS 变量读取背景色，确保与页面显示一致
  const computedStyle = getComputedStyle(document.documentElement)
  const bgColor = computedStyle.getPropertyValue('--bg-color').trim()
  
  // 如果成功读取到颜色值，返回它
  if (bgColor) {
    return bgColor
  }
  
  // 如果读取失败，回退到检测主题
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
  
  return '#ffffff' // 默认浅色模式
}

// 初始化主题
function initTheme() {
  const theme = loadThemePreference()
  applyTheme(theme)
  
  // 如果设置为 auto，监听系统主题变化
  if (theme === 'auto') {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleSystemThemeChange = (e: MediaQueryListEvent) => {
      // 只有在设置为 auto 时才响应系统变化
      const currentTheme = loadThemePreference()
      if (currentTheme === 'auto') {
        // data-theme 保持为 auto，CSS 会自动响应媒体查询
        applyTheme('auto')
      }
    }
    mediaQuery.addEventListener('change', handleSystemThemeChange)
  }
}

// 点击外部关闭导出菜单
function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('.export-menu-container')) {
    showExportMenu.value = false
  }
}

// 加载数据
onMounted(() => {
  // 监听点击事件，用于关闭导出菜单
  document.addEventListener('click', handleClickOutside)
  
  initTheme()
  title.value = loadTitle()
  titleFontSize.value = loadTitleFontSize()
  hideItemNames.value = loadHideItemNames()
  exportScale.value = loadExportScale()
  tierConfigs.value = loadTierConfigs()
  tiers.value = loadTierData()
  
  // 设置标题的初始内容
  nextTick(() => {
    if (titleRef.value) {
      titleRef.value.textContent = title.value
    }
  })
  
  // 确保 tiers 和 tierConfigs 同步
  const configIds = new Set(tierConfigs.value.map(c => c.id))
  
  // 移除配置中不存在的等级
  tiers.value = tiers.value.filter(t => configIds.has(t.id))
  
  // 添加配置中存在但 tiers 中不存在的等级
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
  
  // 按配置顺序排序
  tiers.value.sort((a, b) => {
    const aOrder = tierConfigs.value.find(c => c.id === a.id)?.order ?? 999
    const bOrder = tierConfigs.value.find(c => c.id === b.id)?.order ?? 999
    return aOrder - bOrder
  })
  
  // 保存同步后的数据
  saveTierData(tiers.value)
})

// 清理事件监听
onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

// 监听数据变化，自动保存
watch(tiers, () => {
  saveTierData(tiers.value)
}, { deep: true })

function handleAddItem(tierId: string, rowId: string, index: number) {
  currentTierId.value = tierId
  currentRowId.value = rowId
  currentIndex.value = index
  showSearch.value = true
}

function handleSelectAnime(anime: AnimeItem) {
  if (currentTierId.value && currentRowId.value && currentIndex.value !== null) {
    const tier = tiers.value.find(t => t.id === currentTierId.value)
    if (tier) {
      const row = tier.rows.find(r => r.id === currentRowId.value)
      if (row) {
        // 确保数组长度足够
        while (row.items.length <= currentIndex.value) {
          row.items.push({} as AnimeItem)
        }
        row.items[currentIndex.value] = anime
      }
    }
  }
  showSearch.value = false
  currentTierId.value = null
  currentRowId.value = null
  currentIndex.value = null
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
    const index = tier.rows.findIndex(r => r.id === rowId)
    if (index !== -1) {
      tier.rows.splice(index, 1)
    }
  }
}

function handleDeleteItem(tierId: string, rowId: string, index: number) {
  const tier = tiers.value.find(t => t.id === tierId)
  if (tier) {
    const row = tier.rows.find(r => r.id === rowId)
    if (row) {
      row.items.splice(index, 1)
    }
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
  // 找到源行和目标行
  const fromTier = tiers.value.find(t => t.id === data.fromTierId)
  const toTier = tiers.value.find(t => t.id === data.toTierId)
  
  if (!fromTier || !toTier) return
  
  const fromRow = fromTier.rows.find(r => r.id === data.fromRowId)
  const toRow = toTier.rows.find(r => r.id === data.toRowId)
  
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
    
    saveTierData(tiers.value)
  }
}

function handleReorder(tierId: string, rowId: string, newItems: AnimeItem[]) {
  const tier = tiers.value.find(t => t.id === tierId)
  if (!tier) return
  
  const row = tier.rows.find(r => r.id === rowId)
  if (!row) return
  
  row.items = newItems
  saveTierData(tiers.value)
}

function handleEditItem(tierId: string, rowId: string, item: AnimeItem, index: number, isLongPress?: boolean) {
  currentTierId.value = tierId
  currentRowId.value = rowId
  currentIndex.value = index
  currentEditItem.value = { ...item } // 创建副本
  isLongPressEdit.value = isLongPress || false
  showEditItem.value = true
}

function handleSaveEditItem(updatedItem: AnimeItem) {
  if (currentTierId.value && currentRowId.value && currentIndex.value !== null) {
    const tier = tiers.value.find(t => t.id === currentTierId.value)
    if (tier) {
      const row = tier.rows.find(r => r.id === currentRowId.value)
      if (row) {
        row.items[currentIndex.value] = updatedItem
      }
    }
  }
  showEditItem.value = false
  currentTierId.value = null
  currentRowId.value = null
  currentIndex.value = null
  currentEditItem.value = null
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
  // 保存旧配置的映射（通过 order 映射到 tier）
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
  
  // 构建新的 tiers 数组，通过 order 匹配保留作品数据
  const newTiers: Tier[] = []
  const processedOldTiers = new Set<Tier>()
  
  newConfigs.forEach(config => {
    // 通过 order 找到对应的旧 tier（如果有）
    const oldTier = oldTierByOrder.get(config.order)
    
    if (oldTier) {
      // 找到匹配的旧 tier，更新 id 但保留所有作品数据
      oldTier.id = config.id
      // 更新 row 的 id（因为 row id 包含 tier id）
      oldTier.rows.forEach((row, rowIndex) => {
        if (rowIndex === 0) {
          row.id = `${config.id}-row-0`
        } else {
          // 如果有多行，保持原有格式
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
      // 没有找到匹配的旧 tier（新增的等级），创建新的空 tier
      newTiers.push({
        id: config.id,
        rows: [{
          id: `${config.id}-row-0`,
          items: [],
        }],
      })
    }
  })
  
  // 替换整个 tiers 数组
  tiers.value = newTiers
  
  // 保存更新后的数据
  saveTierData(tiers.value)
  
  // 等待 DOM 更新后重新计算等级块宽度
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
  console.log('App.vue 接收到隐藏作品名更新:', hide)
  hideItemNames.value = hide
  console.log('App.vue hideItemNames.value:', hideItemNames.value)
}

function handleUpdateExportScale(scale: number) {
  exportScale.value = scale
}

function handleClearAll() {
  try {
    // 只清空作品数据和标题，保留所有设置
    clearItemsAndTitle()
    
    // 重置 tiers 为默认结构（清空所有作品）
    tiers.value = tierConfigs.value.map(config => ({
      id: config.id,
      rows: [{
        id: `${config.id}-row-0`,
        items: [],
      }],
    }))
    saveTierData(tiers.value)
    
    // 重置标题和字体大小
    title.value = 'Tier List'
    titleFontSize.value = 32
    saveTitle(title.value)
    saveTitleFontSize(titleFontSize.value)
    
    // 更新标题显示
    nextTick(() => {
      if (titleRef.value) {
        titleRef.value.textContent = title.value
      }
    })
  } catch (error) {
    console.error('清空数据失败:', error)
    alert('清空数据失败，请刷新页面重试')
  }
}

function handleResetSettings() {
  try {
    // 重置所有设置，但保留作品数据和标题
    resetSettings()
    
    // 重置评分等级配置
    tierConfigs.value = JSON.parse(JSON.stringify(DEFAULT_TIER_CONFIGS))
    saveTierConfigs(tierConfigs.value)
    
    // 重置标题字体大小
    titleFontSize.value = 32
    saveTitleFontSize(titleFontSize.value)
    
    // 重置主题
    const theme = loadThemePreference()
    applyTheme(theme)
    
    // 重置隐藏作品名
    hideItemNames.value = false
    
    // 重置导出倍率
    exportScale.value = 4
    
    // 注意：不重置标题，保留用户设置的标题
    
    // 同步 tiers 和 tierConfigs（确保结构一致）
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
    
    saveTierData(tiers.value)
    
    // 重置成功，刷新设置页面内容让用户注意到重置已完成
    if (showConfig.value) {
      // 通过改变 key 强制重新渲染 ConfigModal，实现重新加载内容的效果
      configModalKey.value++
    }
  } catch (error) {
    console.error('重置设置失败:', error)
    alert('重置设置失败，请刷新页面重试')
  }
}

// 监听设置页面关闭，重新计算宽度
watch(showConfig, (newVal, oldVal) => {
  if (oldVal === true && newVal === false) {
    // 设置页面刚关闭
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
const isExportingImage = ref(false)
const isExportingPDF = ref(false)
const showExportMenu = ref(false)
const showClearConfirm = ref(false)

function handleTitleInput(e: Event) {
  const target = e.target as HTMLHeadingElement
  // 总是更新 title，即使内容为空（允许删除）
  const newTitle = target.textContent?.trim() || ''
  title.value = newTitle || 'Tier List'
  saveTitle(title.value)
}

function handleTitleBlur(e: Event) {
  const target = e.target as HTMLHeadingElement
  isEditingTitle.value = false
  
  // 先保存当前内容
  const newTitle = target.textContent?.trim() || ''
  if (newTitle) {
    title.value = newTitle
    saveTitle(title.value)
  } else {
    // 如果为空，恢复为默认值
    const defaultTitle = 'Tier List'
    title.value = defaultTitle
    target.textContent = defaultTitle
    saveTitle(defaultTitle)
  }
}

function handleTitleFocus() {
  isEditingTitle.value = true
}

// 监听 title 变化，只在非编辑状态下更新 DOM
watch(title, (newTitle) => {
  if (!isEditingTitle.value && titleRef.value) {
    titleRef.value.textContent = newTitle
  }
})

// 导出数据（JSON）
function handleExportJSON() {
  try {
    const data = exportAllData()
    const jsonStr = JSON.stringify(data, null, 2)
    const blob = new Blob([jsonStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tier-list-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showExportMenu.value = false
  } catch (error) {
    console.error('导出失败:', error)
    alert('导出失败，请重试')
  }
}

// 处理导出菜单点击
function handleExportClick(type: 'image' | 'pdf' | 'json') {
  if (type === 'image') {
    handleExportImage()
  } else if (type === 'pdf') {
    handleExportPDF()
  } else if (type === 'json') {
    handleExportJSON()
  }
  showExportMenu.value = false
}

// 处理清空数据点击
function handleClearClick() {
  showClearConfirm.value = true
}

// 确认清空数据
function handleConfirmClear() {
  showClearConfirm.value = false
  handleClearAll()
}

// 取消清空数据
function handleCancelClear() {
  showClearConfirm.value = false
}

// 导入数据
const fileInputRef = ref<HTMLInputElement | null>(null)

function handleImportClick() {
  fileInputRef.value?.click()
}

function handleFileImport(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  
  const reader = new FileReader()
  reader.onload = (event) => {
    try {
      const jsonStr = event.target?.result as string
      const data: ExportData = JSON.parse(jsonStr)
      
      // 验证数据格式
      if (!data.tiers || !data.tierConfigs) {
        alert('文件格式不正确')
        return
      }
      
      // 确认导入
      if (confirm('导入数据将覆盖当前所有数据，是否继续？')) {
        const result = importAllData(data)
        if (result.success) {
          // 重新加载数据
          title.value = loadTitle()
          tierConfigs.value = loadTierConfigs()
          tiers.value = loadTierData()
          
          // 同步数据
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
          
          // 更新标题显示
          nextTick(() => {
            if (titleRef.value) {
              titleRef.value.textContent = title.value
            }
          })
          
          // 导入成功，无需提示
        } else {
          alert(`导入失败: ${result.error || '未知错误'}`)
        }
      }
    } catch (error) {
      console.error('导入失败:', error)
      alert('文件格式不正确或已损坏')
    }
    
    // 清空文件输入
    if (target) {
      target.value = ''
    }
  }
  reader.readAsText(file)
}

// 保存为高清图片
// 保存为高清图片（极速版：移除Base64转换，使用CSS逻辑）
async function handleExportImage() {
  if (!appContentRef.value) {
    alert('无法找到要导出的内容')
    return
  }
  
  if (isExportingImage.value) {
    return // 防止重复点击
  }
  
  isExportingImage.value = true
  
  try {
    await nextTick()
    
    // 保存滚动位置并滚回顶部（防止截图不全）
    const originalScrollX = window.scrollX
    const originalScrollY = window.scrollY
    window.scrollTo(0, 0)
    await new Promise(resolve => setTimeout(resolve, 100))
    
    const currentScale = exportScale.value // 使用用户设置的导出倍率
    const canvas = await html2canvas(appContentRef.value, {
      scale: currentScale, // 使用用户设置的倍率
      useCORS: true, // <--- 核心：开启跨域，利用 wsrv.nl 的 Header
      allowTaint: false,
      logging: false,
      backgroundColor: getCurrentThemeBackgroundColor(),
      imageTimeout: 15000, // 给予足够的加载时间
      
      onclone: async (clonedDoc) => {
        // 1. 同步主题
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'auto'
        clonedDoc.documentElement.setAttribute('data-theme', currentTheme)
        
        // 2. 隐藏无关 UI (按钮等)
        const buttons = clonedDoc.querySelectorAll('button, .btn, .header-actions')
        buttons.forEach((el) => (el as HTMLElement).style.display = 'none')
        const headerLeft = clonedDoc.querySelector('.header-left') as HTMLElement
        if (headerLeft) {
          headerLeft.style.display = 'none'
        }
        
        // 3. 处理 Empty Slots
        const emptySlots = clonedDoc.querySelectorAll('.tier-item.empty')
        emptySlots.forEach((slot) => {
          const el = slot as HTMLElement
          const parent = el.parentElement
          const hasItems = parent && Array.from(parent.children).some(c => !c.classList.contains('empty'))
          
          if (hasItems) {
            el.style.display = 'none'
          } else {
            el.style.opacity = '0'
            el.style.border = 'none'
            const content = el.querySelectorAll('.item-placeholder, .placeholder-text')
            content.forEach(c => (c as HTMLElement).style.display = 'none')
          }
        })
        
        // 4. 【关键步骤】将所有图片URL替换为CORS代理URL，并等待加载后裁剪
        const allImages = clonedDoc.querySelectorAll('img') as NodeListOf<HTMLImageElement>
        const imageProcessPromises: Promise<void>[] = []
        
        allImages.forEach((img) => {
          const processPromise = new Promise<void>(async (resolve) => {
            const originalSrc = img.getAttribute('data-original-src') || img.getAttribute('src')
            
            // 替换为CORS代理URL
            if (originalSrc && !originalSrc.startsWith('data:') && !originalSrc.includes('wsrv.nl')) {
              const proxyUrl = getCorsProxyUrl(originalSrc)
              img.src = proxyUrl
              img.crossOrigin = 'anonymous'
            }
            
            // 等待图片加载完成
            const waitForLoad = () => {
              if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
                // 图片已加载，进行裁剪（传入导出缩放比例）
                cropImageWithCanvas(img, currentScale).then((croppedBase64) => {
                  if (croppedBase64) {
                    img.src = croppedBase64
                    img.style.width = '100px'
                    img.style.height = '133px'
                    img.style.objectFit = 'none' // 不再需要object-fit
                  } else {
                    // 如果裁剪失败，使用CSS方式
                    applySmartCropToImage(img)
                  }
                  resolve()
                })
              } else {
                // 图片未加载完成，等待加载
                img.onload = waitForLoad
                img.onerror = () => resolve()
              }
            }
            
            waitForLoad()
          })
          
          imageProcessPromises.push(processPromise)
        })
        
        // 等待所有图片处理完成
        await Promise.allSettled(imageProcessPromises)
        
        // 5. 确保 Header 样式正确
        const header = clonedDoc.querySelector('.header') as HTMLElement
        if (header) {
          let titleFontSize = 32
          try {
            const originalTitle = document.querySelector('.title') as HTMLElement
            if (originalTitle) {
              const computedStyle = window.getComputedStyle(originalTitle)
              const fontSizeStr = computedStyle.fontSize
              const parsedSize = parseFloat(fontSizeStr)
              if (!isNaN(parsedSize) && parsedSize > 0) {
                titleFontSize = parsedSize
              }
            }
          } catch (e) {
            console.warn('获取标题字体大小失败，使用默认值32px:', e)
          }
          header.style.paddingBottom = `${titleFontSize / 2}px`
          header.style.marginBottom = '0'
        }
        
        // 6. 确保标题正常显示
        const clonedTitle = clonedDoc.querySelector('.title') as HTMLElement
        if (clonedTitle) {
          clonedTitle.style.display = 'block'
          clonedTitle.style.visibility = 'visible'
          clonedTitle.style.position = 'relative'
          clonedTitle.style.left = 'auto'
          clonedTitle.style.transform = 'none'
          clonedTitle.style.textAlign = 'center'
          clonedTitle.style.width = '100%'
          clonedTitle.style.margin = '0'
          clonedTitle.style.padding = '0'
          clonedTitle.style.lineHeight = '1'
        }
        
        // 7. 设置 tier-list 的顶部间距
        const clonedTierList = clonedDoc.querySelector('.tier-list') as HTMLElement
        if (clonedTierList) {
          clonedTierList.style.marginTop = '0'
          clonedTierList.style.paddingTop = '0'
        }
        
        // 8. Tight 模式：移除所有留白
        const originalApp = appContentRef.value as HTMLElement
        const originalAppWidth = originalApp.offsetWidth || originalApp.scrollWidth
        const clonedApp = clonedDoc.querySelector('.app') as HTMLElement
        if (clonedApp) {
          clonedApp.style.padding = '0'
          clonedApp.style.margin = '0'
          clonedApp.style.width = `${originalAppWidth}px`
          clonedApp.style.maxWidth = `${originalAppWidth}px`
        }
      }
    })
    
    // 恢复滚动
    window.scrollTo(originalScrollX, originalScrollY)
    
    // 导出
    canvas.toBlob((blob) => {
      if (!blob) {
        alert('生成图片失败')
        isExportingImage.value = false
        return
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      // 使用 JPEG 0.9 质量，比 PNG 快且体积小，画质几乎无损
      a.download = `tier-list-${new Date().toISOString().split('T')[0]}.jpg`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      isExportingImage.value = false
    }, 'image/jpeg', 0.9)
    
  } catch (error) {
    console.error('导出图片失败:', error)
    alert('导出失败，请检查网络连接')
    isExportingImage.value = false
  }
}


// 保存为PDF（带超链接）
async function handleExportPDF() {
  if (!appContentRef.value) {
    alert('无法找到要导出的内容')
    return
  }
  
  if (isExportingPDF.value || isExportingImage.value) {
    return // 防止重复点击
  }
  
  isExportingPDF.value = true
  
  try {
    // 等待DOM更新
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // 保存当前滚动位置
    const originalScrollX = window.scrollX
    const originalScrollY = window.scrollY
    
    // 滚动到顶部
    window.scrollTo(0, 0)
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // 收集所有作品项的位置和链接信息
    const itemLinks: Array<{ url: string; rect: DOMRect; item: AnimeItem }> = []
    
    // 遍历所有tier和items，收集链接信息
    // 使用更可靠的方式查找DOM元素
    tiers.value.forEach(tier => {
      tier.rows.forEach(row => {
        row.items.forEach((item, itemIndex) => {
          if (item.id) {
            const url = getItemUrl(item)
            if (!url) {
              // console.warn(`作品项没有URL:`, item.id, item.name)
              return
            }
            
            // 方法1: 通过 data-item-id 属性查找（在img元素上）
            const imgElement = document.querySelector(`img[data-item-id="${item.id}"]`) as HTMLImageElement
            let itemElement: HTMLElement | null = null
            
            if (imgElement) {
              itemElement = imgElement.closest('.tier-item') as HTMLElement
            }
            
            // 方法2: 如果方法1失败，尝试通过 rowId 和索引查找
            if (!itemElement && row.id) {
              const rowElement = document.querySelector(`[data-row-id="${row.id}"]`) as HTMLElement
              if (rowElement) {
                const tierItems = rowElement.querySelectorAll('.tier-item:not(.empty)')
                if (itemIndex < tierItems.length) {
                  itemElement = tierItems[itemIndex] as HTMLElement
                }
              }
            }
            
            if (itemElement) {
              const rect = itemElement.getBoundingClientRect()
              const appRect = appContentRef.value!.getBoundingClientRect()
              // 相对于appContent的位置
              const relativeRect = new DOMRect(
                rect.left - appRect.left,
                rect.top - appRect.top,
                rect.width,
                rect.height
              )
              itemLinks.push({ url, rect: relativeRect, item })
              // console.log(`✅ 找到链接:`, item.name || item.id, url)
            } else {
              // console.warn(`❌ 找不到DOM元素:`, item.id, item.name, row.id, itemIndex)
            }
          }
        })
      })
    })
    
    const totalItems = tiers.value.reduce((sum, tier) => 
      sum + tier.rows.reduce((rowSum, row) => rowSum + row.items.filter(item => item.id).length, 0), 0)
    // console.log(`📊 总共收集到 ${itemLinks.length} 个链接，总作品数: ${totalItems}`)
    
    // 使用 html2canvas 生成图片（极速版：使用CORS直连）
    const currentScale = exportScale.value // 使用用户设置的导出倍率
    const canvas = await html2canvas(appContentRef.value, {
      scale: currentScale, // 使用用户设置的倍率
      useCORS: true, // 开启CORS支持，利用wsrv.nl代理的CORS Header
      allowTaint: false,
      logging: false,
      backgroundColor: getCurrentThemeBackgroundColor(),
      imageTimeout: 15000,
      onclone: async (clonedDoc) => {
        // 同步主题
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'auto'
        clonedDoc.documentElement.setAttribute('data-theme', currentTheme)
        
        // 隐藏 UI
        clonedDoc.querySelectorAll('button, .btn, .header-actions').forEach((el: any) => el.style.display = 'none')
        const headerLeft = clonedDoc.querySelector('.header-left') as HTMLElement
        if (headerLeft) {
          headerLeft.style.display = 'none'
        }
        const modals = clonedDoc.querySelectorAll('.modal-overlay, [class*="modal"]')
        modals.forEach((modal) => {
          (modal as HTMLElement).style.display = 'none'
        })
        
        // 将所有图片URL替换为CORS代理URL，并等待加载后裁剪
        const allImages = clonedDoc.querySelectorAll('img') as NodeListOf<HTMLImageElement>
        const imageProcessPromises: Promise<void>[] = []
        
        allImages.forEach((img) => {
          const processPromise = new Promise<void>(async (resolve) => {
            const originalSrc = img.getAttribute('data-original-src') || img.getAttribute('src')
            
            // 替换为CORS代理URL
            if (originalSrc && !originalSrc.startsWith('data:') && !originalSrc.includes('wsrv.nl')) {
              const proxyUrl = getCorsProxyUrl(originalSrc)
              img.src = proxyUrl
              img.crossOrigin = 'anonymous'
            }
            
            // 等待图片加载完成
            const waitForLoad = () => {
              if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
                // 图片已加载，进行裁剪（传入导出缩放比例）
                cropImageWithCanvas(img, currentScale).then((croppedBase64) => {
                  if (croppedBase64) {
                    img.src = croppedBase64
                    img.style.width = '100px'
                    img.style.height = '133px'
                    img.style.objectFit = 'none' // 不再需要object-fit
                  } else {
                    // 如果裁剪失败，使用CSS方式
                    applySmartCropToImage(img)
                  }
                  resolve()
                })
              } else {
                // 图片未加载完成，等待加载
                img.onload = waitForLoad
                img.onerror = () => resolve()
              }
            }
            
            waitForLoad()
          })
          
          imageProcessPromises.push(processPromise)
        })
        
        // 等待所有图片处理完成
        await Promise.allSettled(imageProcessPromises)
        
        // 处理 Empty Slots
        const emptySlots = clonedDoc.querySelectorAll('.tier-item.empty')
        emptySlots.forEach((slot) => {
          const el = slot as HTMLElement
          const parent = el.parentElement
          const hasItems = parent && Array.from(parent.children).some(c => !c.classList.contains('empty'))
          
          if (hasItems) {
            el.style.display = 'none'
          } else {
            el.style.opacity = '0'
            el.style.border = 'none'
            const content = el.querySelectorAll('.item-placeholder, .placeholder-text')
            content.forEach(c => (c as HTMLElement).style.display = 'none')
          }
        })
        
        // 确保 Header 样式正确
        const header = clonedDoc.querySelector('.header') as HTMLElement
        if (header) {
          header.style.paddingBottom = `${titleFontSize.value / 2}px`
          header.style.marginBottom = '0'
        }
        
        // 确保标题正常显示
        const clonedTitle = clonedDoc.querySelector('.title') as HTMLElement
        if (clonedTitle) {
          clonedTitle.style.display = 'block'
          clonedTitle.style.visibility = 'visible'
          clonedTitle.style.position = 'relative'
          clonedTitle.style.left = 'auto'
          clonedTitle.style.transform = 'none'
          clonedTitle.style.textAlign = 'center'
          clonedTitle.style.width = '100%'
          clonedTitle.style.margin = '0'
          clonedTitle.style.padding = '0'
          clonedTitle.style.lineHeight = '1'
        }
        
        // 设置 tier-list 的顶部间距
        const clonedTierList = clonedDoc.querySelector('.tier-list') as HTMLElement
        if (clonedTierList) {
          clonedTierList.style.marginTop = '0'
          clonedTierList.style.paddingTop = '0'
        }
      }
    })
    
    // 恢复滚动位置
    window.scrollTo(originalScrollX, originalScrollY)
    
    // 计算PDF尺寸（A4比例，但根据内容调整宽度）
    // 注意：canvas 使用了用户设置的 scale，所以 canvas 尺寸是实际 DOM 的 scale 倍
    const canvasWidth = canvas.width
    const canvasHeight = canvas.height
    const htmlScaleForPDF = currentScale // html2canvas 的 scale 参数
    const actualDomWidth = canvasWidth / htmlScaleForPDF // 实际 DOM 宽度
    const actualDomHeight = canvasHeight / htmlScaleForPDF // 实际 DOM 高度
    
    const pdfWidth = 210 // A4宽度（mm）
    const pdfHeight = (canvasHeight / canvasWidth) * pdfWidth // 按比例计算高度
    
    // 创建PDF（使用实际内容高度，不强制最小高度，避免底部空白）
    const pdf = new jsPDF({
      orientation: pdfHeight > pdfWidth ? 'portrait' : 'landscape',
      unit: 'mm',
      format: [pdfWidth, pdfHeight], // 使用实际内容高度
    })
    
    // 将canvas转换为图片并添加到PDF
    // 使用 JPEG 压缩，显著减小 PDF 体积并提升生成速度
    const imgData = canvas.toDataURL('image/jpeg', 0.9)
    pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST')
    
    // 为每个作品项添加超链接
    // 重新计算比例: contentWidth 已经是 scale:2 之后的大小了
    // 我们的 itemLinks.rect 是基于原始 DOM (scale:1) 的
    const domWidth = canvasWidth / htmlScaleForPDF
    const domHeight = canvasHeight / htmlScaleForPDF
    const scaleX = pdfWidth / domWidth
    const scaleY = pdfHeight / domHeight
    
    itemLinks.forEach(({ url, rect }) => {
      pdf.link(
        rect.left * scaleX, 
        rect.top * scaleY, 
        rect.width * scaleX, 
        rect.height * scaleY, 
        { url }
      )
    })
    
    // console.log(`📄 PDF尺寸: ${pdfWidth}x${pdfHeight}mm, Canvas尺寸: ${canvasWidth}x${canvasHeight}px (scale=${htmlScale})`)
    
    // 保存PDF
    pdf.save(`tier-list-${new Date().toISOString().split('T')[0]}.pdf`)
    
    isExportingPDF.value = false
  } catch (error) {
    console.error('导出PDF失败:', error)
    alert('导出PDF失败：' + (error instanceof Error ? error.message : '未知错误'))
    isExportingPDF.value = false
  }
}

// 使用CORS代理获取图片（使用 wsrv.nl，专门用于图片处理，更稳定）
function getCorsProxyUrl(url: string): string {
  if (!url) return ''
  // 如果已经是 wsrv，直接返回
  if (url.includes('wsrv.nl')) return url
  
  // 关键优化：移除 t=... 时间戳，允许浏览器缓存图片
  // output=png 保证透明度和兼容性
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&output=png`
}

// 核心逻辑：根据 3:4 (0.75) 比例智能调整裁剪位置
// s > 0.75 (宽图/标准图): 居中 (center center)
// s < 0.75 (长图): 保留顶部 (center top)
// 统一处理所有图片（包括角色和bangumi），使用相同的裁剪规则
function applySmartCropToImage(img: HTMLImageElement) {
  // 必须有宽高才能计算，如果没有加载完则忽略
  if (img.naturalWidth && img.naturalHeight) {
    const ratio = img.naturalWidth / img.naturalHeight
    const targetRatio = 0.75
    
    img.style.objectFit = 'cover' // 确保填满
    img.style.width = '100px'
    img.style.height = '133px'
    
    if (ratio < targetRatio) {
      // 场景：长图 (如 9:16) -> 靠上裁剪，保留头部
      img.style.objectPosition = 'center top'
    } else {
      // 场景：宽图 (如 16:9, 1:1, 4:3) -> 居中裁剪
      img.style.objectPosition = 'center center'
    }
  }
}

// 使用canvas手动裁剪图片（用于导出，确保html2canvas正确渲染）
// 统一处理所有图片（包括角色和bangumi），使用相同的裁剪规则
async function cropImageWithCanvas(img: HTMLImageElement, scale: number = 1): Promise<string | null> {
  // 必须有宽高才能计算
  if (!img.naturalWidth || !img.naturalHeight) {
    return null
  }
  
  const naturalWidth = img.naturalWidth
  const naturalHeight = img.naturalHeight
  const naturalAspectRatio = naturalWidth / naturalHeight
  const targetAspectRatio = 0.75 // 3/4
  // 根据导出缩放比例提高canvas分辨率，确保放大后清晰
  const containerWidth = 100 * scale
  const containerHeight = 133 * scale
  
  // 计算裁剪区域
  // 原理：先按目标尺寸等比缩放，然后从原图中裁剪对应区域
  let sourceX = 0
  let sourceY = 0
  let sourceWidth = naturalWidth
  let sourceHeight = naturalHeight
  
  if (naturalAspectRatio > targetAspectRatio) {
    // s > 0.75：图片较宽
    // 1. 等比缩放使高度对齐133px
    //    缩放比例 = 133 / naturalHeight
    //    缩放后的宽度 = naturalWidth * (133 / naturalHeight) > 100px
    // 2. 需要从原图中裁剪出对应100px的部分（居中）
    //    原图中对应100px的宽度 = 100 / (133 / naturalHeight) = 100 * naturalHeight / 133
    const scaleByHeight = containerHeight / naturalHeight
    const targetWidthInOriginal = containerWidth / scaleByHeight
    sourceWidth = targetWidthInOriginal
    sourceX = (naturalWidth - sourceWidth) / 2 // 居中裁剪
    sourceY = 0
    sourceHeight = naturalHeight
  } else {
    // s < 0.75：图片较高
    // 1. 等比缩放使宽度对齐100px
    //    缩放比例 = 100 / naturalWidth
    //    缩放后的高度 = naturalHeight * (100 / naturalWidth) > 133px
    // 2. 需要从原图中裁剪出对应133px的部分（保留顶部）
    //    原图中对应133px的高度 = 133 / (100 / naturalWidth) = 133 * naturalWidth / 100
    const scaleByWidth = containerWidth / naturalWidth
    const targetHeightInOriginal = containerHeight / scaleByWidth
    sourceX = 0
    sourceY = 0 // 保留顶部
    sourceWidth = naturalWidth
    sourceHeight = targetHeightInOriginal
  }
  
  // 使用canvas裁剪图片
  try {
    const canvas = document.createElement('canvas')
    canvas.width = containerWidth
    canvas.height = containerHeight
    const ctx = canvas.getContext('2d')
    
    if (!ctx) {
      return null
    }
    
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    
    // 绘制裁剪后的图片
    // 从原图中裁剪出指定区域，然后缩放到目标尺寸
    ctx.drawImage(
      img,
      Math.round(sourceX), Math.round(sourceY), Math.round(sourceWidth), Math.round(sourceHeight),
      0, 0, containerWidth, containerHeight
    )
    
    // 返回裁剪后的base64，使用高质量PNG格式
    return canvas.toDataURL('image/png', 1.0)
  } catch (error) {
    console.error('裁剪图片失败:', error)
    return null
  }
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
        title="点击编辑标题"
      ></h1>
      <div class="header-actions">
        <div class="export-menu-container">
          <button 
            class="btn btn-secondary" 
            :class="{ 'export-menu-open': showExportMenu }"
            @click.stop="showExportMenu = !showExportMenu"
            title="导出"
            :disabled="isExportingImage || isExportingPDF"
          >
            {{ isExportingImage ? '准备中...' : isExportingPDF ? '准备中...' : '导出' }}
            <span class="export-arrow">▼</span>
          </button>
          <div v-if="showExportMenu" class="export-menu" @click.stop>
            <button 
              class="export-menu-item" 
              @click="handleExportClick('image')"
              :disabled="isExportingImage || isExportingPDF"
            >
              图片
            </button>
            <button 
              class="export-menu-item" 
              @click="handleExportClick('pdf')"
              :disabled="isExportingImage || isExportingPDF"
            >
              PDF
            </button>
            <button 
              class="export-menu-item" 
              @click="handleExportClick('json')"
            >
              JSON
            </button>
          </div>
        </div>
        <button 
          v-if="isExportingImage || isExportingPDF" 
          class="btn btn-secondary" 
          @click="isExportingImage = false; isExportingPDF = false" 
          title="停止保存"
        >
          停止保存
        </button>
        <button class="btn btn-secondary" @click="handleImportClick" title="导入数据">
          导入
        </button>
        <input
          ref="fileInputRef"
          type="file"
          accept=".json"
          style="display: none"
          @change="handleFileImport"
        />
        <button class="btn btn-danger" @click="handleClearClick" title="清空所有作品和恢复默认标题">
          清空数据
        </button>
        <button class="btn btn-secondary" @click="showConfig = true">
          设置
        </button>
      </div>
    </header>

    <TierList
      ref="tierListRef"
      :tiers="tiers"
      :tier-configs="tierConfigs"
      :is-dragging="isDragging"
      :is-exporting-image="isExportingImage"
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

    <SearchModal
      v-if="showSearch"
      @close="showSearch = false"
      @select="handleSelectAnime"
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
  </div>
</template>

<style scoped>
.app {
  max-width: 1400px;
  margin: 0 auto;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0;
  border-bottom: 2px solid var(--border-color);
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
  padding: 10px 20px;
  border: 2px solid var(--border-color);
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 14px;
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

.export-menu-container {
  position: relative;
}

.export-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 5px;
  background: var(--bg-color);
  border: 2px solid var(--border-color);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  min-width: 120px;
  display: flex;
  flex-direction: column;
}

.export-menu-item {
  padding: 10px 20px;
  border: none;
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
  border-bottom: 1px solid var(--border-light-color);
}

.export-menu-item:last-child {
  border-bottom: none;
}

.export-menu-item:hover:not(:disabled) {
  background: var(--border-color);
  color: var(--bg-color);
}

.export-menu-item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.export-arrow {
  margin-left: 5px;
  font-size: 10px;
  display: inline-block;
  transition: transform 0.2s;
}

.export-menu-open .export-arrow {
  transform: rotate(180deg);
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
  border: 3px solid var(--border-color);
  width: 90%;
  max-width: 500px;
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
  padding: 20px;
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

