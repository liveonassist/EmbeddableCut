/**
 * Adapter exports for keyframe editor logic used by lazy timeline panels.
 */

export {
  getAnimatablePropertiesForItem,
  getEffectPropertyBaseValue,
  getProceduralBands,
  buildVectorPromotionPlan,
  resolveAnimatedTransform,
  getShapeAnimatableBaseValue,
  resolveAnimatedShapeItem,
  resolveExpressionReferenceValue,
  captureAnimationFromItem,
  getPresetCompatibility,
  buildBakeMotionPlan,
  cloneMotionAnimationLayer,
} from './keyframes-contract'
export type { PresetIncompatibilityReason, ProceduralPreviewInput } from './keyframes-contract'
