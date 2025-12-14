<script setup lang="ts">
import { ref, onMounted, watch, nextTick, computed } from 'vue'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import TierList from './components/TierList.vue'
import SearchModal from './components/SearchModal.vue'
import ConfigModal from './components/ConfigModal.vue'
import EditItemModal from './components/EditItemModal.vue'
import { getItemUrl } from './utils/url'
import type { Tier, AnimeItem, TierConfig } from './types'
import { loadTierData, saveTierData, loadTierConfigs, saveTierConfigs, loadTitle, saveTitle, exportAllData, importAllData, type ExportData } from './utils/storage'

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
const title = ref<string>('极简 Tier List')
const isDragging = ref(false) // 全局拖动状态
const tierListRef = ref<InstanceType<typeof TierList> | null>(null)

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

// 加载数据
onMounted(() => {
  title.value = loadTitle()
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

function handleTitleInput(e: Event) {
  const target = e.target as HTMLHeadingElement
  // 总是更新 title，即使内容为空（允许删除）
  const newTitle = target.textContent?.trim() || ''
  title.value = newTitle || '极简 Tier List'
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
    const defaultTitle = '极简 Tier List'
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

// 导出数据
function handleExport() {
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
  } catch (error) {
    console.error('导出失败:', error)
    alert('导出失败，请重试')
  }
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
          
          alert('导入成功！')
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
    // 等待DOM更新，确保empty slot已隐藏
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // 保存当前滚动位置
    const originalScrollX = window.scrollX
    const originalScrollY = window.scrollY
    
    // 滚动到顶部
    window.scrollTo(0, 0)
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // 获取实际内容区域的尺寸（tight 模式，不包含任何留白）
    const scrollWidth = appContentRef.value?.scrollWidth || appContentRef.value?.offsetWidth || 1400
    const scrollHeight = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
      appContentRef.value.scrollHeight
    )
    
    // 创建一个图片URL到base64的映射，用于在onclone中使用
    const imageUrlToBase64 = new Map<string, string>()
    
    // 预先转换所有图片为base64
    const allImages = Array.from(document.querySelectorAll('img')) as HTMLImageElement[]
    const conversionPromises = allImages.map(async (img) => {
      // 优先使用data-original-src，如果没有则使用src
      const originalUrl = img.getAttribute('data-original-src') || img.src
      
      if (!originalUrl || originalUrl === '') {
        return
      }
      
      // 如果已经是base64，直接保存
      if (originalUrl.startsWith('data:')) {
        imageUrlToBase64.set(originalUrl, originalUrl)
        // 同时保存src的映射（如果src不同）
        if (img.src && img.src !== originalUrl) {
          imageUrlToBase64.set(img.src, originalUrl)
        }
        return
      }
      
      // 方法1: 尝试从已加载的图片元素中直接获取base64（绕过CORS）
      try {
        // 检查图片是否已完全加载
        if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
          const base64 = await convertLoadedImageToBase64(img)
          if (base64) {
            imageUrlToBase64.set(originalUrl, base64)
            if (img.src && img.src !== originalUrl) {
              imageUrlToBase64.set(img.src, base64)
            }
            // console.log('✅ 从已加载图片获取base64:', originalUrl.substring(0, 50) + '...')
            return
          }
        }
      } catch (error) {
        // console.debug('从已加载图片获取失败，尝试其他方法:', error)
      }
      
      // 方法2: 如果是URL，尝试通过网络转换（可能因CORS失败）
      try {
        const base64 = await convertImageToBase64ForExport(originalUrl)
        if (base64) {
          // 保存原始URL到base64的映射
          imageUrlToBase64.set(originalUrl, base64)
          // 同时保存src的映射（如果src不同）
          if (img.src && img.src !== originalUrl) {
            imageUrlToBase64.set(img.src, base64)
          }
          // console.log('✅ 通过网络转换成功:', originalUrl.substring(0, 50) + '...')
        } else {
          // console.warn('⚠️ 图片转换返回null:', originalUrl)
        }
      } catch (error) {
        // console.warn('❌ 无法转换图片:', originalUrl, error)
      }
    })
    
    // 等待所有图片转换完成
    const results = await Promise.allSettled(conversionPromises)
    
    // 统计转换结果（调试用，可注释）
    // const successCount = results.filter(r => r.status === 'fulfilled').length
    // const failCount = results.filter(r => r.status === 'rejected').length
    // console.log(`图片转换完成: 成功 ${successCount}, 失败 ${failCount}, 总计 ${allImages.length}`)
    // console.log('已转换的图片URL:', Array.from(imageUrlToBase64.keys()).slice(0, 5))
    
    // 额外等待确保渲染完成
    await new Promise(resolve => setTimeout(resolve, 500))
    
    // 使用 html2canvas 截图，tight 模式（紧贴内容，无留白）
    const canvas = await html2canvas(appContentRef.value, {
      scale: 2, // 2倍缩放，提高清晰度
      useCORS: false, // 禁用CORS，因为我们已经在onclone中处理了所有图片
      allowTaint: false, // 不允许污染画布（确保所有图片都已转换为base64）
      logging: true, // 启用日志以便调试
      backgroundColor: '#ffffff',
      imageTimeout: 30000, // 增加图片加载超时时间
      removeContainer: false, // 保留容器
      foreignObjectRendering: false, // 禁用 foreignObject，使用传统渲染
      onclone: async (clonedDoc) => {
        // 在克隆的文档中，将所有URL图片替换为base64
        const clonedImages = clonedDoc.querySelectorAll('img')
        // console.log(`开始处理 ${clonedImages.length} 张图片`)
        
        for (const clonedImg of clonedImages) {
          // 优先使用data-original-src获取原始URL
          const dataOriginalSrc = clonedImg.getAttribute('data-original-src')
          const currentSrc = clonedImg.getAttribute('src')
          
          // 确定要查找的URL（优先使用data-original-src）
          const urlToLookup = dataOriginalSrc || currentSrc
          
          if (!urlToLookup) {
            continue
          }
          
          // 如果已经是base64，跳过
          if (urlToLookup.startsWith('data:')) {
            continue
          }
          
          // 查找对应的base64数据
          let base64Data = imageUrlToBase64.get(urlToLookup)
          
          // 如果通过原始URL没找到，尝试通过当前src查找
          if (!base64Data && currentSrc && currentSrc !== urlToLookup) {
            base64Data = imageUrlToBase64.get(currentSrc)
          }
          
          // 如果找到了base64数据，替换src
          if (base64Data) {
            clonedImg.src = base64Data
            // console.log('✅ 在onclone中替换图片:', urlToLookup.substring(0, 50) + '...')
          } else {
            // 如果还没转换，尝试从原始文档中找到对应的img元素
            // console.warn('⚠️ 图片未预先转换，尝试从原始DOM获取:', urlToLookup)
            try {
              // 在原始文档中查找对应的img元素（使用更灵活的查询）
              let originalImg: HTMLImageElement | null = null
              
              // 先尝试通过data-original-src查找
              if (dataOriginalSrc) {
                originalImg = document.querySelector(`img[data-original-src="${dataOriginalSrc}"]`) as HTMLImageElement
              }
              
              // 如果没找到，尝试通过src查找
              if (!originalImg && currentSrc) {
                originalImg = document.querySelector(`img[src="${currentSrc}"]`) as HTMLImageElement
              }
              
              // 如果还是没找到，尝试通过data-original-src查找（使用urlToLookup）
              if (!originalImg) {
                originalImg = document.querySelector(`img[data-original-src="${urlToLookup}"]`) as HTMLImageElement
              }
              
              if (originalImg && originalImg.complete && originalImg.naturalWidth > 0 && originalImg.naturalHeight > 0) {
                // 从已加载的原始图片元素获取base64
                const base64 = await convertLoadedImageToBase64(originalImg)
                if (base64) {
                  clonedImg.src = base64
                  imageUrlToBase64.set(urlToLookup, base64)
                  if (currentSrc && currentSrc !== urlToLookup) {
                    imageUrlToBase64.set(currentSrc, base64)
                  }
                  // console.log('✅ 在onclone中从原始DOM获取成功:', urlToLookup.substring(0, 50) + '...')
                } else {
                  console.error('❌ 在onclone中从原始DOM获取返回null:', urlToLookup)
                }
              } else {
                // console.warn('⚠️ 原始图片未找到或未加载:', urlToLookup, {
                //   found: !!originalImg,
                //   complete: originalImg?.complete,
                //   naturalWidth: originalImg?.naturalWidth,
                //   naturalHeight: originalImg?.naturalHeight
                // })
              }
            } catch (error) {
              console.error('❌ 在onclone中转换图片失败:', urlToLookup, error)
            }
          }
        }
        
        console.log('onclone处理完成')
        
        // 处理empty slot（添加作品块）
        // 如果该等级存在作品，那么完全隐藏添加作品块（display: none）
        // 如果该等级不存在作品，那么添加一个看不见的作品占位，使得该行的高度和有作品的等级高度一致
        const emptySlots = clonedDoc.querySelectorAll('.tier-item.empty')
        emptySlots.forEach((slot) => {
          const slotElement = slot as HTMLElement
          const tierRow = slotElement.parentElement
          if (!tierRow) return
          
          // 检查该等级是否有作品（非empty的tier-item）
          const allItems = Array.from(tierRow.children) as HTMLElement[]
          const hasItems = allItems.some(item => !item.classList.contains('empty'))
          
          if (hasItems) {
            // 如果该等级存在作品，完全隐藏添加作品块
            slotElement.style.display = 'none'
          } else {
            // 如果该等级不存在作品，将添加作品块转换为不可见的作品占位
            // 设置与作品相同的高度（173px）和宽度（100px），并完全透明
            // 使用 opacity: 0 而不是 visibility: hidden，确保元素仍占据空间
            slotElement.style.width = '100px'
            slotElement.style.height = '173px'
            slotElement.style.minHeight = '173px'
            slotElement.style.maxHeight = '173px'
            slotElement.style.opacity = '0'
            slotElement.style.pointerEvents = 'none'
            // 移除虚线边框，使其看起来像作品
            slotElement.style.border = 'none'
            slotElement.style.borderWidth = '0'
            // 隐藏内部内容（占位符文字和图标）
            const placeholder = slotElement.querySelector('.item-placeholder')
            if (placeholder) {
              (placeholder as HTMLElement).style.display = 'none'
            }
            const placeholderText = slotElement.querySelector('.placeholder-text')
            if (placeholderText) {
              (placeholderText as HTMLElement).style.display = 'none'
            }
          }
        })
        
        // 隐藏所有按钮，但保留标题显示
        const buttons = clonedDoc.querySelectorAll('button, .btn')
        buttons.forEach((btn) => {
          (btn as HTMLElement).style.display = 'none'
        })
        // 隐藏 header-actions 容器（包含所有按钮）
        const headerActions = clonedDoc.querySelector('.header-actions') as HTMLElement
        if (headerActions) {
          headerActions.style.display = 'none'
        }
        // 隐藏 header-left 占位元素
        const headerLeft = clonedDoc.querySelector('.header-left') as HTMLElement
        if (headerLeft) {
          headerLeft.style.display = 'none'
        }
        
        // 确保标题正常显示和居中
        const clonedTitle = clonedDoc.querySelector('.title') as HTMLElement
        if (clonedTitle) {
          clonedTitle.style.display = 'block'
          clonedTitle.style.visibility = 'visible'
          clonedTitle.style.position = 'relative'
          clonedTitle.style.left = 'auto'
          clonedTitle.style.transform = 'none'
          clonedTitle.style.textAlign = 'center'
          clonedTitle.style.width = '100%'
        }
        
        // 确保 header 正常显示，并移除底部间距（保留边框）
        const clonedHeader = clonedDoc.querySelector('.header') as HTMLElement
        if (clonedHeader) {
          clonedHeader.style.display = 'flex'
          clonedHeader.style.justifyContent = 'center'
          clonedHeader.style.alignItems = 'center'
          clonedHeader.style.marginBottom = '0' // 移除底部间距，让横线紧贴第一个等级
          clonedHeader.style.paddingBottom = '10px' // 保持底部内边距，确保按钮区域有足够空间
          // 保留 border-bottom，与页面显示一致
        }
        
        // 设置 tier-list 的顶部间距
        const clonedTierList = clonedDoc.querySelector('.tier-list') as HTMLElement
        if (clonedTierList) {
          clonedTierList.style.marginTop = '0' // 移除顶部外边距，与页面显示一致
          clonedTierList.style.paddingTop = '0'
        }
        
        // 不要恢复第一个 tier-group 的 border-top（CSS :first-child 已经隐藏它）
        // 第一个等级上面的横线是 header 的 border-bottom，已经保留了
        const clonedTierGroups = clonedDoc.querySelectorAll('.tier-group') as NodeListOf<HTMLElement>
        if (clonedTierGroups.length > 0) {
          const firstGroup = clonedTierGroups[0]
          // 保持 CSS 的 :first-child 规则（border-top: none），只移除间距
          firstGroup.style.marginTop = '0'
          firstGroup.style.paddingTop = '0'
        }
        
        // 不要恢复第一个 tier-row-wrapper 的 border-top（CSS :first-child 已经隐藏它）
        const clonedTierRowWrappers = clonedDoc.querySelectorAll('.tier-row-wrapper') as NodeListOf<HTMLElement>
        if (clonedTierRowWrappers.length > 0) {
          const firstWrapper = clonedTierRowWrappers[0]
          // 保持 CSS 的 :first-child 规则（border-top: none），只移除间距
          firstWrapper.style.marginTop = '0'
          firstWrapper.style.paddingTop = '0'
        }
        
        // Tight 模式：移除所有留白，确保图片紧贴内容
        // 获取实际页面的 app 宽度，应用到克隆的 app 上
        const originalApp = appContentRef.value as HTMLElement
        const originalAppWidth = originalApp.offsetWidth || originalApp.scrollWidth
        
        const clonedApp = clonedDoc.querySelector('.app') as HTMLElement
        if (clonedApp) {
          clonedApp.style.padding = '0'
          clonedApp.style.margin = '0'
          clonedApp.style.width = `${originalAppWidth}px`
          clonedApp.style.maxWidth = `${originalAppWidth}px`
        }
        
        // 确保 tier-row-wrapper 的宽度与实际页面保持一致
        const originalTierRowWrappers = document.querySelectorAll('.tier-row-wrapper') as NodeListOf<HTMLElement>
        
        clonedTierRowWrappers.forEach((clonedWrapper, index) => {
          const originalWrapper = originalTierRowWrappers[index]
          if (clonedWrapper && originalWrapper) {
            const originalWidth = originalWrapper.offsetWidth || originalWrapper.scrollWidth
            clonedWrapper.style.width = `${originalWidth}px`
            clonedWrapper.style.maxWidth = `${originalWidth}px`
          }
        })
      },
    })
    
    // 恢复滚动位置
    window.scrollTo(originalScrollX, originalScrollY)
    
    // 转换为 blob
    canvas.toBlob((blob) => {
      if (!blob) {
        alert('生成图片失败')
        isExportingImage.value = false
        return
      }
      
      // 创建下载链接
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `tier-list-${new Date().toISOString().split('T')[0]}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      isExportingImage.value = false
    }, 'image/png', 1.0) // 最高质量
  } catch (error) {
    console.error('导出图片失败:', error)
    alert('导出图片失败：' + (error instanceof Error ? error.message : '未知错误'))
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
    
    // 使用 html2canvas 生成图片（复用现有的图片转换逻辑）
    // 先转换图片，复用 handleExportImage 的逻辑
    const allImages = appContentRef.value.querySelectorAll('img') as NodeListOf<HTMLImageElement>
    const imageUrlToBase64 = new Map<string, string>()
    
    const conversionPromises = Array.from(allImages).map(async (img) => {
      const originalUrl = img.getAttribute('data-original-src') || img.src
      if (!originalUrl || originalUrl.startsWith('data:') || imageUrlToBase64.has(originalUrl)) {
        return
      }
      
      try {
        if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
          const base64 = await convertLoadedImageToBase64(img)
          if (base64) {
            imageUrlToBase64.set(originalUrl, base64)
            if (img.src && img.src !== originalUrl) {
              imageUrlToBase64.set(img.src, base64)
            }
          }
        }
      } catch (error) {
        console.warn('转换图片失败:', originalUrl, error)
      }
    })
    
    await Promise.allSettled(conversionPromises)
    await new Promise(resolve => setTimeout(resolve, 500))
    
    const canvas = await html2canvas(appContentRef.value, {
      scale: 2,
      useCORS: false,
      allowTaint: false,
      logging: false,
      backgroundColor: '#ffffff',
      onclone: async (clonedDoc) => {
        // 在克隆的文档中，将所有URL图片替换为base64
        const clonedImages = clonedDoc.querySelectorAll('img')
        
        for (const clonedImg of clonedImages) {
          const originalSrc = clonedImg.getAttribute('data-original-src') || clonedImg.getAttribute('src')
          if (originalSrc && !originalSrc.startsWith('data:')) {
            const base64 = imageUrlToBase64.get(originalSrc)
            if (base64) {
              clonedImg.setAttribute('src', base64)
            }
          }
        }
        
        // 隐藏所有按钮，但保留标题显示（与handleExportImage相同）
        const buttons = clonedDoc.querySelectorAll('button, .btn')
        buttons.forEach((btn) => {
          (btn as HTMLElement).style.display = 'none'
        })
        // 隐藏 header-actions 容器（包含所有按钮）
        const headerActions = clonedDoc.querySelector('.header-actions') as HTMLElement
        if (headerActions) {
          headerActions.style.display = 'none'
        }
        // 隐藏 header-left 占位元素
        const headerLeft = clonedDoc.querySelector('.header-left') as HTMLElement
        if (headerLeft) {
          headerLeft.style.display = 'none'
        }
        
        // 隐藏所有模态框
        const modals = clonedDoc.querySelectorAll('.modal-overlay, [class*="modal"]')
        modals.forEach((modal) => {
          (modal as HTMLElement).style.display = 'none'
        })
        
        // 确保标题正常显示和居中
        const clonedTitle = clonedDoc.querySelector('.title') as HTMLElement
        if (clonedTitle) {
          clonedTitle.style.display = 'block'
          clonedTitle.style.visibility = 'visible'
          clonedTitle.style.position = 'relative'
          clonedTitle.style.left = 'auto'
          clonedTitle.style.transform = 'none'
          clonedTitle.style.textAlign = 'center'
          clonedTitle.style.width = '100%'
        }
        
        // 确保 header 正常显示
        const clonedHeader = clonedDoc.querySelector('.header') as HTMLElement
        if (clonedHeader) {
          clonedHeader.style.display = 'flex'
          clonedHeader.style.justifyContent = 'center'
          clonedHeader.style.alignItems = 'center'
          clonedHeader.style.marginBottom = '0'
          clonedHeader.style.paddingBottom = '10px'
        }
        
        // 设置 tier-list 的顶部间距
        const clonedTierList = clonedDoc.querySelector('.tier-list') as HTMLElement
        if (clonedTierList) {
          clonedTierList.style.marginTop = '0'
          clonedTierList.style.paddingTop = '0'
        }
        
        // 处理empty slot（与handleExportImage相同）
        const emptySlots = clonedDoc.querySelectorAll('.tier-item.empty')
        emptySlots.forEach((slot) => {
          const slotElement = slot as HTMLElement
          const tierRow = slotElement.parentElement
          if (!tierRow) return
          
          const allItems = Array.from(tierRow.children) as HTMLElement[]
          const hasItems = allItems.some(item => !item.classList.contains('empty'))
          
          if (hasItems) {
            slotElement.style.display = 'none'
          } else {
            slotElement.style.width = '100px'
            slotElement.style.height = '173px'
            slotElement.style.minHeight = '173px'
            slotElement.style.maxHeight = '173px'
            slotElement.style.opacity = '0'
            slotElement.style.pointerEvents = 'none'
            slotElement.style.border = 'none'
            slotElement.style.borderWidth = '0'
            // 隐藏内部内容（占位符文字和图标）
            const placeholder = slotElement.querySelector('.item-placeholder')
            if (placeholder) {
              (placeholder as HTMLElement).style.display = 'none'
            }
            const placeholderText = slotElement.querySelector('.placeholder-text')
            if (placeholderText) {
              (placeholderText as HTMLElement).style.display = 'none'
            }
          }
        })
      },
    })
    
    // 恢复滚动位置
    window.scrollTo(originalScrollX, originalScrollY)
    
    // 计算PDF尺寸（A4比例，但根据内容调整宽度）
    // 注意：canvas 使用了 scale: 2，所以 canvas 尺寸是实际 DOM 的 2 倍
    const canvasWidth = canvas.width
    const canvasHeight = canvas.height
    const htmlScale = 2 // html2canvas 的 scale 参数
    const actualDomWidth = canvasWidth / htmlScale // 实际 DOM 宽度
    const actualDomHeight = canvasHeight / htmlScale // 实际 DOM 高度
    
    const pdfWidth = 210 // A4宽度（mm）
    const pdfHeight = (canvasHeight / canvasWidth) * pdfWidth // 按比例计算高度
    
    // 创建PDF
    const pdf = new jsPDF({
      orientation: pdfHeight > 297 ? 'portrait' : 'portrait',
      unit: 'mm',
      format: [pdfWidth, Math.max(pdfHeight, 297)], // 至少A4高度
    })
    
    // 将canvas转换为图片并添加到PDF
    const imgData = canvas.toDataURL('image/png', 1.0)
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST')
    
    // 为每个作品项添加超链接
    // 需要将 DOM 坐标转换为 PDF 坐标（mm）
    // rect 是基于实际 DOM 的像素坐标，需要转换为 canvas 坐标（考虑 scale），然后再转换为 PDF 坐标
    const scaleX = pdfWidth / canvasWidth // PDF mm / canvas pixels
    const scaleY = pdfHeight / canvasHeight // PDF mm / canvas pixels
    
    itemLinks.forEach(({ url, rect, item }) => {
      // rect 是基于实际 DOM 的像素坐标
      // 转换为 canvas 坐标（考虑 scale: 2）
      const canvasX = rect.left * htmlScale
      const canvasY = rect.top * htmlScale
      const canvasW = rect.width * htmlScale
      const canvasH = rect.height * htmlScale
      
      // 转换为 PDF 坐标（mm）
      const x = canvasX * scaleX
      const y = canvasY * scaleY
      const w = canvasW * scaleX
      const h = canvasH * scaleY
      
      // 添加超链接
      pdf.link(x, y, w, h, { url })
      // console.log(`🔗 添加链接:`, item.name || item.id, url, `PDF坐标: (${x.toFixed(2)}, ${y.toFixed(2)}, ${w.toFixed(2)}, ${h.toFixed(2)})`)
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
  // wsrv.nl 是专门用于图片的代理服务，支持CORS，返回PNG格式
  // 参数说明：
  // - url: 原始图片URL
  // - output=png: 输出PNG格式
  // - n=-1: 不缓存（-1表示禁用缓存）
  // - t=timestamp: 添加时间戳防止缓存
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&output=png&n=-1&t=${Date.now()}`
}

// 从已加载的图片元素中获取base64（使用 wsrv.nl 代理）
async function convertLoadedImageToBase64(img: HTMLImageElement): Promise<string | null> {
  try {
    // 获取原始URL
    const originalUrl = img.getAttribute('data-original-src') || img.src
    
    // 如果已经是base64或blob，直接返回
    if (originalUrl.startsWith('data:') || originalUrl.startsWith('blob:')) {
      return originalUrl
    }
    
    // 使用 wsrv.nl 代理加载图片（类似 anime-role-grid 的方法）
    try {
      const proxyUrl = getCorsProxyUrl(originalUrl)
      
      // 使用 Image 对象加载代理后的图片
      return new Promise<string>((resolve, reject) => {
        const proxyImg = new Image()
        proxyImg.crossOrigin = 'anonymous'
        proxyImg.referrerPolicy = 'no-referrer'
        
        proxyImg.onload = async () => {
          try {
            // 等待图片解码
            await proxyImg.decode()
            
            // 验证图片尺寸
            if (proxyImg.naturalWidth === 0 || proxyImg.naturalHeight === 0) {
              reject(new Error('图片尺寸为0'))
              return
            }
            
            // 绘制到canvas并转换为base64
            const canvas = document.createElement('canvas')
            canvas.width = proxyImg.naturalWidth
            canvas.height = proxyImg.naturalHeight
            const ctx = canvas.getContext('2d')
            
            if (!ctx) {
              reject(new Error('无法创建canvas上下文'))
              return
            }
            
            ctx.drawImage(proxyImg, 0, 0)
            const dataUrl = canvas.toDataURL('image/png')
            resolve(dataUrl)
          } catch (error) {
            reject(error)
          }
        }
        
        proxyImg.onerror = () => {
          reject(new Error('图片加载失败'))
        }
        
        proxyImg.src = proxyUrl
      })
    } catch (proxyError) {
      console.warn('wsrv.nl 代理方法失败:', proxyError)
      return null
    }
  } catch (error) {
    console.warn('从已加载图片获取base64失败:', error)
    return null
  }
}

// 将图片URL转换为base64（用于导出，使用 wsrv.nl 代理）
async function convertImageToBase64ForExport(imageUrl: string): Promise<string | null> {
  if (!imageUrl || imageUrl.startsWith('data:') || imageUrl.startsWith('blob:')) {
    return imageUrl // 如果已经是base64或blob，直接返回
  }
  
  try {
    // 使用 wsrv.nl 代理加载图片（类似 anime-role-grid 的方法）
    const proxyUrl = getCorsProxyUrl(imageUrl)
    
    return new Promise<string>((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.referrerPolicy = 'no-referrer'
      
      img.onload = async () => {
        try {
          // 等待图片解码
          await img.decode()
          
          // 验证图片尺寸
          if (img.naturalWidth === 0 || img.naturalHeight === 0) {
            reject(new Error('图片尺寸为0'))
            return
          }
          
          // 绘制到canvas并转换为base64
          const canvas = document.createElement('canvas')
          canvas.width = img.naturalWidth
          canvas.height = img.naturalHeight
          const ctx = canvas.getContext('2d')
          
          if (!ctx) {
            reject(new Error('无法创建canvas上下文'))
            return
          }
          
          ctx.drawImage(img, 0, 0)
          const dataUrl = canvas.toDataURL('image/png')
          resolve(dataUrl)
        } catch (error) {
          reject(error)
        }
      }
      
      img.onerror = () => {
        reject(new Error('图片加载失败'))
      }
      
      img.src = proxyUrl
    })
  } catch (error) {
    console.warn('图片转换失败:', imageUrl, error)
    return null
  }
}

</script>

<template>
  <div class="app" ref="appContentRef">
    <header class="header">
      <div class="header-left"></div>
      <h1 
        class="title" 
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
        <button 
          class="btn btn-secondary" 
          @click="handleExportImage" 
          title="保存为高清图片"
          :disabled="isExportingImage || isExportingPDF"
        >
          {{ isExportingImage ? '准备中...' : '保存图片' }}
        </button>
        <button 
          class="btn btn-secondary" 
          @click="handleExportPDF" 
          title="保存为PDF（保留超链接）"
          :disabled="isExportingImage || isExportingPDF"
        >
          {{ isExportingPDF ? '准备中...' : '保存PDF' }}
        </button>
        <button 
          v-if="isExportingImage || isExportingPDF" 
          class="btn btn-secondary" 
          @click="isExportingImage = false; isExportingPDF = false" 
          title="恢复页面显示"
        >
          恢复显示
        </button>
        <button class="btn btn-secondary" @click="handleExport" title="导出数据">
          导出
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
      :configs="tierConfigs"
      @close="showConfig = false"
      @update="handleUpdateConfigs"
    />

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
  padding-bottom: 10px;
  border-bottom: 2px solid #000000;
  position: relative;
}

.header-left {
  flex: 1;
}

.title {
  font-size: 32px;
  font-weight: bold;
  color: #000000;
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
  border-bottom: 2px dashed #000000;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.btn {
  padding: 10px 20px;
  border: 2px solid #000000;
  background: #ffffff;
  color: #000000;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}

.btn:hover {
  background: #000000;
  color: #ffffff;
}

.btn-secondary {
  background: #ffffff;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn:disabled:hover {
  background: #ffffff;
  color: #000000;
}
</style>

