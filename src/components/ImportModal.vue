<script setup lang="ts">
import { ref } from 'vue'
import { fetchVndbUserList } from '../utils/vndb'
import type { AnimeItem } from '../types'
import type { ExportData } from '../utils/storage'

const emit = defineEmits<{
  close: []
  'import-data': [data: ExportData]
  'import-items': [items: AnimeItem[]]
}>()

const activeTab = ref<'file' | 'vndb'>('file')

// --- File Import Logic ---
const fileInputRef = ref<HTMLInputElement | null>(null)
const error = ref('')

function handleFileClick() {
  fileInputRef.value?.click()
}

function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const jsonStr = e.target?.result as string
      const data = JSON.parse(jsonStr)
      // Basic validation
      if (!data.tiers || !data.tierConfigs) {
        error.value = '无效的配置文件格式'
        return
      }
      emit('import-data', data)
      // Close handled by parent receiving success? or keep open? 
      // Usually import implies closing the modal if successful.
      // We will let App.vue handle closing if it wants, but usually we close here.
      // But App.vue needs to confirm overwrite.
    } catch (e: any) {
      console.error('File parsing error', e)
      error.value = '解析文件失败: ' + e.message
    } finally {
        if (fileInputRef.value) fileInputRef.value.value = ''
    }
  }
  reader.readAsText(file)
}

// --- VNDB Import Logic ---
const vndbUserId = ref('')
const isImportingVndb = ref(false)
const vndbImportStatus = ref('')

async function handleVndbImport() {
  console.log('[ImportModal] handleVndbImport triggered. UserID:', vndbUserId.value)
  if (!vndbUserId.value.trim()) {
    error.value = '请输入 VNDB 用户 ID'
    return
  }
  
  isImportingVndb.value = true
  vndbImportStatus.value = '正在连接 VNDB...'
  error.value = ''
  
  try {
    const results = await fetchVndbUserList(vndbUserId.value)
    console.log('[ImportModal] fetchVndbUserList returned items:', results.length)
    
    if (results.length === 0) {
      error.value = '该用户列表为空或未公开'
      isImportingVndb.value = false
      return
    }
    
    vndbImportStatus.value = `获取到 ${results.length} 个条目，正在处理...`
    
    const animeItems: AnimeItem[] = []
    
    for (const result of results) {
       // 转换为 AnimeItem
       const imageUrl = result.images.large || result.images.medium || result.images.grid || result.images.small || ''
       const itemId = `vndb_${result.id}`
       const defaultUrl = `https://vndb.org/${result.id}`
       
       const anime: AnimeItem = {
         id: itemId,
         name: result.name, // Priority handled in util
         name_cn: result.name_cn || undefined, 
         image: imageUrl,
         date: result.date || undefined,
         score: result.score,
         originalUrl: defaultUrl,
         originalImage: imageUrl,
       }
       animeItems.push(anime)
    }
    
    console.log('[ImportModal] Emitting import-items with items:', animeItems.length)
    emit('import-items', animeItems)
    
    // Status reset handled by keeping modal open or closing?
    // User might want to import again or see "Success".
    vndbImportStatus.value = `成功导入 ${animeItems.length} 个条目！`
    vndbUserId.value = ''
    setTimeout(() => {
        vndbImportStatus.value = ''
        emit('close')
    }, 1500)
    
  } catch (e: any) {
    console.error('[ImportModal] VNDB Import failed:', e)
    error.value = e.message || '导入失败'
  } finally {
    isImportingVndb.value = false
  }
}

function handleClose() {
    emit('close')
}
</script>

<template>
  <div class="modal-overlay" @click.self="handleClose">
    <div class="modal-content">
      <div class="modal-header">
        <h2 class="modal-title">导入数据</h2>
        <button class="close-btn" @click="handleClose">×</button>
      </div>

      <div class="tabs">
        <button 
          class="tab-btn" 
          :class="{ active: activeTab === 'file' }"
          @click="activeTab = 'file'; error = ''"
        >
          从文件 (JSON)
        </button>
        <button 
          class="tab-btn" 
          :class="{ active: activeTab === 'vndb' }"
          @click="activeTab = 'vndb'; error = ''"
        >
          从 VNDB 导入
        </button>
      </div>

      <div class="tab-content">
        <!-- File Import -->
        <div v-if="activeTab === 'file'" class="import-section">
            <p class="description">
                上传之前的备份文件 (JSON) 以恢复数据。
                <br>
                <span class="warning">注意：这将覆盖当前的所​​有数据！</span>
            </p>
            <button class="action-btn primary" @click="handleFileClick">
                📄 选择文件
            </button>
            <input 
                ref="fileInputRef"
                type="file" 
                accept=".json" 
                style="display: none" 
                @change="handleFileChange"
            />
        </div>

        <!-- VNDB Import -->
        <div v-if="activeTab === 'vndb'" class="import-section">
            <p class="description">
                输入您的 VNDB 用户 ID 以导入您的视觉小说列表。
            </p>
            <div class="input-group">
                <input 
                    v-model="vndbUserId"
                    type="text" 
                    placeholder="输入 VNDB 用户 ID (例如: u123456)" 
                    class="id-input"
                    @keydown.enter="handleVndbImport"
                    :disabled="isImportingVndb"
                />
                <button 
                    class="action-btn primary" 
                    @click="handleVndbImport"
                    :disabled="isImportingVndb || !vndbUserId.trim()"
                >
                    {{ isImportingVndb ? '导入中...' : '开始导入' }}
                </button>
            </div>
            
            <div class="vndb-guide">
                <details>
                    <summary>如何获取 ID?</summary>
                    <ol>
                        <li>登录 <a href="https://vndb.org" target="_blank">vndb.org</a></li>
                        <li>进入个人主页，查看 URL 中的 ID (如 /u1234)</li>
                        <li>确保列表设置为公开 (Public)</li>
                    </ol>
                </details>
            </div>
            
            <div v-if="vndbImportStatus" class="status-message">{{ vndbImportStatus }}</div>
        </div>
        
        <div v-if="error" class="error-message">{{ error }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
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
  max-width: 500px;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 20px;
  border-bottom: 2px solid var(--border-color);
  background: var(--bg-color);
}

.modal-title {
  font-size: 20px;
  font-weight: bold;
  color: var(--text-color);
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: var(--text-color);
}

.tabs {
  display: flex;
  border-bottom: 2px solid var(--border-color);
}

.tab-btn {
  flex: 1;
  padding: 12px;
  background: var(--bg-light-color);
  border: none;
  border-bottom: 2px solid transparent; /* Placeholder to prevent resizing */
  cursor: pointer;
  font-weight: bold;
  color: var(--text-color);
}

.tab-btn.active {
  background: var(--bg-color);
  border-bottom: 2px solid var(--primary-color, #007bff); /* Or use text decoration */
  color: var(--primary-color, #007bff);
}

.tab-content {
  padding: 20px;
  min-height: 200px;
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.description {
  color: var(--text-color);
  line-height: 1.5;
  margin-bottom: 10px;
}

.warning {
  color: #ff4d4f;
  font-weight: bold;
}

.action-btn {
  padding: 10px 20px;
  border: 2px solid var(--border-color);
  background: var(--bg-color);
  color: var(--text-color);
  cursor: pointer;
  font-weight: bold;
  transition: all 0.2s;
}

.action-btn:hover:not(:disabled) {
  background: var(--border-color);
  color: var(--bg-color);
}

.action-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.action-btn.primary {
  width: 100%;
}

.input-group {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.id-input {
    padding: 10px;
    border: 2px solid var(--border-color);
    background: var(--input-bg, #fff);
    color: var(--text-color);
}

.vndb-guide {
    font-size: 0.9em;
    color: var(--text-color);
    opacity: 0.8;
}

.vndb-guide ol {
    padding-left: 20px;
    margin: 5px 0;
}

.error-message {
  color: #ff4d4f;
  margin-top: 10px;
  text-align: center;
}

.status-message {
    color: var(--green-color, #28a745);
    text-align: center;
    margin-top: 10px;
}
</style>
