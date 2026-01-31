export interface CropRect {
    sourceX: number
    sourceY: number
    sourceWidth: number
    sourceHeight: number
}

/**
 * Scale crop coordinates from a saved resolution basis to the current runtime resolution.
 * Handles cases where a crop was saved on a high-res image but loaded on a low-res proxy.
 */
export function normalizeCropResolution(
    crop: CropRect,
    savedWidth: number | undefined,
    currentWidth: number
): CropRect {
    if (!savedWidth || savedWidth <= 0 || savedWidth === currentWidth) {
        return { ...crop }
    }

    // Avoid scaling if difference is negligible (e.g. float errors)
    if (Math.abs(savedWidth - currentWidth) < 1) {
        return { ...crop }
    }

    const scale = currentWidth / savedWidth
    return {
        sourceX: crop.sourceX * scale,
        sourceY: crop.sourceY * scale,
        sourceWidth: crop.sourceWidth * scale,
        sourceHeight: crop.sourceHeight * scale
    }
}

/**
 * Adapt a crop rectangle to a new target aspect ratio.
 * Strategy: "Cover" / "Expand"
 * - Keeps the center point of the original crop.
 * - Expands width or height to match the target ratio.
 * - Clamps to the image natural dimensions.
 */
export function adaptCropToRatio(
    crop: CropRect,
    targetRatio: number,
    naturalWidth: number,
    naturalHeight: number
): CropRect {
    const currentRatio = crop.sourceWidth / crop.sourceHeight

    // If ratios are close enough, return as is (clamped)
    if (Math.abs(currentRatio - targetRatio) < 0.01) {
        return clampCrop(crop, naturalWidth, naturalHeight)
    }

    const centerX = crop.sourceX + crop.sourceWidth / 2
    const centerY = crop.sourceY + crop.sourceHeight / 2

    let newWidth: number
    let newHeight: number

    if (targetRatio > currentRatio) {
        // Target is Wider: Preserve Height, Expand Width
        newHeight = crop.sourceHeight
        newWidth = newHeight * targetRatio

        // If expanded width exceeds image, constraint width and shrink height
        if (newWidth > naturalWidth) {
            newWidth = naturalWidth
            newHeight = newWidth / targetRatio
        }
    } else {
        // Target is Taller: Preserve Width, Expand Height
        newWidth = crop.sourceWidth
        newHeight = newWidth / targetRatio

        // If expanded height exceeds image, constraint height and shrink width
        if (newHeight > naturalHeight) {
            newHeight = naturalHeight
            newWidth = newHeight * targetRatio
        }
    }

    // Recalculate Top-Left from Center
    let newX = centerX - newWidth / 2
    let newY = centerY - newHeight / 2

    // Clamp Position (Slide if out of bounds)
    if (newX < 0) newX = 0
    if (newY < 0) newY = 0
    if (newX + newWidth > naturalWidth) newX = naturalWidth - newWidth
    if (newY + newHeight > naturalHeight) newY = naturalHeight - newHeight

    return {
        sourceX: newX,
        sourceY: newY,
        sourceWidth: newWidth,
        sourceHeight: newHeight
    }
}

/**
 * Clamp a crop rect to ensure it stays within image bounds.
 */
function clampCrop(crop: CropRect, maxWidth: number, maxHeight: number): CropRect {
    let { sourceX, sourceY, sourceWidth, sourceHeight } = crop

    // Constraint Dimensions
    if (sourceWidth > maxWidth) sourceWidth = maxWidth
    if (sourceHeight > maxHeight) sourceHeight = maxHeight

    // Constraint Position
    if (sourceX < 0) sourceX = 0
    if (sourceY < 0) sourceY = 0
    if (sourceX + sourceWidth > maxWidth) sourceX = maxWidth - sourceWidth
    if (sourceY + sourceHeight > maxHeight) sourceY = maxHeight - sourceHeight

    return { sourceX, sourceY, sourceWidth, sourceHeight }
}
