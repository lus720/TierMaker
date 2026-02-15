import type { AnimeItem } from '../types'
import type { CropRect } from '../utils/cropUtils'
import type { CSSProperties } from 'vue'
import { getSize, getSetting } from '../utils/configManager'
import { normalizeCropResolution, adaptCropToRatio } from '../utils/cropUtils'

// Use CSSProperties directly for better type compatibility
export type ImageStyle = CSSProperties

export interface CropStrategy {
  /**
   * Get image style for rendering
   * @param item The anime item with crop data
   * @param containerWidth Optional container width (if not provided, uses config)
   * @param containerHeight Optional container height (if not provided, uses config)
   */
  getImageStyle(item: AnimeItem, containerWidth?: number, containerHeight?: number): ImageStyle

  /**
   * Get container dimensions for this strategy
   */
  getContainerDimensions(): { width: number, height: number }

  /**
   * Get config key prefix for this strategy
   */
  getConfigKeyPrefix(): string

  /**
   * Whether this strategy supports auto height
   */
  supportsAutoHeight(): boolean
}

/**
 * Base crop strategy with common logic
 */
export abstract class BaseCropStrategy implements CropStrategy {
  abstract getConfigKeyPrefix(): string
  abstract supportsAutoHeight(): boolean

  getContainerDimensions(): { width: number, height: number } {
    const widthConfig = getSize(`${this.getConfigKeyPrefix()}width`)
    const heightConfig = getSize(`${this.getConfigKeyPrefix()}height`)

    // Handle width
    let width: number
    if (widthConfig === 'auto') {
      // Default fallback for auto width
      width = 320
    } else {
      width = Number(widthConfig) || 100
    }

    // Handle height
    let height: number
    if (heightConfig === 'auto' && this.supportsAutoHeight()) {
      const ratioConfig = getSize(`${this.getConfigKeyPrefix()}aspect-ratio`)
      const ratio = (ratioConfig === 'auto' || !ratioConfig) ? 0.75 : Number(ratioConfig)
      const effectiveRatio = isNaN(ratio) ? 0.75 : ratio
      height = width / effectiveRatio
    } else {
      height = Number(heightConfig) || 133
    }

    return { width, height }
  }

  getImageStyle(item: AnimeItem, containerWidth?: number, containerHeight?: number): ImageStyle {
    const dimensions = this.getContainerDimensions()
    const effectiveWidth = containerWidth ?? dimensions.width
    const effectiveHeight = containerHeight ?? dimensions.height

    // Default style (Cover or unmodified)
    const baseStyle: ImageStyle = {
      width: this.supportsAutoHeight() ? '100%' : `${effectiveWidth}px`,
      height: this.supportsAutoHeight() ? '100%' : `${effectiveHeight}px`,
      objectFit: 'cover',
      objectPosition: 'center',
    }

    const crop = item.cropPosition

    // Custom Crop (Canvas replacement)
    if (typeof crop === 'object' && crop !== null && 'sourceX' in crop) {
      if (!item.naturalWidth || !item.naturalHeight) {
        return { ...baseStyle, visibility: 'hidden' }
      }

      const nw = item.naturalWidth
      const nh = item.naturalHeight
      const currentTargetRatio = effectiveWidth / effectiveHeight

      // 1. Normalize resolution (handle high-res save / low-res preview)
      let effectiveCrop = normalizeCropResolution(crop as CropRect, item.naturalWidth, nw)

      // 2. Adapt to current aspect ratio (handle size setting changes)
      effectiveCrop = adaptCropToRatio(effectiveCrop, currentTargetRatio, nw, nh)

      const { sourceX, sourceY, sourceWidth } = effectiveCrop
      const scale = effectiveWidth / sourceWidth
      const finalWidth = nw * scale
      const finalHeight = nh * scale
      const offsetX = -sourceX * scale
      const offsetY = -sourceY * scale

      return {
        width: `${finalWidth}px`,
        height: `${finalHeight}px`,
        position: 'absolute',
        left: `${offsetX}px`,
        top: `${offsetY}px`,
        objectFit: 'fill',
        maxWidth: 'none',
      }
    }

    // Predefined String Positions
    if (typeof crop === 'string' && crop !== 'auto') {
      return {
        ...baseStyle,
        objectPosition: crop
      }
    }

    // Auto: Smart crop position based on aspect ratio
    if (item.naturalWidth && item.naturalHeight) {
      const targetRatioConfig = getSize(`${this.getConfigKeyPrefix()}aspect-ratio`)
      const targetRatio = targetRatioConfig ? Number(targetRatioConfig) : (effectiveWidth / effectiveHeight)
      const naturalRatio = item.naturalWidth / item.naturalHeight

      // Default: wide image center horizontally, tall image align based on config
      if (naturalRatio > targetRatio) {
        // Wide image: always center horizontally
        return {
          ...baseStyle,
          objectPosition: 'center center'
        }
      } else {
        // Tall image: decide based on config whether to align top or center
        const tallImageMode = getSetting('tall-image-crop-mode') || 'center-top'
        return {
          ...baseStyle,
          objectPosition: tallImageMode === 'center-top' ? 'center top' : 'center center'
        }
      }
    }

    // naturalWidth/Height not ready yet, hide to avoid flickering
    return {
      ...baseStyle,
      visibility: 'hidden'
    }
  }
}

/**
 * Card view crop strategy
 */
export class CardViewCropStrategy extends BaseCropStrategy {
  getConfigKeyPrefix(): string {
    return 'image-'
  }

  supportsAutoHeight(): boolean {
    return false // Card view doesn't support auto height
  }

  getContainerDimensions(): { width: number, height: number } {
    const dimensions = super.getContainerDimensions()
    // Card view doesn't support auto width, ensure it's a number
    if (isNaN(dimensions.width) || dimensions.width <= 0) {
      dimensions.width = 100
    }
    return dimensions
  }

  getImageStyle(item: AnimeItem, containerWidth?: number, containerHeight?: number): ImageStyle {
    // Card view always uses fixed dimensions
    const style = super.getImageStyle(item, containerWidth, containerHeight)
    // Ensure width/height are fixed pixels
    const { width, height } = this.getContainerDimensions()

    if (typeof style.width !== 'string' || !style.width.includes('px')) {
      style.width = `${width}px`
    }
    if (typeof style.height !== 'string' || !style.height.includes('px')) {
      style.height = `${height}px`
    }
    return style
  }
}

/**
 * Detail view crop strategy
 */
export class DetailViewCropStrategy extends BaseCropStrategy {
  getConfigKeyPrefix(): string {
    return 'detail-image-'
  }

  supportsAutoHeight(): boolean {
    return true // Detail view supports auto height
  }

  getImageStyle(item: AnimeItem, containerWidth?: number, containerHeight?: number): ImageStyle {
    const style = super.getImageStyle(item, containerWidth, containerHeight)
    // Detail view defaults to center top for object position
    if (!style.objectPosition || style.objectPosition === 'center') {
      style.objectPosition = 'center top'
    }
    return style
  }
}