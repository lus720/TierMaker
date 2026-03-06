<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { handleLanguageChange } from '../utils/storage'

const { locale, t } = useI18n()

function setLanguage(lang: 'zh' | 'en') {
  if (locale.value !== lang) {
    handleLanguageChange(lang)
    // 强制刷新相关依赖
    window.dispatchEvent(new Event('languagechange'))
  }
}
</script>

<template>
  <div class="language-selector">
    <button class="icon-btn" :title="t('config.language')">
      <!-- 翻译图标 (地球/文A) -->
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="translate-icon">
        <path d="m5 8 6 6"/>
        <path d="m4 14 6-6 2-3"/>
        <path d="M2 5h12"/>
        <path d="M7 2h1"/>
        <path d="m22 22-5-10-5 10"/>
        <path d="M14 18h6"/>
      </svg>
    </button>
    <div class="dropdown-menu">
      <button 
        class="dropdown-item" 
        :class="{ active: locale === 'zh' }"
        @click="setLanguage('zh')"
      >
        中文
      </button>
      <button 
        class="dropdown-item" 
        :class="{ active: locale === 'en' }"
        @click="setLanguage('en')"
      >
        English
      </button>
    </div>
  </div>
</template>

<style scoped>
.language-selector {
  position: relative;
  display: inline-block;
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-color);
  cursor: pointer;
  transition: background-color 0.2s;
}

.icon-btn:hover {
  background: var(--bg-hover-color, rgba(128, 128, 128, 0.1));
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  min-width: 120px;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-10px);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  z-index: 100;
  padding: 4px;
}

.language-selector:hover .dropdown-menu {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}

.dropdown-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: var(--text-color);
  font-size: 14px;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s, color 0.2s;
}

.dropdown-item:hover {
  background: var(--bg-hover-color, rgba(128, 128, 128, 0.1));
}

.dropdown-item.active {
  background: var(--primary-color, #3b82f6);
  color: #ffffff;
  font-weight: 500;
}

/* 适配暗黑模式时的阴影 */
:root[data-theme='dark'] .dropdown-menu {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}
</style>
