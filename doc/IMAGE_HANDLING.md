# 默认图片处理

当动漫或角色没有有效的图片 URL 时，应用程序会使用统一的后备图片。这个后备图片是一个 Base64 编码的 SVG 图片。

## 常量定义

默认图片定义在以下常量文件中：
`src/utils/constants.ts`

```typescript
export const DEFAULT_IMAGE_BASE64 = 'data:image/svg+xml;base64,...'
```

## 使用位置

默认图片在以下组件中使用：

### 1. 搜索与导入 (`src/components/SearchModal.vue`)

- **导入项目**：当从 Bangumi 或其他来源导入动漫或角色时，如果 API 响应中不包含图片，则立即将 `DEFAULT_IMAGE_BASE64` 赋值给 `image` 和 `originalImage`。
  - 参见 `handleSelect` 和 `handleImportCharacters`。
- **搜索结果显示**：如果 API 返回的搜索结果缺少图片，`getImageUrl` 辅助函数会返回默认图片，以防止搜索列表中出现破损的图片图标。
- **图片加载错误**：如果图片 URL 存在但加载失败（例如 404），`handleImageError` 会将 `src` 替换为默认图片。

### 2. 项目编辑 (`src/components/EditItemModal.vue`)

- **保存项目**：保存项目时，模态框会检查图片 URL 是否为空。如果用户清除了 URL 且未上传新文件，代码首先尝试使用原始图片（`originalImage`）或 `DEFAULT_IMAGE_BASE64` 作为后备。
  - 参见 `handleSave`。
- **最终验证弹窗**：如果在尝试所有后备方案后 `finalImageUrl` 仍然为空，函数将触发 `alert('请设置图片（URL 或上传文件）')` 并阻止保存。这是为了防止由于逻辑错误或异常数据导致保存无图片的项目，确保数据的完整性。
  - 触发条件：`!finalImageUrl`（所有图片获取路径均失败）。
  - **触发时机**：此验证发生在使用“自动保存”机制及【取消】按钮退出编辑页面时（如点击遮罩层外部或【取消】按钮）。
  - **重要说明**：由於目前【取消】按钮（`handleCancel`）实际上执行的是保存并关闭操作，因此如果图片缺失，用户将无法通过常规方式关闭窗口，必须提供图片或删除项目。

### 4. 数据持久化与 Blob 处理

- **Blob 稳定性**：`getDefaultImage()` 返回的 Blob 对象内容是固定的（由常量 Base64 生成）。在单次页面会话中，它是一个缓存的单例对象。
- **IndexedDB 存储**：当项目保存到 IndexedDB 时，`_blob` 字段（或 `image` 如果是 Blob 类型）会被存储为二进制数据。
- **自动恢复 (Hydration)**：`App.vue` 在加载数据时包含自动恢复逻辑。如果检测到 `image` 字段是 Blob 类型（从数据库读取），它会自动：
  1. 将 Blob 保存到 `_blob` 字段。
  2. 使用 `URL.createObjectURL` 生成新的临时 URL 赋值给 `image` 字段供 UI 显示。
  这确保了即使 Blob URL 是临时的，数据的持久性和显示也能跨会话正常工作。

## 季度动漫与 VNDB 导入问题分析

**现状描述**：
目前“季度动漫”导入功能（位于 `src/components/ImportModal.vue`）和 VNDB 导入功能在处理缺失图片时，并未复用上述逻辑。

**原因分析**：

- `ImportModal.vue` 拥有独立的数据处理逻辑（`handleBangumiImport` 和 `handleVndbImport`）。
- 在构建 `AnimeItem` 对象时，如果 API 未返回图片 URL，代码将其默认赋值为空字符串 `''`，而不是 `DEFAULT_IMAGE_BASE64`。
- **结果**：导入的项目 `image` 字段为空。虽然 `TierRow` 显示时会尝试回退，但在编辑页面（`EditItemModal`）进行保存时，由于 URL 为空且未通过 `DEFAULT_IMAGE_BASE64` 填充，会触发“请设置图片”的验证拦截，导致用户被卡在编辑页面。

**解决方案建议**：
在 `ImportModal.vue` 中引入 `DEFAULT_IMAGE_BASE64` 常量，并在构建 `AnimeItem` 时，若检测到图片 URL 为空，则赋予默认值。

**实施情况**：
已在 `src/utils/constants.ts` 中添加 `getDefaultImage()` 辅助函数，它返回默认图片的 `{ blob, url }` 对象。
`src/components/ImportModal.vue` 已更新，当从 VNDB 或季度动漫导入时，如果缺少图片，会调用此函数：

- `image`: 使用生成的 Blob URL（用于显示）
- `_blob`: 使用生成的 Blob 对象（用于 IndexedDB 存储）
- `originalImage`: 使用生成的 Blob 对象（保持数据一致性）
