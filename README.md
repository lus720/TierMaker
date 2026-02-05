# Tier List - 动画评分表生成器

### 环境要求

- Node.js >= 16.0.0
- npm >= 7.0.0

### 安装依赖

```bash
npm install

npm run dev
```

访问 http://localhost:5173

## 项目结构

```
tier-list-simple/
├── src/
│   ├── components/          # Vue 组件
│   │   ├── TierList.vue    # 主列表组件
│   │   ├── TierRow.vue     # 行组件（支持拖拽）
│   │   ├── SearchModal.vue # 搜索模态框（支持多数据源）
│   │   ├── EditItemModal.vue # 编辑作品模态框
│   │   └── ConfigModal.vue # 配置模态框
│   ├── utils/              # 工具函数
│   │   ├── bangumi.ts      # Bangumi API 封装
│   │   ├── dragManager.ts  # 自定义拖放管理器
│   │   ├── storage.ts      # 本地存储工具
│   │   └── url.ts          # URL 处理工具
│   ├── types.ts            # TypeScript 类型定义
│   ├── App.vue             # 根组件
│   ├── main.ts             # 入口文件
│   └── style.css           # 全局样式
├── index.html              # HTML 模板
├── package.json            # 项目配置
├── vite.config.ts          # Vite 配置
├── tsconfig.json           # TypeScript 配置
└── README.md               # 项目说明
```

## 配置说明

### Bangumi API

[https://bangumi.github.io/api/](https://bangumi.github.io/api/)

[BangumiExtLinker](https://github.com/Rhilip/BangumiExtLinker)

https://next.bgm.tv/demo/access-token 获取 Access Token

https://github.com/wxt2005/bangumi-list-v3 

https://bgmlist.com/api/v1/bangumi/archive/2021q1 获取季度新番

### 季度新番

https://bgmlist.com/

https://yuc.wiki/

https://acgsecrets.hk/

https://m-p.sakura.ne.jp/

## to do list

添加自定义裁剪对调整尺寸功能的适配

拖动时出现闪烁（调整尺寸后）

## to fix

点击导致裁剪逻辑变化

点击拖动导致重新创建元素


## 文档需包含

依赖关系可视化

依赖倒置原则 (DIP) 审查

变更影响模拟

单一职责原则 (SRP) 与泄露检测
