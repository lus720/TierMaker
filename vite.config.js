import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
var __dirname = dirname(fileURLToPath(import.meta.url));
export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            '~': resolve(__dirname, './src'),
        },
    },
    server: {
        port: 5173,
        open: true,
    },
    // 配置 base path，用于 GitHub Pages 部署
    // 如果仓库名是 tier-list-simple，则 base 为 '/tier-list-simple/'
    // 如果部署到自定义域名，可以设置为 '/'
    base: process.env.BASE_URL || '/',
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
    },
});
