import { createI18n } from 'vue-i18n'
import zh from './locales/zh.json'
import en from './locales/en.json'

function getDefaultLocale(): 'zh' | 'en' {
    // 1. 用户手动选择（最高优先级）
    const saved = localStorage.getItem('user-language')
    if (saved === 'zh' || saved === 'en') return saved

    // 2. 浏览器语言
    const browserLang = navigator.language || ''
    if (browserLang.startsWith('en')) return 'en'

    // 3. 默认中文
    return 'zh'
}

export const i18n = createI18n({
    legacy: false,
    locale: getDefaultLocale(),
    fallbackLocale: 'zh',
    messages: { zh, en }
})

export function setLocale(locale: 'zh' | 'en') {
    i18n.global.locale.value = locale
    localStorage.setItem('user-language', locale)
}

export function getCurrentLocale(): 'zh' | 'en' {
    return i18n.global.locale.value as 'zh' | 'en'
}
