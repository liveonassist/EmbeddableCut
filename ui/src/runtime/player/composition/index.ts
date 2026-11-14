// SPDX-License-Identifier: MIT

/**
 * Composition primitives:
 *
 * - Sequence: Time-bounded visibility
 * - AbsoluteFill: Full container positioning
 * - interpolate: Animation interpolation
 *
 * These are designed to work with the Clock system and can be
 * used independently or together.
 */

// Sequence component and context
export { default as Sequence } from './Sequence.svelte'
export {
  setSequenceContext,
  useSequenceContext,
  type SequenceContextValue,
} from './sequence-context'

// AbsoluteFill component
export { default as AbsoluteFill } from './AbsoluteFill.svelte'

// Interpolation utilities
export { interpolate } from '@/runtime/player/composition/interpolate'
