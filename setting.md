# TierMaker 配置参数文档

本文档详细说明了 TierMaker 应用的配置参数、默认值及其存储方式，以及各设置项的更新机制。

## 配置系统概览

应用采用分层配置系统，优先级从高到低如下：

1. **用户本地配置 (Local Storage)**: 用户在 UI 中修改的设置，会覆盖默认值。
2. **默认配置文件 (`config.yaml`)**: 系统内置的默认参数。

---

## 1. 全局设置 (Settings)

这些设置控制应用的全局行为和外观。

| 参数 Key | 描述 | 默认值 | 更新机制 | 存储位置 |
| :--- | :--- | :--- | :--- | :--- |
| `title-font-size` | 标题字体大小 | `32` | **立即生效** | `localStorage: tier-list-title-font-size` |
| `theme` | 主题模式 | `'auto'` | **立即生效** | `localStorage: theme-preference` |
| `export-scale` | 图片导出倍率 | `4` | **保存时更新** (需点击保存按钮) | `localStorage: export-scale` |
| `hide-item-names` | 隐藏条目名称 | `true` | **立即生效** | `localStorage: hide-item-names` |
| `compact-mode` | 紧凑模式 | `true` | **立即生效** | `localStorage: tier-maker-local-config-yaml` (settings字段) |
| `tall-image-crop-mode` | 长图裁剪模式 | `'center-top'` | **立即生效** | `localStorage: tier-maker-local-config-yaml` (settings字段) |

---

## 2. 尺寸与布局 (Sizes)

定义了界面元素的尺寸和间距。

### 图片与卡片 (可动态配置)

用户可以在设置面板中修改以下参数，**修改即立即生效并保存**。

| 参数 Key | 描述 | 默认值 | 备注 |
| :--- | :--- | :--- | :--- |
| `image-width` | 图片宽度 | `100` | 单位: px |
| `image-height` | 图片高度 | `133` | **动态计算**: `width / aspect-ratio` |
| `image-aspect-ratio` | 图片长宽比 | `0.75` | 即 3:4 |
| `item-name-height` | 条目名称区域高度 | `40` |  |

> **动态计算逻辑**:
> 系统会根据 `image-width` (基准) 和 `image-aspect-ratio` 自动计算 `image-height`。

---

## 3. 默认等级配置 (Tiers)

定义了初始的等级分类（标签、颜色、排序）。

* **更新机制**: **立即生效 (防抖)**。用户在设置弹窗中的修改（增删等级、改名、换色）会自动保存并实时反映在界面上。
* **存储位置**: `localStorage: tier-config`。

**默认值** (`config.yaml`):

| ID | 标签 (Label) | 颜色 | 排序 (Order) |
| :--- | :--- | :--- | :--- |
| `t0` | 夯 | `#ff7f7f` (红) | 0 |
| `t1` | 顶级 | `#ffaf7f` (橙) | 1 |
| `t2` | 人上人 | `#ffcf7f` (黄) | 2 |
| `t3` | NPC | `#ffdf7f` (浅黄) | 3 |
| `t4` | 拉完了 | `#cfcfcf` (灰) | 4 |

---

## 4. 交互逻辑说明

### 立即生效 vs 保存生效

* **立即生效**: 绝大多数设置现在都是立即生效的。
  * 包括: 主题、隐藏作品名、紧凑模式、长图裁剪模式、图片尺寸、等级配置 (标签/颜色/排序)、标题字号。
* **保存生效**: 仅保留极少数需要明确确认的设置。
  * 包括: 导出倍率、BGM Token。不过点击“关闭”按钮时，如果手动修改过这些值但未点“保存”，它们可能不会被保存（具体取决于实现细节，建议养成点击保存的习惯，或者视为“保存”按钮的主要作用是关闭并确保兜底保存）。
  * *注：当前实现中，“保存”按钮作为“Save & Close”存在，同时也是手动触发保存的保险栓。*

### 退出行为

由于大部分设置改为立即生效，退出交互也有所变化：

1. **点击“关闭” (Close) / 关闭(x)按钮 / 点击空白处**:
    * **关闭**弹窗。
    * 所有“立即生效”的修改（等级、标题、主题等）**已经保存**，不会被回滚。
    * （如果 BGM Token 或 导出倍率 有未提交的修改，可能会丢失，取决于是否点击过保存）。

2. **点击“保存” (Save)**:
    * **强制保存**所有当前状态（包括可能未被自动触发保存的项）。
    * **关闭**弹窗。
    * 这是最安全的关闭方式，确保所有修改都被持久化。

---

## 5. 其他本地存储键值 (LocalStorage Keys)

除了上述配置外，应用还使用以下 Key 存储状态：

* `tier-list-data`: **核心数据**，存储所有等级和条目数据 (IndexedDB/LocalStorage)。
* `bgm-access-token`: 用户配置的 Bangumi API Token (**保存时更新**)。
* `tier-list-title`: 当前列表的标题。
* `last-search-source`: 上次使用的搜索源 (Bangumi/VNDB等)。
* `user-language`: 用户语言首选项 ('zh' / 'en')。
