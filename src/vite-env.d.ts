/// <reference types="vite/client" />

// 声明 YAML 文件的导入类型
declare module '*.yaml?raw' {
    const content: string
    export default content
}

declare module '*.yml?raw' {
    const content: string
    export default content
}
