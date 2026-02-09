import { createI18n } from 'vue-i18n'
import zhCN from './locales/zh-CN.json'
import en from './locales/en.json'

export const SUPPORTED_LOCALES = ['zh', 'en']
export const DEFAULT_LOCALE = 'zh'

export const i18n = createI18n({
    legacy: false, // Use Composition API
    locale: DEFAULT_LOCALE,
    fallbackLocale: 'zh',
    messages: {
        zh: zhCN,
        en: en
    }
})

export function setLocale(locale: string) {
    if (SUPPORTED_LOCALES.includes(locale)) {
        (i18n.global.locale as any).value = locale
        localStorage.setItem('user-language', locale)
    }
}

export function getCurrentLocale(): string {
    return (i18n.global.locale as any).value
}
