# 模板功能逻辑整理

本文档分析了目前 TierMaker 项目中“模板 (Template)”相关的核心业务逻辑，涵盖了存储机制、创建与上传、编辑与删除、以及导入使用的完整流程。涉及的主要组件包括 `TemplateGallery.vue`、`TemplateDetail.vue`、`ImportModal.vue` 和 `imgbed.ts`。

## 1. 存储与鉴权逻辑 (Storage & Auth)

- **API 基础**：模板图片存储于 Cloudflare 代理的第三方图床（Sanyue ImgHub），请求图床需要通过特定的 Token 校验。
- **目录结构**：
  - `tiermaker_templates/`：作为根目录，存放**已公开(Public)**的模板。
  - `tiermaker_templates/_pending/`：隐藏目录，存放由普通用户新创建、**待审核(Pending)**的模板。
- **所有权追踪 (Ownership)**：
  - 客户端不强制登录，通过 `localStorage.getItem('tm_user_id')` 给当前浏览器生成固定 UUID 作为标识。
  - 客户端在 `localStorage` 使用 `tm_pending_templates` 字段（JSON 数组）记录该用户自己创建的 Pending 模板名字。
  - “我的待审核模板”列表不是根据服务端文件夹归属来判断的，而是直接通过读取前端 `localStorage` 记录来加载的。

## 2. 模板的创建与图片上传 (Adding)

- **入口**：在 `ImportModal.vue` 的模板标签页 (`TemplateGallery.vue`) 首个卡片点击“创建新模板”。
- **流程**：
  1. 输入只含有字母、数字、下划线及减号的模板名称。
  2. 提交后前端不立刻新建文件夹，而是跳转到对应模板的详情页 (`TemplateDetail.vue`)，此时传入参数 `isPending=true`。
  3. 点击上传或是拖拽图片文件到上传区域。
  4. 多图并行/队列上传 (`uploadMultipleToPendingTemplate`)。API 会自动向图床 `_pending/<templateName>/` 路径长传。
  5. 第一次成功传图后，前端会自动在 `localStorage` 数组中记录该模板的所有权。

## 3. 模板的编辑逻辑 (Editing)

- **公开模板不可编辑**：用户查看 `isPending=false` 的公开模板（公有模板）时，页面仅展示图片列表并提示只读。
- **编辑自己的待审核模板**：当用户点开属于自己的 Pending 模板：
  - **继续添加**：支持追加并上传新的图片。
  - **删除图片**：用户可以点击图片缩略图右上角的 `×` 按钮。前端会将其从界面移除，并调用服务端删除接口 (`deleteFileByUrl`) 通过具体图片 URL 物理删除该图床图片。
- **删除模板**：`TemplateGallery.vue` 源码和 `imgbed.ts` 中已实现 `handleDeletePending` 和 `handleDeletePublic` 功能（删除对应的整个目录并清理所有权）。**注：** 目前应用界面的卡片上只有“导入”和“预览”两个按钮，未在 UI 上直接开放模板删除点击，但逻辑已就绪。

## 4. 试试 / 导入模板 (Trying & Importing)

当用户发现感兴趣的模板并希望在当前页面使用（即作为待评级的素材列表）：

- **触发**：在画廊卡片悬浮触发“导入”，或者在详情页点击“导入该模板”。
- **数据转换**：
  - 取出所属模板目录下的所有图片 URL 进行遍历。
  - 为每张图片生成一个唯一的卡片ID（如 `template_<name>_<index>_<时间戳>`），以及默认的 `UUID`（防止列表渲染冲突）。将每张图构造成 `AnimeItem` 接口所需的数据实体。
- **状态注入 (`App.vue` 交互)**：
  - 由 `$emit` 冒泡经 `ImportModal` 将解析后的卡片列表 `AnimeItem[]` 发送至 `App.vue`（对应 `handleSelectAnimeMultiple` 方法）。
  - 组件会去重（检查当前 `tiers` 列表中是否已存在同 ID item），最终把剩余的所有的该模板图片推入(push)底下未分组备选框(`unrankedTiers`)的中。
  - 用户随即可以在屏幕底端看到加载出的图片素材，并可以拖拽到上面的任意 Rank 行中。

## 5. 审核机制 (Pending to Public)

- 在 TierMaker 客户端维度，所有的“用户新建”默认就是 `Pending` 状态。
- 如果需要将一个用户的贡献变成所有人可见的 Public 模板，由于没有直接的管理员审核 UI 操作，站长需通过底层图床或对应管理后台，将该模板目录从 `tiermaker_templates/_pending/<名称>` 直接`mv`（移动）移回 `tiermaker_templates/<名称>` 根下。
- 移出后，客户端不再能从 `_pending` 中读取到对应文件，而会随着获取全量公开目录 (`listTemplates`)，将该模板展示给全体用户作为公开模板共享。
