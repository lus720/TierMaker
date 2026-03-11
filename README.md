# Tier List - 动画评分表生成器

受tiermaker.com和从夯到拉启发，开发的排行榜工具。和tiermaker.com相比，有以下优势：

- 支持标题
- 自定义裁剪，尺寸
- 从部分平台导入
- 本地图片支持：如果是大量本地图片，建议先上传到模板
- 没有水印广告



### 环境要求

- Node.js >= 16.0.0
- npm >= 7.0.0

### 安装依赖

```bash
npm install

npm run dev
```

访问 <http://localhost:5173>


## 配置说明

### Bangumi API

[https://bangumi.github.io/api/](https://bangumi.github.io/api/)

[BangumiExtLinker](https://github.com/Rhilip/BangumiExtLinker)

<https://next.bgm.tv/demo/access-token> 获取 Access Token

<https://github.com/wxt2005/bangumi-list-v3>

<https://bgmlist.com/api/v1/bangumi/archive/2021q1> 获取季度新番

### 季度新番

<https://bgmlist.com/>

<https://yuc.wiki/>

<https://acgsecrets.hk/>

<https://m-p.sakura.ne.jp/>

## to do list

**大量本地图片，拖动卡顿严重**

切换语言，等级名没有跟随变更

优化模板+模糊收缩+图床服务器

导出里加一个pdf导出，是一个失败的决定啊，我看

## 测试

自定义裁剪

容器尺寸调整

导出

拖动功能

模板

## 文档应包含

依赖关系可视化

依赖倒置原则 (DIP) 审查

变更影响模拟

单一职责原则 (SRP) 与泄露检测
