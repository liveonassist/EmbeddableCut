// SPDX-License-Identifier: MIT
// placeholder: ported elsewhere

import { getGpuCategoriesWithEffects } from '@/infrastructure/gpu-effects'
import { prewarmEffectPreviews } from '../components/effect-thumbnail/engine'

export function useGpuEffectPreviewData() {
  const gpuCategories = getGpuCategoriesWithEffects()
  const triggerPreviews = () => prewarmEffectPreviews()
  return { gpuCategories, triggerPreviews }
}
