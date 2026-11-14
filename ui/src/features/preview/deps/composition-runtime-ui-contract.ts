// SPDX-License-Identifier: MIT

/**
 * UI half of `composition-runtime-contract`: the components and hooks that stay with the app.
 */

export { default as MainComposition } from '@/runtime/composition-runtime/compositions/main-composition.svelte'
export {
  ensureAudioContextResumed,
  getPreviewAudioContextState,
  transitionSafePlay,
} from '@/runtime/composition-runtime/components/video-audio-context.svelte'
