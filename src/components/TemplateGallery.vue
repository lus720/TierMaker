<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  listTemplates,
  listTemplateImages,
  listPendingTemplates,
  listPendingTemplateImages,
  deletePendingTemplate,
  deleteTemplate,
} from '../utils/imgbed'
import type { AnimeItem } from '../types'

interface TemplateMeta {
  coverUrl: string
  count: number
}

const emit = defineEmits<{
  'import-items': [items: AnimeItem[]]
  'view-template': [name: string, isPending: boolean]
}>()

// ── 用户标识 ──────────────────────────────────
// userId 不再在组件内使用，所有权通过 localStorage 管理

// ── 搜索 ───────────────────────────────────────
const searchQuery = ref('')

// ── 模板列表 ───────────────────────────────────
const publicTemplates = ref<string[]>([])
const pendingTemplates = ref<string[]>([])
const templateMeta = ref<Record<string, TemplateMeta>>({})
const isLoading = ref(false)
const error = ref('')

// ── 创建新模板 ─────────────────────────────────
const showCreateForm = ref(false)
const newTemplateName = ref('')
const createError = ref('')

// ── 过滤后的公开模板 ───────────────────────────
const filteredPublic = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return publicTemplates.value
  return publicTemplates.value.filter(n => n.toLowerCase().includes(q))
})

// ── 加载模板列表 & 封面 ─────────────────────────
async function loadAll() {
  isLoading.value = true
  error.value = ''
  try {
    const [pub, pend] = await Promise.all([
      listTemplates(),
      Promise.resolve(listPendingTemplates()),
    ])
    publicTemplates.value = pub
    pendingTemplates.value = pend

    // 并行加载封面
    await Promise.all([
      ...pub.map(async name => {
        const imgs = await listTemplateImages(name)
        templateMeta.value[name] = { coverUrl: imgs[0] ?? '', count: imgs.length }
      }),
      ...pend.map(async name => {
        const imgs = await listPendingTemplateImages(name)
        templateMeta.value[`__pending__${name}`] = { coverUrl: imgs[0] ?? '', count: imgs.length }
      }),
    ])
  } catch (e: any) {
    error.value = e.message || '加载失败'
  } finally {
    isLoading.value = false
  }
}

// ── 创建模板（跳转详情页） ──────────────────────
function handleCreate() {
  const name = newTemplateName.value.trim()
  if (!name) { createError.value = '请输入模板名称'; return }
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    createError.value = '名称仅支持字母、数字、下划线和中划线'
    return
  }
  createError.value = ''
  showCreateForm.value = false
  newTemplateName.value = ''
  // 直接跳到详情页（待审核模式），用户在那里上传图片
  emit('view-template', name, true)
}

// ── 查看模板 ────────────────────────────────────
function viewTemplate(name: string, isPending: boolean) {
  emit('view-template', name, isPending)
}

// ── 导入模板 ────────────────────────────────────
async function importTemplate(name: string, isPending: boolean) {
  const imgs = isPending
    ? await listPendingTemplateImages(name)
    : await listTemplateImages(name)
  if (imgs.length === 0) { error.value = '该模板暂无图片'; return }
  const items: AnimeItem[] = imgs.map((url, i) => ({
    id: `template_${name}_${i}_${Date.now()}`,
    name: decodeURIComponent(url.split('/').pop() || `image_${i}`).replace(/\.[^.]+$/, ''),
    image: url,
    originalImage: url,
  }))
  emit('import-items', items)
}

// ── 删除待审核模板 ──────────────────────────────
async function handleDeletePending(name: string) {
  if (!confirm(`确认删除待审核模板「${name}」？`)) return
  try {
    await deletePendingTemplate(name)
    pendingTemplates.value = pendingTemplates.value.filter(n => n !== name)
    delete templateMeta.value[`__pending__${name}`]
  } catch (e: any) {
    error.value = e.message || '删除失败'
  }
}

// ── 删除公开模板（仅管理员场景，保留按钮以一致性） ──
async function handleDeletePublic(name: string) {
  if (!confirm(`确认删除公开模板「${name}」？此操作不可恢复。`)) return
  try {
    await deleteTemplate(name)
    publicTemplates.value = publicTemplates.value.filter(n => n !== name)
    delete templateMeta.value[name]
  } catch (e: any) {
    error.value = e.message || '删除失败'
  }
}

onMounted(loadAll)
</script>

<template>
  <div class="gallery-root">
    <!-- 搜索栏 -->
    <div class="search-bar">
      <input
        v-model="searchQuery"
        class="search-input"
        placeholder="搜索模板..."
        type="text"
      />
    </div>

    <!-- 错误 -->
    <div v-if="error" class="error-text">{{ error }}</div>

    <!-- 加载中 -->
    <div v-if="isLoading" class="loading-hint">加载中...</div>

    <!-- 模板网格 -->
    <div v-else class="gallery-grid">
      <!-- 创建新模板 卡片（始终第一位） -->
      <div
        class="grid-card create-card"
        :class="{ 'create-card--open': showCreateForm }"
        @click="!showCreateForm && (showCreateForm = true)"
      >
        <!-- 未展开：显示 + 和标签 -->
        <div v-if="!showCreateForm" class="create-inner">
          <div class="create-plus">＋</div>
          <div class="create-label">创建新模板</div>
        </div>

        <!-- 展开：居中显示输入表单，替换 + 区域 -->
        <div v-else class="create-form-center" @click.stop>
          <input
            v-model="newTemplateName"
            class="create-input"
            placeholder="输入模板名称"
            @keydown.enter="handleCreate"
            autofocus
          />
          <div v-if="createError" class="create-error">{{ createError }}</div>
          <div class="create-actions">
            <button class="btn-cancel" @click.stop="showCreateForm = false; newTemplateName = ''; createError = ''">取消</button>
            <button class="btn-confirm" @click.stop="handleCreate">创建</button>
          </div>
        </div>
      </div>

      <!-- 用户待审核模板 -->
      <div
        v-for="name in pendingTemplates"
        :key="`pending-${name}`"
        class="grid-card template-card"
        @click="viewTemplate(name, true)"
      >
        <!-- 封面 -->
        <div class="card-cover">
          <img
            v-if="templateMeta[`__pending__${name}`]?.coverUrl"
            :src="templateMeta[`__pending__${name}`].coverUrl"
            :alt="name"
            class="cover-img"
          />
          <div v-else class="cover-placeholder">🖼️</div>
          <!-- 图片数角标 -->
          <span class="count-badge">
            {{ templateMeta[`__pending__${name}`]?.count ?? '...' }}
          </span>
          <!-- 待审核角标 -->
          <span class="pending-badge">待审核</span>
        </div>
        <!-- 卡片底部 -->
        <div class="card-footer">
          <div class="card-title" :title="name">{{ name }}</div>
        </div>
        <!-- 悬停操作层 -->
        <div class="card-overlay">
          <button class="ov-btn ov-import" @click.stop="importTemplate(name, true)">导入</button>
          <button class="ov-btn ov-preview" @click.stop="viewTemplate(name, true)">预览</button>
        </div>
      </div>

      <!-- 公开模板 -->
      <div
        v-for="name in filteredPublic"
        :key="`pub-${name}`"
        class="grid-card template-card"
        @click="viewTemplate(name, false)"
      >
        <!-- 封面 -->
        <div class="card-cover">
          <img
            v-if="templateMeta[name]?.coverUrl"
            :src="templateMeta[name].coverUrl"
            :alt="name"
            class="cover-img"
          />
          <div v-else class="cover-placeholder">🖼️</div>
          <!-- 图片数角标 -->
          <span class="count-badge">{{ templateMeta[name]?.count ?? '...' }}</span>
        </div>
        <!-- 卡片底部 -->
        <div class="card-footer">
          <div class="card-title" :title="name">{{ name }}</div>
        </div>
        <!-- 悬停操作层 -->
        <div class="card-overlay">
          <button class="ov-btn ov-import" @click.stop="importTemplate(name, false)">导入</button>
          <button class="ov-btn ov-preview" @click.stop="viewTemplate(name, false)">预览</button>
        </div>
      </div>

      <!-- 无公开模板 -->
      <div
        v-if="!isLoading && filteredPublic.length === 0 && pendingTemplates.length === 0"
        class="empty-hint"
      >
        {{ searchQuery ? '没有匹配的模板' : '暂无公开模板' }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.gallery-root {
  display: flex;
  flex-direction: column;
  gap: 14px;
  height: 100%;
  min-height: 0;
}

/* ── 搜索栏 ───────────────────────────────────── */
.search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-light-color);
  border: 1.5px solid var(--border-color);
  border-radius: 6px;
  padding: 8px 12px;
  flex-shrink: 0;
  transition: border-color 0.2s;
}
.search-bar:focus-within {
  border-color: var(--primary-color, #4a9eff);
}
.search-icon { font-size: 14px; opacity: 0.6; flex-shrink: 0; }
.search-input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: var(--text-color);
  font-size: 14px;
}
.search-input::placeholder { opacity: 0.45; }

/* ── 提示文字 ──────────────────────────────────── */
.loading-hint, .empty-hint, .error-text {
  text-align: center;
  font-size: 13px;
  padding: 20px 0;
  color: var(--text-color);
  opacity: 0.6;
}
.error-text { color: #f87171; opacity: 1; }

/* ── 网格 ──────────────────────────────────────── */
.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
  overflow-y: auto;
  padding: 2px 2px 8px;
  flex: 1;
  min-height: 0;
  align-content: start;
}
.gallery-grid::-webkit-scrollbar { width: 6px; }
.gallery-grid::-webkit-scrollbar-track { background: var(--scrollbar-track); border-radius: 3px; }
.gallery-grid::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 3px; }

/* ── 卡片通用 ──────────────────────────────────── */
.grid-card {
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  position: relative;
  border: 1.5px solid var(--border-color);
  transition: border-color 0.18s, transform 0.18s, box-shadow 0.18s;
  background: var(--bg-light-color);
}
.grid-card:hover {
  border-color: var(--primary-color, #4a9eff);
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0,0,0,0.25);
}

/* ── 创建卡片 ──────────────────────────────────── */
.create-card {
  min-height: 190px;
  display: flex;
  flex-direction: column;
}
.create-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 8px;
  padding: 20px;
}
.create-plus {
  font-size: 36px;
  font-weight: 200;
  color: var(--primary-color, #4a9eff);
  line-height: 1;
}
.create-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
  opacity: 0.9;
}
.create-form-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  gap: 10px;
  padding: 16px;
  cursor: default;
}
.create-card--open {
  cursor: default;
}
.create-card--open:hover {
  transform: none;
  box-shadow: none;
}
.create-input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  background: var(--bg-light-color);
  border: 1.5px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-color);
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
}
.create-input:focus { border-color: var(--primary-color, #4a9eff); }
.create-error { font-size: 11px; color: #f87171; }
.create-actions { display: flex; gap: 6px; justify-content: flex-end; }
.btn-cancel, .btn-confirm {
  padding: 6px 14px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  border: 1.5px solid var(--border-color);
  transition: all 0.2s;
}
.btn-cancel { background: var(--bg-light-color); color: var(--text-color); }
.btn-cancel:hover { background: var(--border-color); }
.btn-confirm {
  background: var(--primary-color, #4a9eff);
  color: #fff;
  border-color: var(--primary-color, #4a9eff);
}
.btn-confirm:hover { opacity: 0.85; }

/* ── 模板卡片 ──────────────────────────────────── */
.template-card { min-height: 190px; }

.card-cover {
  position: relative;
  width: 100%;
  aspect-ratio: 3 / 4;
  overflow: hidden;
  background: #111;
}
.cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.3s;
}
.template-card:hover .cover-img { transform: scale(1.05); }

.cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30px;
  opacity: 0.35;
}

/* 右上角图片数角标 */
.count-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  background: rgba(0,0,0,0.72);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  line-height: 1.4;
  backdrop-filter: blur(4px);
}

/* 待审核角标 */
.pending-badge {
  position: absolute;
  top: 6px;
  left: 6px;
  background: #f59e0b;
  color: #000;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  line-height: 1.4;
  letter-spacing: 0.2px;
}

/* 卡片底部标题 */
.card-footer {
  padding: 8px 8px 10px;
}
.card-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  line-height: 1.4;
}

/* 悬停操作层 */
.card-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  opacity: 0;
  transition: opacity 0.2s;
}
.template-card:hover .card-overlay { opacity: 1; }

.ov-btn {
  width: 100%;
  border: none;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  color: #fff;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 导入占据 1/4 */
.ov-import {
  flex: 1; /* 1份 */
  background: rgba(74, 158, 255, 0.6); /* 使用半透明的主题色 */
  backdrop-filter: blur(2px);
  font-size: 14px;
}
.ov-import:hover {
  background: rgba(74, 158, 255, 0.9);
}

/* 预览占据 3/4 */
.ov-preview {
  flex: 3; /* 3份 */
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(2px);
  font-size: 16px;
}
.ov-preview:hover {
  background: rgba(0, 0, 0, 0.7);
}
</style>
