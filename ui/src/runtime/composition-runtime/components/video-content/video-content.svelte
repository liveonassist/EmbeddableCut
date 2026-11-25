<!-- SPDX-License-Identifier: MIT -->
<!--
  Video content with audio volume/fades support.

  Uses native HTML5 video for preview; export uses Canvas + WebCodecs.
-->
<script lang="ts">
  import { untrack } from 'svelte'
  import { blobUrlManager } from '@/infrastructure/browser/blob-url-manager'
  import type { ResolvedAudioEqSettings } from '@/types/audio'
  import type { VideoItem } from '@/types/timeline'
  import ProResPreviewCanvas from '../prores-preview-canvas.svelte'
  import { useVideoAudioState } from '../video-audio-context.svelte'
  import NativePreviewVideo from './native-preview-video.svelte'
  import TwinPreviewVideo from './twin-preview-video.svelte'
  import {
    contentLog,
    isRecoverableVideoLoadError,
    liveDecodeMediaIds,
    shouldUseLiveDecodeForMedia,
  } from './video-content-shared'

  let {
    item,
    muted,
    safeTrimBefore,
    playbackRate,
    sourceFps,
    isReversed = false,
    reverseSourceEnd,
    audioEqStages,
    forceCssComposite = false,
  }: {
    item: VideoItem & {
      _sequenceFrameOffset?: number
      _poolClipId?: string
      _sharedTransitionSync?: boolean
      _twinOf?: string
    }
    muted: boolean
    safeTrimBefore: number
    playbackRate: number
    sourceFps: number
    isReversed?: boolean
    reverseSourceEnd?: number
    audioEqStages: ReadonlyArray<ResolvedAudioEqSettings>
    forceCssComposite?: boolean
  } = $props()

  const audioState = useVideoAudioState(
    () => item,
    () => muted,
    () => audioEqStages,
  )
  // During transition overlaps, the composition's audio crossfade system
  // (CustomDecoderAudio) handles audio mixing. Mute the DOM video element
  // to prevent doubling — one audio stream from the element and another
  // from the crossfade renderer.
  const audioVolume = $derived(item._sharedTransitionSync ? 0 : audioState.audioVolume)

  // VideoContent instances are reused across clips on a pooled lane (the item prop swaps
  // without a remount — see the pooled-handoff test). Re-key the decode/error state to the
  // active media so handoffs don't carry over stale fallback state: a previously failed
  // ProRes clip must not force a decodable next item into live decode, and a newly
  // unsupported item must still enter the upfront live-decode flow. Both are deriveds
  // of the media id that handlers override, so a new id resets them before the next render.
  const mediaId = $derived(item.mediaId)
  let hasError = $derived.by(() => {
    void mediaId
    return false
  })
  // ProRes (and other browser-undecodable codecs) can't play through a <video>
  // element, so on failure we fall back to live turbores decode painted to a canvas.
  // Initialize from the session set so a known-undecodable clip never mounts a <video>.
  let useLiveDecode = $derived(shouldUseLiveDecodeForMedia(mediaId))
  const attempts = { mediaId: untrack(() => mediaId), liveDecodeTried: false, retried: false }
  // One-shot per-item retry: on first failure, invalidate the blob URL so
  // the upstream resolver (driven by `useBlobUrlVersion`) produces a fresh
  // one. Fixes `ERR_UPLOAD_FILE_CHANGED` / "Format error" when a blob URL
  // was captured before a concurrent mirror-write completed, which manifests
  // as "works on refresh, fails on direct URL first load".
  function currentAttempts() {
    if (attempts.mediaId !== item.mediaId) {
      attempts.mediaId = item.mediaId
      attempts.liveDecodeTried = false
      attempts.retried = false
    }
    return attempts
  }

  // Handle media errors (e.g., invalid blob URL after HMR or cache cleanup).
  function handleError(error: Error) {
    contentLog.warn(`Media error for item ${item.id}:`, error.message)
    const tries = currentAttempts()

    // Skip the blob-refresh retry for media already known to need live decode — the
    // failure is the codec, not a stale blob, so re-resolving just causes churn.
    const knownLiveDecode = item.mediaId !== undefined && liveDecodeMediaIds.has(item.mediaId)
    if (
      !knownLiveDecode &&
      isRecoverableVideoLoadError(error.message) &&
      !tries.retried &&
      item.mediaId
    ) {
      tries.retried = true
      contentLog.info(`Retrying item ${item.id} with fresh blob URL for media ${item.mediaId}`)
      blobUrlManager.invalidate(item.mediaId)
      return
    }

    // The <video> element can't decode this source. Before giving up, try live
    // turbores decode (ProRes). If that also fails, the canvas reports back and we
    // show the unavailable state.
    if (!tries.liveDecodeTried) {
      tries.liveDecodeTried = true
      if (item.mediaId) {
        liveDecodeMediaIds.add(item.mediaId)
      }
      contentLog.info(`Falling back to live decode for item ${item.id}`)
      useLiveDecode = true
      return
    }

    hasError = true
  }

  // Set when the twin never showed up, so the item gets a video of its own.
  let untwinned = $derived.by(() => {
    void item._twinOf
    return false
  })

  function handleLiveDecodeError(error: Error) {
    contentLog.warn(`Live decode failed for item ${item.id}:`, error.message)
    hasError = true
  }
</script>

{#if hasError}
  <!-- Show error state if media failed to load -->
  <div
    style="width: 100%; height: 100%; background-color: #1a1a1a; display: flex; align-items: center; justify-content: center;"
  >
    <p style="color: #666; font-size: 14px;">Media unavailable</p>
  </div>
{:else if useLiveDecode}
  <!-- ProRes and other browser-undecodable codecs: decode live via turbores to a canvas. -->
  <ProResPreviewCanvas
    itemId={item.id}
    src={item.src!}
    {safeTrimBefore}
    sequenceFrameOffset={item._sequenceFrameOffset ?? 0}
    {sourceFps}
    {playbackRate}
    {isReversed}
    {reverseSourceEnd}
    onError={handleLiveDecodeError}
  />
{:else if item._twinOf && !untwinned}
  <TwinPreviewVideo itemId={item.id} twinId={item._twinOf} onMissing={() => (untwinned = true)} />
{:else}
  <!-- Native HTML5 video with VideoSourcePool for element reuse -->
  <NativePreviewVideo
    poolClipId={item._poolClipId ?? item.id}
    itemId={item.id}
    src={item.src!}
    {safeTrimBefore}
    sequenceFrameOffset={item._sequenceFrameOffset ?? 0}
    {sourceFps}
    {playbackRate}
    {isReversed}
    {reverseSourceEnd}
    {audioVolume}
    audioEqStages={audioState.resolvedAudioEqStages}
    onError={handleError}
    fitMode="fill"
    {forceCssComposite}
    sharedTransitionSync={item._sharedTransitionSync === true}
  />
{/if}
