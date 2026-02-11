/**
 * Calculate the relative luminance of a color
 * https://www.w3.org/TR/WCAG20/#relativeluminancedef
 */
function getLuminance(r: number, g: number, b: number): number {
    const a = [r, g, b].map((v) => {
        v /= 255
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
    })
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722
}

/**
 * Convert hex color to RGB
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result
        ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16),
        }
        : null
}

/**
 * Get the contrast color (black or white) for a given background color
 * Defaults to white text for dark backgrounds, black text for light backgrounds
 */
export function getContrastColor(hexColor: string): string {
    const rgb = hexToRgb(hexColor)
    if (!rgb) return '#ffffff' // Default to white if invalid

    const luminance = getLuminance(rgb.r, rgb.g, rgb.b)

    // Threshold 0.5 is standard, but 0.179 is WCAG cutoff.
    // Using 0.5 as a simple midpoint for black/white decision
    return luminance > 0.5 ? '#000000' : '#ffffff'
}

/**
 * Check if the system is currently in dark mode
 */
export function isDarkMode(themePreference: 'light' | 'dark' | 'auto'): boolean {
    if (themePreference === 'dark') return true
    if (themePreference === 'light') return false
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
}
