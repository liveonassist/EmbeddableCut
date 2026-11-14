// SPDX-License-Identifier: MIT

import { getGpuCategoriesWithEffects } from '@/infrastructure/gpu-effects'
import { prewarmEffectPreviews } from '../components/effect-thumbnail/engine'

/**
 * Data + warm-up trigger for the effect-picker thumbnails. Thumbnails render
 * live through `EffectThumbnail`; this hook just supplies the effect
 * categories and a `triggerPreviews` that warms the shared GPU pipeline and
 * sample frame so the first hover is instant.
 */
export function useGpuEffectPreviewData() {
  const gpuCategories = getGpuCategoriesWithEffects()
  const triggerPreviews = () => prewarmEffectPreviews()
  return { gpuCategories, triggerPreviews }
}
