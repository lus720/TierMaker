<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from 'vue'
import type { TierConfig } from '../types'
import { getSetting, getSize, updateSizes, saveLocalConfig, clearLocalConfig } from '../utils/configManager'
import { loadBgmToken, saveBgmToken, loadTitleFontSize, saveTitleFontSize, loadThemePreference, saveThemePreference, loadHideItemNames, saveHideItemNames, loadExportScale, saveExportScale, DEFAULT_TIER_CONFIGS } from '../utils/storage'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps<{
  configs: TierConfig[]
}>()

const emit = defineEmits<{
  close: []
  update: [configs: TierConfig[]]
  'update-title-font-size': [fontSize: number]
  'update-theme': [theme: 'light' | 'dark' | 'auto']
  'update-hide-item-names': [hide: boolean]
  'update-export-scale': [scale: number]
  'reset-settings': []
}>()

const localConfigs = ref<TierConfig[]>([])
const bgmToken = ref('')
const titleFontSize = ref<number>(32)
const themePreference = ref<'light' | 'dark' | 'auto'>('auto')
const hideItemNames = ref<boolean>(false)
const exportScale = ref<number>(4)
const compactMode = ref<boolean>(false)
const inputValues = ref<Record<number, string>>({})
const modalContentRef = ref<HTMLElement | null>(null)
const mouseDownInside = ref(false)

const imageWidth = ref(100)
const imageHeight = ref(133)
const imageAspectRatio = ref(0.75)
const imageAspectRatioInput = ref('0.75')
const tallImageCropMode = ref<'center-top' | 'center-center'>('center-top')

// 预设颜色选项
const presetColors = [
  '#ff7f7f', // 红色
  '#ff9f7f', // 红橙色（过渡色）
  '#ffbf7f', // 橙色
  '#ffdf7f', // 浅橙色
  '#ffff7f', // 黄色
  '#bfff7f', // 浅绿色
  '#cfcfcf', // 灰色
]

watch(() => props.configs, (newConfigs) => {
  const newLocalConfigs = JSON.parse(JSON.stringify(newConfigs))
  newLocalConfigs.forEach((config: any, index: number) => {
    const existingConfig = localConfigs.value.find(c => c.id === config.id && c.order === config.order)
    if (existingConfig && (existingConfig as any)._internalId) {
      (config as any)._internalId = (existingConfig as any)._internalId
    } else {
      (config as any)._internalId = `config-${Date.now()}-${index}`
    }
    if (!config.label) {
      config.label = config.id
    }
    // 如果没有字号，设置默认值
    if (config.fontSize === undefined || config.fontSize === null) {
      config.fontSize = 32
    }
    inputValues.value[index] = config.label
  })
  localConfigs.value = newLocalConfigs
}, { immediate: true })

onMounted(() => {
  const savedToken = loadBgmToken()
  exportScale.value = loadExportScale()
  if (savedToken) {
    bgmToken.value = savedToken
  }
  titleFontSize.value = loadTitleFontSize()
  themePreference.value = loadThemePreference()
  hideItemNames.value = loadHideItemNames()
  compactMode.value = getSetting('compact-mode') || false
  tallImageCropMode.value = getSetting('tall-image-crop-mode') || 'center-top'
  
  // 加载图片尺寸配置
  imageWidth.value = getSize('image-width') as number || 100
  imageAspectRatio.value = getSize('image-aspect-ratio') as number || 0.75
  const savedText = getSize('image-aspect-ratio-text')
  console.log('[ConfigModal] Loaded aspect ratio text:', savedText)
  imageAspectRatioInput.value = (savedText as unknown as string) || imageAspectRatio.value.toString()
  // 计算当前高度
  imageHeight.value = Math.round(imageWidth.value / imageAspectRatio.value)
})

function addTier() {
  const newId = String.fromCharCode(65 + localConfigs.value.length)
  const newConfig: any = {
    id: newId,
    label: newId,
    color: '#000000',
    order: localConfigs.value.length,
    fontSize: 32,
    _internalId: `config-${Date.now()}-${localConfigs.value.length}`,
  }
  localConfigs.value.push(newConfig)
}

function removeTier(index: number) {
  if (localConfigs.value.length > 1) {
    localConfigs.value.splice(index, 1)
    localConfigs.value.forEach((config, i) => {
      config.order = i
    })
  }
}

// 交换两个配置并同步 inputValues
function swapConfigs(index1: number, index2: number) {
  // 交换配置
  ;[localConfigs.value[index1], localConfigs.value[index2]] = [
    localConfigs.value[index2],
    localConfigs.value[index1],
  ]
  
  // 交换输入值
  const value1 = inputValues.value[index1] ?? localConfigs.value[index1].id
  const value2 = inputValues.value[index2] ?? localConfigs.value[index2].id
  inputValues.value[index1] = value2
  inputValues.value[index2] = value1
  
  // 更新 order
  localConfigs.value[index1].order = index1
  localConfigs.value[index2].order = index2
}

function moveUp(index: number) {
  // 当前等级条向上移动：与上一个交换
  if (index > 0) {
    swapConfigs(index - 1, index)
  }
}

function moveDown(index: number) {
  // 当前等级条向下移动：与下一个交换
  if (index < localConfigs.value.length - 1) {
    swapConfigs(index, index + 1)
  }
}

function handleSave() {
  console.log('[ConfigModal] handleSave emitting:', JSON.parse(JSON.stringify(localConfigs.value)))
  emit('update', localConfigs.value)
  saveBgmToken(bgmToken.value || null)
  saveTitleFontSize(titleFontSize.value)
  saveThemePreference(themePreference.value)
  saveExportScale(exportScale.value)
  emit('update-title-font-size', titleFontSize.value)
  emit('update-theme', themePreference.value)
  emit('update-export-scale', exportScale.value)
  emit('close')
}

function applyTheme(theme: 'light' | 'dark' | 'auto') {
  const html = document.documentElement
  html.setAttribute('data-theme', theme)
}

function handleThemeChange() {
  // 立即应用主题变化并保存
  applyTheme(themePreference.value)
  saveThemePreference(themePreference.value)
  emit('update-theme', themePreference.value)
}

function handleHideItemNamesChange() {
  // 立即保存隐藏作品名设置
  saveHideItemNames(hideItemNames.value)
  emit('update-hide-item-names', hideItemNames.value)
}

function handleCompactModeChange() {
  saveLocalConfig({
    settings: {
      'compact-mode': compactMode.value
    }
  })
}

function handleTallImageCropModeChange() {
  saveLocalConfig({
    settings: {
      'tall-image-crop-mode': tallImageCropMode.value
    }
  })
}

function handleExportScaleInput(event: Event) {
  const target = event.target as HTMLInputElement
  let value = parseInt(target.value, 10)
  
  // 如果输入的不是整数或超出范围，限制在有效范围内
  if (isNaN(value) || value < 1) {
    value = 1
  } else if (value > 6) {
    value = 6
  } else {
    // 确保是整数
    value = Math.round(value)
  }
  
  exportScale.value = value
  target.value = value.toString()
}

function handleExportScaleBlur(event: Event) {
  const target = event.target as HTMLInputElement
  let value = parseInt(target.value, 10)
  
  // 失焦时验证并修正值
  if (isNaN(value) || value < 1) {
    value = 1
  } else if (value > 6) {
    value = 6
  } else {
    value = Math.round(value)
  }
  
  exportScale.value = value
  target.value = value.toString()
}

function handleResetSettings() {
  // 直接执行重置，不需要确认
  emit('reset-settings')
  
  // 立即更新本地显示的值（configs 会通过 watch 自动更新）
  exportScale.value = getSetting('export-scale') || 4
  titleFontSize.value = getSetting('title-font-size') || 32
  themePreference.value = getSetting('theme') || 'auto'
  themePreference.value = getSetting('theme') || 'auto'
  hideItemNames.value = getSetting('hide-item-names') ?? false
  compactMode.value = getSetting('compact-mode') || false
  
  // 重置为 config.yaml 中的默认值
  clearLocalConfig()
  
  // 重新读取默认配置
  imageWidth.value = getSize('image-width') as number || 200 // Default fallback matched to config.yaml
  imageAspectRatio.value = getSize('image-aspect-ratio') as number || 0.75
  imageAspectRatioInput.value = imageAspectRatio.value.toString()
  imageHeight.value = Math.round(imageWidth.value / imageAspectRatio.value)
  
  // Update UI values immediately
}

function handleClose() {
  // 关闭设置时，保存当前的主题设置和隐藏作品名设置（确保设置已保存）
  saveThemePreference(themePreference.value)
  emit('update-theme', themePreference.value)
  saveHideItemNames(hideItemNames.value)
  emit('update-hide-item-names', hideItemNames.value)
  emit('close')
}

function isInsideModalContent(x: number, y: number): boolean {
  if (!modalContentRef.value) return false
  const rect = modalContentRef.value.getBoundingClientRect()
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

function handleMouseDown(event: MouseEvent) {
  mouseDownInside.value = isInsideModalContent(event.clientX, event.clientY)
}

function handleMouseUp(event: MouseEvent) {
  const mouseUpInside = isInsideModalContent(event.clientX, event.clientY)
  if (!mouseDownInside.value && !mouseUpInside) {
    // 点击空白处退出时，保存当前的主题设置
    handleClose()
  }
  mouseDownInside.value = false
}

function handleTierIdInput(index: number, value: string) {
  inputValues.value[index] = value
}

function handleTierIdBlur(config: TierConfig, index: number) {
  const newValue = inputValues.value[index] || config.label
  config.id = newValue
  config.label = newValue
}

function handleImageUtilChange(source: 'width' | 'height' | 'ratio') {
  let w = imageWidth.value
  let h = imageHeight.value
  let r = imageAspectRatio.value
  
  if (w < 10) w = 10
  if (h < 10) h = 10
  if (r < 0.1) r = 0.1
  
  // Calculate new values based on source
  if (source === 'ratio') {
    // Parse the ratio input
    let newRatio = imageAspectRatio.value
    
    // Try to parse fraction/ratio format (e.g. "16/9" or "4:3" or "16：9")
    const ratioStr = imageAspectRatioInput.value.trim()
    const fractionMatch = ratioStr.match(/^(\d+(?:\.\d+)?)\s*[:\/：]\s*(\d+(?:\.\d+)?)$/)
    
    if (fractionMatch) {
      const num = parseFloat(fractionMatch[1])
      const den = parseFloat(fractionMatch[2])
      if (den !== 0) {
        newRatio = num / den
      }
    } else {
      // Try to parse as normal number
      const num = parseFloat(ratioStr)
      if (!isNaN(num) && num > 0) {
        newRatio = num
      }
    }
    
    if (newRatio < 0.1) newRatio = 0.1
    imageAspectRatio.value = newRatio
    
    // 改变比例：保持宽度，重算高度
    h = Math.round(w / newRatio)
    imageHeight.value = h
  } else {
    // Other sources changes, update ratio input display to match new ratio if needed
    // But usually we just keep the input as is unless it's a recalibration
    if (source === 'width') {
      // 改变宽度：保持比例，重算高度
      h = Math.round(w / r)
      imageHeight.value = h
    } else if (source === 'height') {
      // 改变高度：保持比例，重算宽度 (Width = Height * Ratio)
      w = Math.round(h * r)
      imageWidth.value = w
    }
  }
  
  const updates: Record<string, any> = {
    'image-width': w,
    'image-aspect-ratio': imageAspectRatio.value
  }

  // Only save the text input if the source is 'ratio' (meaning user typed it)
  if (source === 'ratio') {
    updates['image-aspect-ratio-text'] = imageAspectRatioInput.value
  }

  updateSizes(updates)
}
</script>

<template>
  <div class="modal-overlay" @mousedown="handleMouseDown" @mouseup="handleMouseUp">
    <div class="modal-content" ref="modalContentRef">
      <div class="modal-header">
        <h2 class="modal-title">设置</h2>
        <button class="close-btn" @click="handleClose">×</button>
      </div>
      
      <div class="modal-body">
      <div class="config-section">
        <h3 class="section-title">{{ t('config.displaySection') }}</h3>
        <div class="config-item-row">
          <label for="title-font-size">{{ t('config.titleFontSize') }}</label>
          <input
            id="title-font-size"
            v-model.number="titleFontSize"
            type="number"
            min="12"
            max="120"
            step="1"
            class="config-input"
            style="max-width: 120px;"
          />
        </div>
        <div class="config-item-row" style="margin-top: 15px;">
          <label for="theme-preference">{{ t('config.themeMode') }}</label>
          <select
            id="theme-preference"
            v-model="themePreference"
            @change="handleThemeChange"
            class="config-select"
          >
            <option value="auto">{{ t('config.themeAuto') }}</option>
            <option value="light">{{ t('config.themeLight') }}</option>
            <option value="dark">{{ t('config.themeDark') }}</option>
          </select>
        </div>
        <div class="config-item-row" style="margin-top: 15px;">
          <label for="export-scale">{{ t('config.exportScale') }}</label>
          <input
            id="export-scale"
            v-model.number="exportScale"
            type="number"
            min="1"
            max="6"
            step="1"
            class="config-input"
            style="max-width: 120px;"
            @input="handleExportScaleInput"
            @blur="handleExportScaleBlur"
          />
          <span style="margin-left: 10px; color: var(--text-secondary);">{{ t('config.exportScaleHint') }}</span>
        </div>
        <div class="config-item-row" style="margin-top: 15px;">
          <label for="hide-item-names" style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
            <input
              id="hide-item-names"
              v-model="hideItemNames"
              type="checkbox"
              class="config-checkbox"
              @change="handleHideItemNamesChange"
            />
            <span>{{ t('config.hideItemNames') }}</span>
          </label>
        </div>
        
        <div class="config-item-row" style="margin-top: 15px;">
          <label for="compact-mode" style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
            <input
              id="compact-mode"
              v-model="compactMode"
              type="checkbox"
              class="config-checkbox"
              @change="handleCompactModeChange"
            />
            <span>{{ t('config.compactMode') }}</span>
          </label>
        </div>
        
        <div class="config-item-row" style="margin-top: 15px;">
          <label for="tall-image-crop-mode">{{ t('config.tallImageCrop') }}</label>
          <select
            id="tall-image-crop-mode"
            v-model="tallImageCropMode"
            @change="handleTallImageCropModeChange"
            class="config-select"
          >
            <option value="center-top">{{ t('config.tallImageCropTop') }}</option>
            <option value="center-center">{{ t('config.tallImageCropCenter') }}</option>
          </select>
        </div>
      </div>
      
      <div class="config-section">
        <h3 class="section-title">{{ t('config.cardSizeSection') }}</h3>
        <div class="config-item-row">
          <label for="image-aspect-ratio">{{ t('config.aspectRatio') }}</label>
          <input
            id="image-aspect-ratio"
            v-model="imageAspectRatioInput"
            type="text"
            class="config-input"
            style="max-width: 100px;"
            @change="handleImageUtilChange('ratio')"
          />
          <span style="font-size: 12px; color: var(--text-secondary); margin-left: 5px;">{{ t('config.aspectRatioHint') }}</span>
        </div>
        
        <div class="config-item-row" style="margin-top: 10px;">
          <label for="image-width">{{ t('config.imageWidth') }}</label>
          <input
            id="image-width"
            v-model.number="imageWidth"
            type="number"
            step="1"
            min="10"
            class="config-input"
            style="max-width: 100px;"
            @input="handleImageUtilChange('width')"
          />
        </div>
        
        <div class="config-item-row" style="margin-top: 10px;">
          <label for="image-height">{{ t('config.imageHeight') }}</label>
          <input
            id="image-height"
            v-model.number="imageHeight"
            type="number"
            step="1"
            min="10"
            class="config-input"
            style="max-width: 100px;"
            @input="handleImageUtilChange('height')"
          />
          <span style="font-size: 12px; color: var(--text-secondary); margin-left: 5px;">{{ t('config.imageHeightHint') }}</span>
        </div>
      </div>
      
      <div class="config-section">
        <h3 class="section-title">{{ t('config.bgmTokenSection') }}</h3>
        <div class="token-config">
          <div class="token-input-group">
            <input
              v-model="bgmToken"
              type="text"
              class="token-input"
              :placeholder="t('config.bgmTokenPlaceholder')"
            />
            <button
              class="token-clear-btn"
              @click="bgmToken = ''"
              :disabled="!bgmToken"
            >
              {{ t('config.bgmTokenClear') }}
            </button>
          </div>
          <p class="token-hint">
            {{ t('config.bgmTokenHint') }}
            <br />
            {{ t('config.bgmTokenLink') }}<a href="https://next.bgm.tv/demo/access-token" target="_blank">https://next.bgm.tv/demo/access-token</a>
          </p>
        </div>
      </div>
      
      <div class="config-section config-section-tiers">
        <h3 class="section-title">{{ t('config.tierConfigSection') }}</h3>
        
        <div class="config-list">
          <div
            v-for="(config, index) in localConfigs"
            :key="(config as any)._internalId || `config-${index}`"
            class="config-item"
          >
          <div class="config-controls">
            <button
              class="move-btn"
              @click="moveUp(index)"
              :disabled="index === 0"
            >
              ↑
            </button>
            <button
              class="move-btn"
              @click="moveDown(index)"
              :disabled="index === localConfigs.length - 1"
            >
              ↓
            </button>
          </div>
          
          <input
            :value="inputValues[index] ?? config.label"
            type="text"
            class="config-input"
            :placeholder="t('config.tierPlaceholder')"
            @input="(e) => handleTierIdInput(index, (e.target as HTMLInputElement).value)"
            @blur="handleTierIdBlur(config, index)"
          />
          <input
            v-model.number="config.fontSize"
            type="number"
            class="config-fontsize"
            :placeholder="t('config.fontSizePlaceholder')"
            min="12"
            max="72"
            step="1"
          />
          <div class="color-selector">
            <input
              v-model="config.color"
              type="color"
              class="config-color"
            />
            <div class="preset-colors">
              <button
                v-for="presetColor in presetColors"
                :key="presetColor"
                class="preset-color-btn"
                :class="{ active: config.color === presetColor }"
                :style="{ backgroundColor: presetColor }"
                :title="presetColor"
                @click="config.color = presetColor"
              />
            </div>
          </div>
          
          <button
            class="remove-btn"
            @click="removeTier(index)"
            :disabled="localConfigs.length <= 1"
          >
            {{ t('config.delete') }}
          </button>
          </div>
        </div>
        
      </div>
      </div>
      
        <div class="modal-footer">
        <div class="footer-left">
          <button class="btn btn-reset" @click="handleResetSettings">{{ t('config.resetSettings') }}</button>
          <button class="add-btn" @click="addTier">{{ t('config.addTier') }}</button>
        </div>
        <div class="footer-actions">
          <button class="btn btn-cancel" @click="handleClose">{{ t('config.cancel') }}</button>
          <button class="btn btn-save" @click="handleSave">{{ t('config.save') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--modal-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--bg-color);
  border: 2px solid var(--border-color);
  max-width: var(--size-modal-max-width-large, 700px);
  width: 90%;
  height: 80vh;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  position: relative;
}

/* 自定义滚动条样式 - WebKit 浏览器（Chrome, Safari, Edge） */
.modal-body::-webkit-scrollbar {
  width: 12px;
}

.modal-body::-webkit-scrollbar-track {
  background: var(--scrollbar-track);
  border-radius: 6px;
}

.modal-body::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 6px;
  border: 2px solid var(--scrollbar-track);
}

.modal-body::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover);
}

/* Firefox 滚动条样式 */
.modal-body {
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  justify-content: space-between;
  align-items: center;
  padding: var(--size-app-padding, 20px);
  border-bottom: 2px solid var(--border-color);
  flex-shrink: 0;
}

.modal-title {
  font-size: 24px;
  font-weight: bold;
  color: var(--text-color);
}

.close-btn {
  width: 30px;
  height: 30px;
  border: 2px solid var(--border-color);
  background: var(--bg-color);
  color: var(--text-color);
  font-size: 24px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  transition: all 0.2s;
}

.close-btn:hover {
  background: var(--border-color);
  color: var(--bg-color);
}

.config-section {
  padding: var(--size-app-padding, 20px);
  border-bottom: 1px solid var(--border-light-color);
}

.config-section:last-of-type {
  border-bottom: none;
}

.section-title {
  font-size: 18px;
  font-weight: bold;
  margin-bottom: 15px;
}

.config-item-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.config-item-row label {
  white-space: nowrap;
}

.config-item-row .btn {
  margin-left: auto;
}

.token-config {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.token-input-group {
  display: flex;
  gap: 10px;
  align-items: center;
}

.token-input {
  flex: 1;
  padding: 10px;
  border: 2px solid var(--border-color);
  background: var(--input-bg);
  color: var(--text-color);
  font-size: 14px;
  font-family: monospace;
}

.token-clear-btn {
  padding: 10px 15px;
  border: 2px solid var(--border-color);
  background: var(--bg-color);
  color: var(--text-color);
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.token-clear-btn:hover:not(:disabled) {
  background: var(--border-color);
  color: var(--bg-color);
}

.token-clear-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.token-hint {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
  margin: 0;
}

.token-hint a {
  color: var(--text-link);
  text-decoration: underline;
}

.token-hint a:hover {
  color: var(--text-link-hover);
}

.config-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 15px;
}


.config-item {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 15px;
  margin-bottom: 10px;
  border: 2px solid var(--border-color);
  background: var(--bg-color);
}


.list-leave-active {
  position: absolute;
  width: calc(100% - 40px);
}

.config-controls {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.move-btn {
  width: 30px;
  height: 20px;
  border: 1px solid var(--border-color);
  background: var(--bg-color);
  color: var(--text-color);
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.move-btn:hover:not(:disabled) {
  background: var(--border-color);
  color: var(--bg-color);
}

.move-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.config-input {
  flex: 1;
  padding: 8px;
  border: 2px solid var(--border-color);
  background: var(--input-bg);
  color: var(--text-color);
  font-size: 14px;
}

.config-select {
  padding: 8px;
  border: 2px solid var(--border-color);
  background: var(--input-bg);
  color: var(--text-color);
  font-size: 14px;
  cursor: pointer;
  min-width: 150px;
}

.config-checkbox {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: var(--border-color);
}

.config-fontsize {
  width: 80px;
  padding: 8px;
  border: 2px solid var(--border-color);
  background: var(--input-bg);
  color: var(--text-color);
  font-size: 14px;
  text-align: center;
}

.color-selector {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
}

.config-color {
  width: 60px;
  height: 40px;
  border: 2px solid var(--border-color);
  cursor: pointer;
}

.preset-colors {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  justify-content: center;
}

.preset-color-btn {
  width: 24px;
  height: 24px;
  border: 2px solid #000000;
  cursor: pointer;
  padding: 0;
  background: none;
  transition: all 0.2s;
  position: relative;
}

.preset-color-btn:hover {
  transform: scale(1.1);
  z-index: 1;
}

.preset-color-btn.active {
  border-width: 3px;
  box-shadow: 0 0 0 2px #ffffff, 0 0 0 4px #000000;
}

.remove-btn {
  padding: 8px 15px;
  border: 2px solid var(--border-color);
  background: var(--bg-color);
  color: var(--text-color);
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}

.remove-btn:hover:not(:disabled) {
  background: var(--border-color);
  color: var(--bg-color);
}

.remove-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.modal-footer {
  padding: var(--size-app-padding, 20px);
  border-top: 2px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
  gap: 10px;
}

.footer-left {
  display: flex;
  gap: 10px;
  align-items: center;
}

.add-btn {
  padding: var(--size-btn-padding-y, 10px) var(--size-btn-padding-x, 20px);
  border: 2px solid var(--border-color);
  background: var(--bg-color);
  color: var(--text-color);
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}

.add-btn:hover {
  background: var(--border-color);
  color: var(--bg-color);
}

.footer-actions {
  display: flex;
  gap: 10px;
}

.btn {
  padding: var(--size-btn-padding-y, 10px) var(--size-btn-padding-x, 20px);
  border: 2px solid var(--border-color);
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel {
  background: var(--bg-color);
  color: var(--text-color);
}

.btn-cancel:hover {
  background: var(--bg-hover-color);
}

.btn-save {
  background: var(--border-color);
  color: var(--bg-color);
}

.btn-save:hover {
  opacity: 0.8;
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

.btn-reset {
  background: var(--bg-color);
  color: #cc6666;
  border-color: #cc6666;
}

.btn-reset:hover {
  background: #cc6666;
  color: #ffffff;
}

</style>

