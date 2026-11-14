<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import type { GpuEffectInstance } from '@/infrastructure/gpu-effects'
  import type { GpuEffect, ItemEffect } from '@/types/effects'
  import type { ColorTimelineClip } from './color-timeline-navigator-types'

  // Largest source dimension to grade at — keeps the GPU pass + readback cheap
  // while leaving enough detail for the tile's object-cover crop.
  const GRADE_TILE_MAX_DIMENSION = 256
  // Coalesce live color-wheel drags into ~10fps GPU renders so a drag doesn't
  // queue a readback per pointer frame.
  const GRADE_RENDER_DEBOUNCE_MS = 100

  function toGpuEffectInstances(effects: readonly ItemEffect[]): GpuEffectInstance[] {
    return effects
      .filter((entry) => entry.enabled && entry.effect.type === 'gpu-effect')
      .map((entry) => {
        const gpu = entry.effect as GpuEffect
        return {
          id: entry.id,
          type: gpu.gpuEffectType,
          name: gpu.gpuEffectType,
          enabled: true,
          params: { ...gpu.params },
        }
      })
  }

  /**
   * Prefer the clip's actual start frame; fall back to the import poster (or any
   * stored thumbnail) so the tile shows real content immediately.
   */
  function resolveColorTileBaseUrl(
    startFrameUrl: string | null | undefined,
    clip: ColorTimelineClip,
    posterUrl: string | undefined,
  ): string | undefined {
    return startFrameUrl ?? clip.thumbnailUrl ?? posterUrl
  }

  interface ColorFilmTileProps {
    clip: ColorTimelineClip
    index: number
    selected: boolean
    fps: number
    posterUrl?: string
    onSelect: (clip: ColorTimelineClip) => void
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte'
  import { renderGradedTileFrame } from '@/features/editor/utils/color-grade-tile-renderer'
  import { formatMiniTimelineTimecode, MiniFilmTile, useClipStartFrameUrl } from './mini-timeline'
  import { COLOR_TIMELINE_TEST_ID_PREFIX as TEST_ID_PREFIX, toStyleString } from './color-timeline-navigator-types'

  /**
   * Color film tile = the shared MiniFilmTile plus the baked GPU grade: the
   * real grade is rendered onto the start frame (debounced), falling back to
   * the CSS-approximation grade until it lands, with an RGB grade indicator.
   */
  let { clip, index, selected, fps, posterUrl, onSelect }: ColorFilmTileProps = $props()

  const startFrameUrl = useClipStartFrameUrl(
    () => clip,
    () => fps,
  )
  const baseUrl = $derived(resolveColorTileBaseUrl(startFrameUrl.current, clip, posterUrl))

  const gradeInstances = $derived(toGpuEffectInstances(clip.effects))
  // The reactive digest that gates re-renders, rather than the array identity.
  const signature = $derived(JSON.stringify(gradeInstances))

  // Bake the clip's real GPU grade onto `baseUrl`, returning a graded object URL
  // (or undefined while rendering / when there is nothing to grade / no GPU).
  let gradedUrl = $state<string | undefined>(undefined)

  $effect(() => {
    const url = baseUrl
    void signature
    const current = untrack(() => gradeInstances)
    // Drop any previously baked frame immediately so a stale grade/source frame
    // isn't shown while the new one renders (the revoke effect frees its URL).
    gradedUrl = undefined
    if (!url || current.length === 0) {
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      void renderGradedTileFrame(url, current, GRADE_TILE_MAX_DIMENSION).then((blob) => {
        if (cancelled || !blob) return
        gradedUrl = URL.createObjectURL(blob)
      })
    }, GRADE_RENDER_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  })

  // Revoke the previous URL whenever it is replaced or on unmount.
  $effect(() => {
    const url = gradedUrl
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  })

  // The real GPU grade baked into the frame wins; until it lands (or when
  // WebGPU is unavailable) the base frame shows with the CSS-approximation grade.
  const effectiveGradedUrl = $derived(gradeInstances.length > 0 ? gradedUrl : undefined)
  const hasGrade = $derived(clip.gradeThumbnail.hasGrade)
  const showCssGradeFallback = $derived(!effectiveGradedUrl && hasGrade)
  const thumbnailUrl = $derived(effectiveGradedUrl ?? baseUrl)
  const imageGradeStyle = $derived(
    showCssGradeFallback ? toStyleString(clip.gradeThumbnail.imageStyle) : undefined,
  )
  const imageDataAttributes = $derived({
    'data-graded-thumbnail': hasGrade ? 'true' : undefined,
    'data-grade-source': effectiveGradedUrl ? 'gpu' : hasGrade ? 'css' : undefined,
  })
</script>

{#snippet overlay()}
  {#if showCssGradeFallback && clip.gradeThumbnail.overlayStyle}
    <span
      class="pointer-events-none absolute inset-0"
      data-testid={`${TEST_ID_PREFIX}-grade-overlay`}
      style={toStyleString(clip.gradeThumbnail.overlayStyle)}
    ></span>
  {/if}
  {#if clip.gradeThumbnail.hasGrade}
    <span
      class="pointer-events-none absolute right-1 top-1 flex h-1.5 w-6 overflow-hidden rounded-full border border-black/45 shadow-sm"
      aria-hidden="true"
    >
      <span class="h-full flex-1 bg-red-500"></span>
      <span class="h-full flex-1 bg-lime-400"></span>
      <span class="h-full flex-1 bg-sky-500"></span>
    </span>
  {/if}
{/snippet}

<MiniFilmTile
  {index}
  label={clip.label}
  trackName={clip.trackName}
  timecodeText={formatMiniTimelineTimecode(clip.from, fps)}
  {thumbnailUrl}
  {selected}
  onSelect={() => onSelect(clip)}
  testId={`${TEST_ID_PREFIX}-film-tile`}
  dataClipId={clip.id}
  imageStyle={imageGradeStyle}
  {imageDataAttributes}
  {overlay}
/>
