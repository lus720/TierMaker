# 代理服务与 CORS 解决方案说明

本项目使用代理服务来解决由于浏览器的同源策略（SOP）导致的跨域资源共享（CORS）问题。

## 为什么需要使用代理？

在浏览器端直接请求第三方 API（如 Bangumi 归档数据） or 加载第三方图片（用于 Canvas 导出）时，如果目标服务器没有设置允许跨域的响应头（`Access-Control-Allow-Origin`），浏览器会拦截响应，导致请求失败。

为了绕过这个限制，我们需要使用 **CORS 代理服务**。代理服务的工作原理是：

1. 客户端向代理服务发送请求，将目标 URL 作为参数传递。
2. 代理服务在服务端向目标 URL 发起请求（服务端不受 CORS 限制）。
3. 代理服务收到响应后，在响应头中添加 `Access-Control-Allow-Origin: *`。
4. 代理服务将带有 CORS 头的数据转发回客户端。

## 使用的代理服务

本项目根据不同的用途，使用了以下代理服务：

### 1. API 数据获取 (Bangumi 归档)

用于获取 Bangumi 的季度番剧列表数据 (JSON)。

* **首选**: **CodeTabs** (`https://api.codetabs.com/v1/proxy`)
  * **理由**: 免费，稳定，支持 JSON 数据透传。
* **备选**: **AllOrigins** (`https://api.allorigins.win/raw`)
  * **理由**: 作为备用，但有时不稳定或返回 502 错误。
* **已弃用**: **CorsProxy.io** (`https://corsproxy.io/`)
  * **理由**: 该服务现已收费，不再适合本项目。

### 2. 图片资源获取 (导出功能)

用于在导出 TierList 图片或 PDF 时，加载跨域图片并在 Canvas 中绘制。

* **首选**: **wsrv.nl** (`https://wsrv.nl/`)
  * **理由**: 专为图片优化，性能好，支持格式转换，并且可以自动添加正确的 CORS 头。我们通常添加 `output=png` 参数以确保格式兼容。

## 代码位置

### API 代理逻辑

位于 `src/utils/bangumiList.ts` 中的 `fetchWithFallback` 函数：

```typescript
// src/utils/bangumiList.ts

async function fetchWithFallback(targetUrl: string): Promise<any> {
    const proxies = [
        // Primary: codetabs (reliable, free)
        (u: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
        // Fallback: allorigins.win
        (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`
    ]
    // ... 轮询尝试代理 ...
}
```

### 图片代理逻辑

位于 `src/App.vue` 中的 `getCorsProxyUrl` 函数：

```typescript
// src/App.vue

function getCorsProxyUrl(url: string): string {
  // ...
  // 使用 wsrv.nl 作为图片代理
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&output=png`
}
```

## 注意事项

1. **稳定性**: 免费公共代理服务可能存在不稳定性。代码中实现了 `fetchWithFallback` 机制，如果首选代理失败，会自动尝试备选代理。
2. **安全性**: 避免通过公共代理传输敏感数据（如 Token、密码）。本项目仅用于获取公开的番剧数据和图片，不涉及敏感信息。
3. **缓存**: `wsrv.nl` 会对图片进行缓存，这有助于提升性能。但在调试时可能需要注意缓存带来的影响（虽然我们移除了时间戳参数以利用缓存）。
4. **AllOrigins 限制**: `allorigins` 的 `raw` 端点有时会因为服务端限制而返回 403 或 502，因此仅作为备用。

## 参考链接

* [CodeTabs CORS Proxy](https://codetabs.com/cors/cors-proxy.html)
* [wsrv.nl (Image Proxy)](https://wsrv.nl/)
* [AllOrigins](https://allorigins.win/)
* [MDN: CORS (跨源资源共享)](https://developer.mozilla.org/zh-CN/docs/Web/HTTP/CORS)
