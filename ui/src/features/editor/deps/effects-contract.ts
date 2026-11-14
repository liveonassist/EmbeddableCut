// SPDX-License-Identifier: MIT

/**
 * Adapter exports for effects dependencies.
 * Editor modules should import effects components/helpers from here.
 */

export { default as EffectsSection } from '@/features/effects/components/effects-section.svelte'
export { default as ColorGradeSection } from '@/features/effects/components/color-grade-section.svelte'
export { EffectThumbnail } from '@/features/effects/components/effect-thumbnail'
export { prewarmEffectPreviews } from '@/features/effects/components/effect-thumbnail/engine'
export { useGpuEffectPreviewData } from '@/features/effects/hooks/use-gpu-effect-preview-data.svelte'
