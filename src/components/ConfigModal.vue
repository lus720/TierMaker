<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import type { TierConfig } from '../types'
import { loadBgmToken, saveBgmToken, loadTitleFontSize, saveTitleFontSize, loadThemePreference, saveThemePreference, loadHideItemNames, saveHideItemNames } from '../utils/storage'

const props = defineProps<{
  configs: TierConfig[]
}>()

const emit = defineEmits<{
  close: []
  update: [configs: TierConfig[]]
  'update-title-font-size': [fontSize: number]
  'update-theme': [theme: 'light' | 'dark' | 'auto']
  'update-hide-item-names': [hide: boolean]
}>()

const localConfigs = ref<TierConfig[]>([])
const bgmToken = ref('')
const titleFontSize = ref<number>(32)
const themePreference = ref<'light' | 'dark' | 'auto'>('auto')
const hideItemNames = ref<boolean>(false)
const inputValues = ref<Record<number, string>>({})
const modalContentRef = ref<HTMLElement | null>(null)
const mouseDownInside = ref(false)

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
    if (!config.label || config.label !== config.id) {
      config.label = config.id
    }
    // 如果没有字号，设置默认值
    if (config.fontSize === undefined || config.fontSize === null) {
      config.fontSize = 32
    }
    inputValues.value[index] = config.id
  })
  localConfigs.value = newLocalConfigs
}, { immediate: true })

onMounted(() => {
  const savedToken = loadBgmToken()
  if (savedToken) {
    bgmToken.value = savedToken
  }
  titleFontSize.value = loadTitleFontSize()
  themePreference.value = loadThemePreference()
  hideItemNames.value = loadHideItemNames()
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
  emit('update', localConfigs.value)
  saveBgmToken(bgmToken.value || null)
  saveTitleFontSize(titleFontSize.value)
  saveThemePreference(themePreference.value)
  emit('update-title-font-size', titleFontSize.value)
  emit('update-theme', themePreference.value)
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
  console.log('隐藏作品名设置变更:', hideItemNames.value)
  saveHideItemNames(hideItemNames.value)
  emit('update-hide-item-names', hideItemNames.value)
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
  const newValue = inputValues.value[index] || config.id
  config.id = newValue
  config.label = newValue
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
        <h3 class="section-title">显示设置</h3>
        <div class="config-item-row">
          <label for="title-font-size">标题字体大小:</label>
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
          <label for="theme-preference">主题模式:</label>
          <select
            id="theme-preference"
            v-model="themePreference"
            @change="handleThemeChange"
            class="config-select"
          >
            <option value="auto">跟随系统</option>
            <option value="light">浅色模式</option>
            <option value="dark">暗色模式</option>
          </select>
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
            <span>隐藏作品名</span>
          </label>
        </div>
      </div>
      
      <div class="config-section">
        <h3 class="section-title">Bangumi Access Token（可选）</h3>
        <div class="token-config">
          <div class="token-input-group">
            <input
              v-model="bgmToken"
              type="text"
              class="token-input"
              placeholder="留空则使用默认 Token"
            />
            <button
              class="token-clear-btn"
              @click="bgmToken = ''"
              :disabled="!bgmToken"
            >
              清除
            </button>
          </div>
          <p class="token-hint">
            💡 提示：留空将使用默认 Token。设置自定义 Token 后，将优先使用您的 Token。
            <br />
            获取 Token：<a href="https://next.bgm.tv/demo/access-token" target="_blank">https://next.bgm.tv/demo/access-token</a>
          </p>
        </div>
      </div>
      
      <div class="config-section config-section-tiers">
        <h3 class="section-title">评分等级配置</h3>
        
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
            :value="inputValues[index] ?? config.id"
            type="text"
            class="config-input"
            placeholder="等级（如 S、SS、A、EX）"
            @input="(e) => handleTierIdInput(index, (e.target as HTMLInputElement).value)"
            @blur="handleTierIdBlur(config, index)"
          />
          <input
            v-model.number="config.fontSize"
            type="number"
            class="config-fontsize"
            placeholder="字号"
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
            删除
          </button>
          </div>
        </div>
        
      </div>
      </div>
      
      <div class="modal-footer">
        <button class="add-btn" @click="addTier">添加等级</button>
        <div class="footer-actions">
          <button class="btn btn-cancel" @click="handleClose">取消</button>
          <button class="btn btn-save" @click="handleSave">保存</button>
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
  width: 90%;
  max-width: 600px;
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
  padding: 20px;
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
  padding: 20px;
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
  padding: 20px;
  border-top: 2px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
  align-items: center;
  flex-shrink: 0;
  gap: 10px;
}

.add-btn {
  padding: 10px 20px;
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
  padding: 10px 20px;
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

</style>

