<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import Clock from '@lucide/svelte/icons/clock'
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
  import HighlightedText from '../highlighted-text.svelte'
  import { SceneMatchBadges, SceneMatchStrength } from '../scene-match-badges'
  import ScenePaletteSwatches from '../scene-palette-swatches.svelte'
  import type { ScoredScene } from '@/features/scene-browser/utils/rank'
  import { parseCaptionIndex, type SceneMatchState } from './types'

  interface SceneRowBaseProps {
    scene: ScoredScene
    mediaName: 'source' | 'hidden'
    match?: SceneMatchState
  }

  let { scene, mediaName, match }: SceneRowBaseProps = $props()

  function formatSceneTimestamp(sec: number): string {
    return formatDuration(sec)
  }

  const thumbUrl = useCaptionThumbnail(
    () => scene.thumbRelPath,
    () => {
      const captionIndex = parseCaptionIndex(scene.id)
      return scene.thumbRelPath || captionIndex === null
        ? undefined
        : { mediaId: scene.mediaId, captionIndex, timeSec: scene.timeSec }
    },
  )

  function handleOpen() {
    seekToScene(scene.mediaId, scene.timeSec)
  }

  const colorMode = select(useSceneBrowserStore, (s) => s.colorMode)

  function handleSwatchClick(swatch: { l: number; a: number; b: number }) {
    const { setQuery, setReference } = useSceneBrowserStore.getState()
    if (colorMode.current) {
      setReference({
        sceneId: `swatch-${Math.round(swatch.l)}-${Math.round(swatch.a)}-${Math.round(swatch.b)}`,
        label: 'Picked swatch',
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
      label: `${scene.mediaFileName} · ${formatSceneTimestamp(scene.timeSec)}`,
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

  const timestampLabel = $derived(formatSceneTimestamp(scene.timeSec))
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
    'group flex w-full items-start gap-3 rounded-lg border border-transparent px-2 py-2',
    'text-left transition-colors',
    'hover:border-border/60 hover:bg-foreground/5 focus-visible:outline-none',
    'focus-visible:border-primary/60 focus-visible:bg-primary/10',
    // A subtle backdrop on the top match so it stands out without
    // stealing focus from lower-scoring but still-relevant rows.
    isTopMatch && 'bg-primary/5',
  )}
  title={t('sceneBrowser.scene.previewAndDragHint')}
>
  <div class="relative h-[54px] w-24 shrink-0 overflow-hidden rounded-md bg-secondary">
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
        <Film class="h-4 w-4" />
      </div>
    {/if}
    <div
      class="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100"
    >
      <Search class="h-4 w-4 text-white/90" />
    </div>
    <span
      class="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 font-mono text-[10px] leading-none text-white/90"
    >
      {timestampLabel}
    </span>
  </div>
  <div class="min-w-0 flex-1 space-y-0.5">
    {#if showSourceMediaName}
      <div class="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Clock class="h-2.5 w-2.5 shrink-0" />
        <span class="truncate">{scene.mediaFileName}</span>
      </div>
    {/if}
    <HighlightedText
      text={scene.text}
      spans={scene.matchSpans}
      class="line-clamp-3 text-[12px] leading-snug text-foreground"
    />
    {#if showMatchSignals}
      <div class="space-y-1 pt-0.5">
        <SceneMatchStrength signals={scene.signals} score={scene.score} />
        <div class="flex flex-wrap items-center gap-2">
          <SceneMatchBadges
            signals={scene.signals}
            score={scene.score}
            rank={isTopMatch ? 'top' : 'default'}
          />
          <ScenePaletteSwatches
            palette={scene.palette}
            highlight={scene.signals.colorMatch ?? null}
            onSwatchClick={handleSwatchClick}
          />
          {#if scene.palette && scene.palette.length > 0}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <span
              role="button"
              tabindex={-1}
              aria-label={t('sceneBrowser.palette.findSimilar')}
              title={t('sceneBrowser.palette.findSimilar')}
              class="flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-foreground/10 hover:text-foreground group-hover:opacity-100"
              onclick={handleFindSimilarPalette}
            >
              <Palette class="h-3 w-3" />
            </span>
          {/if}
        </div>
      </div>
    {/if}
    {#if !showMatchSignals && colorMode.current}
      <div class="flex flex-wrap items-center gap-2 pt-0.5">
        {#if scene.palette && scene.palette.length > 0}
          <ScenePaletteSwatches
            palette={scene.palette}
            highlight={null}
            onSwatchClick={handleSwatchClick}
          />
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <span
            role="button"
            tabindex={-1}
            aria-label={t('sceneBrowser.palette.findSimilar')}
            title={t('sceneBrowser.palette.findSimilar')}
            class="flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground transition-opacity hover:bg-foreground/10 hover:text-foreground"
            onclick={handleFindSimilarPalette}
          >
            <Palette class="h-3 w-3" />
          </span>
        {:else}
          <span class="text-[10px] italic text-muted-foreground/60">No palette indexed</span>
        {/if}
      </div>
    {/if}
  </div>
</button>
