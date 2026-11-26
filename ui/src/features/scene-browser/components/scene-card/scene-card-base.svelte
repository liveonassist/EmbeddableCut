<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import Film from '@lucide/svelte/icons/film'
  import Palette from '@lucide/svelte/icons/palette'
  import Search from '@lucide/svelte/icons/search'
  import { cn } from '@/shared/ui/cn'
  import { t } from '$lib/i18n.svelte'
  import { select } from '$lib/store.svelte'
  import { formatDuration } from '@/features/scene-browser/deps/media-library'
  import { useCaptionThumbnail } from '../../hooks/use-caption-thumbnail.svelte'
  import { useSceneBrowserStore } from '@/features/scene-browser/stores/scene-browser-store'
  import { nearestColorFamily } from '@/features/scene-browser/utils/color-boost'
  import { seekToScene } from '@/features/scene-browser/utils/seek'
  import { SceneMatchBadges, SceneMatchStrength } from '../scene-match-badges'
  import ScenePaletteSwatches from '../scene-palette-swatches.svelte'
  import type { ScoredScene } from '@/features/scene-browser/utils/rank'
  import { parseCaptionIndex, type SceneMatchState } from './types'

  interface SceneCardBaseProps {
    scene: ScoredScene
    mediaName: 'source' | 'hidden'
    match?: SceneMatchState
  }

  let { scene, mediaName, match }: SceneCardBaseProps = $props()

  const thumbUrl = useCaptionThumbnail(
    () => scene.thumbRelPath,
    () => {
      const captionIndex = parseCaptionIndex(scene.id)
      return scene.thumbRelPath || captionIndex === null
        ? undefined
        : { mediaId: scene.mediaId, captionIndex, timeSec: scene.timeSec }
    },
  )

  const colorMode = select(useSceneBrowserStore, (s) => s.colorMode)

  function handleOpen() {
    seekToScene(scene.mediaId, scene.timeSec)
  }

  function handleSwatchClick(swatch: { l: number; a: number; b: number }) {
    const { setQuery, setReference } = useSceneBrowserStore.getState()
    if (colorMode.current) {
      setReference({
        sceneId: `swatch-${Math.round(swatch.l)}-${Math.round(swatch.a)}-${Math.round(swatch.b)}`,
        label: t('sceneBrowser.palette.pickedSwatch'),
        palette: [{ l: swatch.l, a: swatch.a, b: swatch.b, weight: 1 }],
      })
      return
    }
    const family = nearestColorFamily(swatch)
    if (!family) return
    setReference(null)
    setQuery(family)
  }

  function handleFindSimilarPalette(event: MouseEvent) {
    event.stopPropagation()
    if (!scene.palette || scene.palette.length === 0) return
    const { setQuery, setReference } = useSceneBrowserStore.getState()
    setQuery('')
    setReference({
      sceneId: scene.id,
      label: `${scene.mediaFileName} · ${formatDuration(scene.timeSec)}`,
      palette: scene.palette.map((p) => ({ l: p.l, a: p.a, b: p.b, weight: p.weight })),
    })
  }

  function handleDragStart(event: DragEvent) {
    if (!event.dataTransfer) return
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData(
      'application/json',
      JSON.stringify({
        type: 'scene-drop' as const,
        mediaId: scene.mediaId,
        fileName: scene.mediaFileName,
        startSec: scene.timeSec,
      }),
    )
  }

  const timestampLabel = $derived(formatDuration(scene.timeSec))
  const hasPalette = $derived(!!scene.palette && scene.palette.length > 0)
  const isTopMatch = $derived(match?.rank === 'top')
  const showSourceMediaName = $derived(mediaName === 'source')
  const showMatchSignals = $derived(match !== undefined)
</script>

<button
  type="button"
  draggable="true"
  ondragstart={handleDragStart}
  onclick={handleOpen}
  class={cn(
    'group flex w-full flex-col overflow-hidden rounded-lg border border-transparent',
    'text-left transition-colors',
    'hover:border-border/60 hover:bg-foreground/5 focus-visible:outline-none',
    'focus-visible:border-primary/60 focus-visible:bg-primary/10',
    isTopMatch && 'border-primary/40 bg-primary/5',
  )}
  title={t('sceneBrowser.scene.previewAndDragHint')}
>
  <div
    class="relative aspect-video max-h-32 w-full shrink-0 overflow-hidden rounded-md bg-secondary"
  >
    {#if thumbUrl.current}
      <img
        src={thumbUrl.current}
        alt=""
        class="h-full w-full object-cover"
        loading="lazy"
        draggable="false"
      />
    {:else}
      <div class="flex h-full w-full items-center justify-center text-muted-foreground">
        <Film class="h-5 w-5" />
      </div>
    {/if}
    <div
      class="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100"
    >
      <Search class="h-5 w-5 text-white/90" />
    </div>
    <span
      class="absolute bottom-1 right-1 rounded bg-black/70 px-1 font-mono text-[10px] leading-none text-white/90"
    >
      {timestampLabel}
    </span>
    {#if hasPalette}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <span
        role="button"
        tabindex={-1}
        aria-label={t('sceneBrowser.palette.findSimilar')}
        title={t('sceneBrowser.palette.findSimilar')}
        class="absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-md bg-black/60 text-white/90 opacity-0 transition-opacity hover:bg-black/80 group-hover:opacity-100"
        onclick={handleFindSimilarPalette}
      >
        <Palette class="h-3 w-3" />
      </span>
    {/if}
  </div>
  <div class="min-w-0 space-y-1 px-1.5 py-1.5">
    {#if showSourceMediaName}
      <div class="truncate text-[10px] text-muted-foreground" title={scene.mediaFileName}>
        {scene.mediaFileName}
      </div>
    {/if}
    <div class="whitespace-normal break-words text-[11px] leading-snug text-foreground">
      {scene.text}
    </div>
    {#if showMatchSignals}
      <SceneMatchStrength signals={scene.signals} score={scene.score} />
    {/if}
    {#if showMatchSignals || (colorMode.current && hasPalette)}
      <div class="flex flex-wrap items-center gap-1">
        {#if showMatchSignals}
          <SceneMatchBadges
            signals={scene.signals}
            score={scene.score}
            rank={isTopMatch ? 'top' : 'default'}
          />
        {/if}
        {#if hasPalette && (colorMode.current || showMatchSignals)}
          <ScenePaletteSwatches
            palette={scene.palette}
            highlight={showMatchSignals ? (scene.signals.colorMatch ?? null) : null}
            onSwatchClick={handleSwatchClick}
          />
        {/if}
      </div>
    {/if}
  </div>
</button>
