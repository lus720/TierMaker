import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router'
import { i18n, setLocale, SUPPORTED_LOCALES, DEFAULT_LOCALE } from './i18n'

// Detect browser language
function detectBrowserLanguage(): string {
    const browserLang = navigator.language || (navigator as any).userLanguage || ''
    const langCode = browserLang.split('-')[0].toLowerCase()

    // Check if browser language is supported
    if (langCode === 'zh') return 'zh'
    if (langCode === 'en') return 'en'

    // Check localStorage for saved preference
    const savedLang = localStorage.getItem('user-language')
    if (savedLang && SUPPORTED_LOCALES.includes(savedLang)) {
        return savedLang
    }

    return DEFAULT_LOCALE
}

const routes: RouteRecordRaw[] = [
    {
        path: '/',
        redirect: () => {
            const lang = detectBrowserLanguage()
            return `/${lang}/`
        }
    },
    {
        path: '/:lang/',
        name: 'home',
        component: () => import('./views/HomeView.vue'),
        beforeEnter: (to, _from, next) => {
            const lang = to.params.lang as string
            if (!SUPPORTED_LOCALES.includes(lang)) {
                return next(`/${DEFAULT_LOCALE}/`)
            }
            setLocale(lang)
            next()
        }
    },
    {
        // Catch all - redirect to default locale
        path: '/:pathMatch(.*)*',
        redirect: () => `/${detectBrowserLanguage()}/`
    }
]

const router = createRouter({
    history: createWebHistory(),
    routes
})

// Update locale when route changes
router.beforeEach((to, _from, next) => {
    const lang = to.params.lang as string
    if (lang && SUPPORTED_LOCALES.includes(lang)) {
        setLocale(lang)
        // Update HTML lang attribute
        document.documentElement.setAttribute('lang', lang === 'zh' ? 'zh-CN' : 'en')
    }
    next()
})

export default router
