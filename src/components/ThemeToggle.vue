<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { loadThemePreference, saveThemePreference } from '../utils/storage'

const currentTheme = ref<'light' | 'dark' | 'auto'>('auto')
const isDark = ref(false)
let mediaQuery: MediaQueryList | null = null

const emit = defineEmits<{
  (e: 'theme-changed', theme: 'light' | 'dark' | 'auto'): void
}>()

const updateIsDark = () => {
  if (currentTheme.value === 'auto') {
    isDark.value = mediaQuery ? mediaQuery.matches : false
  } else {
    isDark.value = currentTheme.value === 'dark'
  }
}

const handleSystemThemeChange = (e: MediaQueryListEvent) => {
  if (currentTheme.value === 'auto') {
    isDark.value = e.matches
  }
}

onMounted(() => {
  currentTheme.value = loadThemePreference()
  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  mediaQuery.addEventListener('change', handleSystemThemeChange)
  updateIsDark()
})

onUnmounted(() => {
  if (mediaQuery) {
    mediaQuery.removeEventListener('change', handleSystemThemeChange)
  }
})

watch(currentTheme, () => {
  updateIsDark()
})

const toggleTheme = () => {
  const newTheme = isDark.value ? 'light' : 'dark'
  currentTheme.value = newTheme
  saveThemePreference(newTheme)
  emit('theme-changed', newTheme)
}

// Allows parent external updates (e.g. from ConfigModal) to reach the switch
const syncExternalTheme = (theme: 'light' | 'dark' | 'auto') => {
  currentTheme.value = theme
}
defineExpose({ syncExternalTheme })
</script>

<template>
  <button
    class="theme-toggle"
    :class="{ 'is-dark': isDark }"
    @click="toggleTheme"
    role="switch"
    :aria-checked="isDark"
    aria-label="Toggle theme"
  >
    <div class="thumb">
      <svg v-if="!isDark" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-sun">
        <circle cx="12" cy="12" r="4"/>
        <path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>
      </svg>
      <svg v-else xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-moon">
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
      </svg>
    </div>
  </button>
</template>

<style scoped>
.theme-toggle {
  display: inline-flex;
  align-items: center;
  width: 44px;
  height: 24px;
  background-color: #e5e7eb;
  border-radius: 9999px;
  position: relative;
  cursor: pointer;
  border: 4px solid #e5e7eb;
  transition: background-color 0.2s, opacity 0.2s;
  padding: 0;
  box-sizing: border-box;
  opacity: 1;
}

.theme-toggle:hover {
  opacity: 0.8;
}

.theme-toggle.is-dark {
  background-color: #374151;
  border-color: #374151;
}

.thumb {
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background-color: #ffffff;
  border-radius: 50%;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  transform: translateX(-2px);
  transition: transform 0.2s ease-in-out, background-color 0.2s, color 0.2s;
  color: #1f2937;
}

.theme-toggle.is-dark .thumb {
  transform: translateX(18px);
  background-color: #000000;
  color: #ffffff;
}

.icon-sun, .icon-moon {
  width: 14px;
  height: 14px;
}
</style>
