# CORS 解决方案说明

## 问题背景

在导出图片和 PDF 时，如果直接使用来自不同域名的图片（如 Bangumi、VNDB 等），会遇到 CORS（跨域资源共享）问题。浏览器会阻止跨域图片被 `html2canvas` 和 `jsPDF` 等库读取，导致导出失败或图片显示为空白。

## 解决方案

本项目使用 **wsrv.nl** 作为 CORS 代理服务来解决跨域问题。

### 核心实现

#### 1. CORS 代理函数

在 `src/App.vue` 中定义了 `getCorsProxyUrl` 函数：

```typescript
// 使用CORS代理获取图片（使用 wsrv.nl，专门用于图片处理，更稳定）
function getCorsProxyUrl(url: string): string {
  if (!url) return ''
  // 如果已经是 wsrv，直接返回
  if (url.includes('wsrv.nl')) return url
  
  // 关键优化：移除 t=... 时间戳，允许浏览器缓存图片
  // output=png 保证透明度和兼容性
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&output=png`
}
```

#### 2. 导出时的处理流程

在导出图片和 PDF 时，使用 `html2canvas` 的 `onclone` 回调函数，在克隆的文档中将所有图片 URL 替换为 CORS 代理 URL：

```typescript
onclone: async (clonedDoc) => {
  // ... 其他处理 ...
  
  // 将所有图片URL替换为CORS代理URL
  const allImages = clonedDoc.querySelectorAll('img') as NodeListOf<HTMLImageElement>
  
  allImages.forEach((img) => {
    const originalSrc = img.getAttribute('data-original-src') || img.getAttribute('src')
    
    // 替换为CORS代理URL
    if (originalSrc && !originalSrc.startsWith('data:') && !originalSrc.includes('wsrv.nl')) {
      const proxyUrl = getCorsProxyUrl(originalSrc)
      img.src = proxyUrl
      img.crossOrigin = 'anonymous'  // 设置跨域属性
    }
    
    // 等待图片加载完成后再继续
    // ...
  })
}
```

#### 3. html2canvas 配置

在 `html2canvas` 配置中启用 CORS 支持：

```typescript
const canvas = await html2canvas(appContentRef.value, {
  scale: 2,
  useCORS: true,  // 开启跨域支持，利用 wsrv.nl 代理的 CORS Header
  allowTaint: false,
  // ...
})
```

## 工作原理

1. **wsrv.nl 服务**：这是一个公共的图片代理服务，它会：
   - 接收原始图片 URL 作为参数
   - 从原始服务器获取图片
   - 添加适当的 CORS 响应头（`Access-Control-Allow-Origin: *`）
   - 返回可跨域访问的图片

2. **URL 格式**：
   ```
   https://wsrv.nl/?url={原始图片URL}&output=png
   ```

3. **优势**：
   - ✅ 无需后端服务器
   - ✅ 无需配置代理
   - ✅ 支持所有图片格式
   - ✅ 自动处理 CORS 头
   - ✅ 可以缓存图片（通过移除时间戳参数）

## 注意事项

1. **性能考虑**：
   - 图片会先通过 wsrv.nl 代理，可能略微增加加载时间
   - 已优化：移除时间戳参数，允许浏览器缓存代理后的图片

2. **数据 URI**：
   - 本地上传的图片（base64 data URI）不需要代理
   - 代码中会跳过 `data:` 开头的 URL

3. **已代理的 URL**：
   - 如果 URL 已经包含 `wsrv.nl`，直接返回，避免重复代理

4. **错误处理**：
   - 如果图片加载失败，会显示占位图
   - 不会因为单个图片失败而影响整个导出流程

## 代码位置

- **CORS 代理函数**：`src/App.vue` 第 1081-1090 行
- **导出图片处理**：`src/App.vue` 第 650-730 行（`handleExportImage`）
- **导出 PDF 处理**：`src/App.vue` 第 905-990 行（`handleExportPDF`）

## 参考

- wsrv.nl 官网：https://wsrv.nl/
- html2canvas 文档：https://html2canvas.hertzen.com/
- CORS 规范：https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS

