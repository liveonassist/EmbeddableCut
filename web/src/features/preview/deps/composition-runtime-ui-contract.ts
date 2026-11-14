/**
 * UI half of `composition-runtime-contract`: the components and hooks that stay with the app.
 */

export { MainComposition } from '@/runtime/composition-runtime/compositions/main-composition'
export { ensureAudioContextResumed, getPreviewAudioContextState, transitionSafePlay } from '@/runtime/composition-runtime/components/video-audio-context'
