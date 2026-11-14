<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import type { LottieItem, TimelineItem } from '@/types/timeline'

  /** Sentinel Select value for "no theme" (Radix Select forbids an empty value). */
  const NO_THEME = '__none__'

  const MIN_SPEED = 0.1
  const MAX_SPEED = 10

  function isLottieItem(item: TimelineItem): item is LottieItem {
    return item.type === 'lottie'
  }
</script>

<script lang="ts">
  import ChevronDown from 'lucide-svelte/icons/chevron-down'
  import ChevronRight from 'lucide-svelte/icons/chevron-right'
  import FileJson from 'lucide-svelte/icons/file-json'
  import Palette from 'lucide-svelte/icons/palette'
  import RotateCcw from 'lucide-svelte/icons/rotate-ccw'
  import Sliders from 'lucide-svelte/icons/sliders'
  import Type from 'lucide-svelte/icons/type'
  import { t } from '$lib/i18n.svelte'
  import { Button } from '@/components/ui/button'
  import { Switch } from '@/components/ui/switch'
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/components/ui/select'
  import { updateItem } from '@/features/editor/deps/timeline-store'
  import { extractLottieTextLayers, type LottieTextLayer } from '@/infrastructure/lottie/lottie-text'
  import {
    extractLottieColorLayers,
    type LottieColorLayer,
  } from '@/infrastructure/lottie/lottie-color'
  import {
    extractLottieValueSlots,
    type LottieValueSlot,
  } from '@/infrastructure/lottie/lottie-slots'
  import {
    fetchLottieAnimation,
    fetchLottieManifest,
    parseLottieMetadata,
    readLottieMarkers,
    type LottieAnimationEntry,
    type LottieMarker,
  } from '@/infrastructure/lottie/lottie-metadata'
  import { resolveMediaUrl } from '@/features/editor/deps/media-library'
  import { useGizmoStore } from '@/features/editor/deps/preview'
  import { PropertySection, PropertyRow, NumberInput, ColorPicker } from '../components'
  import { getMixedValue } from '../utils'
  import TextLayerInput from './lottie-text-layer-input.svelte'

  /**
   * Lottie playback + template controls: speed, reverse, loop style, an in/out
   * segment, and per-layer text overrides for template animations. All fields are
   * read at render time by `mapTimelineFrameToLottieFrame` / the text patcher, so
   * edits apply identically in preview and export. Segment and text editing are
   * single-selection only (they depend on a specific animation's frames/layers).
   */
  let { items }: { items: TimelineItem[] } = $props()

  // Live edit preview: drags/keystrokes update the canvas through this channel
  // (read by the render engine's getLiveItemSnapshot) without a timeline-store
  // commit, so a single color/slot/text edit is one undo entry, not dozens.
  const setLottiePreview = useGizmoStore.getState().setLottiePreviewNew

  const lottieItems = $derived(items.filter(isLottieItem))
  const ids = $derived(lottieItems.map((i) => i.id))
  const single = $derived(lottieItems.length === 1 ? lottieItems[0]! : null)

  const patchAll = (updates: Partial<LottieItem>) => {
    for (const id of ids) updateItem(id, updates)
  }

  const speed = $derived(getMixedValue(lottieItems, (i) => i.speed, 1))
  const reversed = $derived(getMixedValue(lottieItems, (i) => i.reversed ?? false, false))
  const loop = $derived(getMixedValue(lottieItems, (i) => i.loop ?? true, true))
  const pingpong = $derived(
    getMixedValue(lottieItems, (i) => (i.loopMode ?? 'loop') === 'pingpong', false),
  )
  const loopOn = $derived(loop === true)

  // Discover the selected clip's editable text/color layers, named markers, and
  // (for `.lottie` archives) its bundled animations + themes.
  let textLayers = $state.raw<LottieTextLayer[]>([])
  let colorLayers = $state.raw<LottieColorLayer[]>([])
  let valueSlots = $state.raw<LottieValueSlot[]>([])
  let markers = $state.raw<LottieMarker[]>([])
  let animations = $state.raw<LottieAnimationEntry[]>([])
  let themes = $state.raw<string[]>([])
  const singleId = $derived(single?.id)
  const singleSrc = $derived(single?.src)
  const singleMediaId = $derived(single?.mediaId)
  const singleAnimationId = $derived(single?.animationId)

  // `item.src` can be a dead blob URL after a page reload; resolve a fresh URL
  // by mediaId first (fall back to the item's own src, e.g. items with no
  // mediaId). Shared by discovery and the animation-switch handler.
  const resolveSingleUrl = async (src: string | undefined, mediaId: string | undefined) => {
    let url = src ?? ''
    if (mediaId) {
      const resolved = await resolveMediaUrl(mediaId).catch(() => '')
      if (resolved) url = resolved
    }
    return url
  }

  $effect(() => {
    void singleId
    const src = singleSrc
    const mediaId = singleMediaId
    const animationId = singleAnimationId
    const clear = () => {
      textLayers = []
      colorLayers = []
      valueSlots = []
      markers = []
      animations = []
      themes = []
    }
    if (!src && !mediaId) {
      clear()
      return
    }
    let cancelled = false
    void (async () => {
      const url = await resolveSingleUrl(src, mediaId)
      if (cancelled) return
      if (!url) {
        clear()
        return
      }
      // Archive-aware: layers/markers come from the selected animation; the
      // manifest lists all bundled animations/themes (null for raw `.json`).
      const [animation, manifest] = await Promise.all([
        fetchLottieAnimation(url, false, animationId),
        fetchLottieManifest(url),
      ])
      if (cancelled) return
      textLayers = animation ? extractLottieTextLayers(animation) : []
      colorLayers = animation ? extractLottieColorLayers(animation) : []
      valueSlots = animation ? extractLottieValueSlots(animation) : []
      markers = animation ? readLottieMarkers(animation) : []
      animations = manifest?.animations ?? []
      themes = manifest?.themes ?? []
    })()
    return () => {
      cancelled = true
    }
  })

  const handleSpeedChange = (value: number) =>
    patchAll({ speed: Math.max(MIN_SPEED, Math.min(MAX_SPEED, value)) })

  const handleSegmentStart = (value: number) => {
    if (!single) return
    const maxFrame = single.totalFrames - 1
    const end = single.segmentEnd ?? maxFrame
    updateItem(single.id, { segmentStart: Math.max(0, Math.min(Math.round(value), end)) })
  }

  const handleSegmentEnd = (value: number) => {
    if (!single) return
    const maxFrame = single.totalFrames - 1
    const start = single.segmentStart ?? 0
    updateItem(single.id, { segmentEnd: Math.max(start, Math.min(Math.round(value), maxFrame)) })
  }

  // The animation that plays by default is the manifest's first; a stored
  // `animationId` overrides it.
  const effectiveAnimationId = $derived(single?.animationId ?? animations[0]?.id)

  const handleAnimationChange = (animationId: string) => {
    const target = single
    if (!target || animationId === effectiveAnimationId) return
    void (async () => {
      const url = await resolveSingleUrl(target.src, target.mediaId)
      const animation = url ? await fetchLottieAnimation(url, false, animationId) : null
      const meta = animation ? parseLottieMetadata(animation) : null
      updateItem(target.id, {
        animationId,
        // A different animation has its own frames/slots — drop frame-indexed
        // edits and re-derive timing/size from the chosen animation.
        segmentStart: undefined,
        segmentEnd: undefined,
        textOverrides: undefined,
        colorOverrides: undefined,
        ...(meta
          ? {
              frameRate: meta.frameRate,
              totalFrames: meta.totalFrames,
              sourceWidth: meta.width,
              sourceHeight: meta.height,
            }
          : {}),
      })
    })()
  }

  const handleThemeChange = (value: string) => {
    if (single) updateItem(single.id, { themeId: value === NO_THEME ? undefined : value })
  }

  // Apply a named marker as the active segment. A zero-duration marker (a cue
  // point) plays from the marker to the end.
  const handleMarkerSelect = (name: string) => {
    if (!single) return
    const marker = markers.find((m) => m.name === name)
    if (!marker) return
    const maxFrame = single.totalFrames - 1
    const start = Math.max(0, Math.min(Math.round(marker.start), maxFrame))
    const end =
      marker.duration > 0
        ? Math.max(start, Math.min(Math.round(marker.start + marker.duration), maxFrame))
        : maxFrame
    updateItem(single.id, { segmentStart: start, segmentEnd: end })
  }

  // Clear this clip's live preview when the clip changes or the panel unmounts,
  // so a preview left mid-drag never lingers on the canvas.
  $effect(() => {
    const id = singleId
    if (!id) return
    return () => setLottiePreview(id, null)
  })

  const nextTextMap = (key: string, value: string): Record<string, string> | undefined => {
    const next = { ...(single?.textOverrides ?? {}) }
    const layer = textLayers.find((l) => l.key === key)
    // Drop the override when the text is reverted to the animation's original.
    if (layer && value === layer.text) delete next[key]
    else next[key] = value
    return Object.keys(next).length > 0 ? next : undefined
  }

  const previewText = (key: string, value: string) => {
    if (single) setLottiePreview(single.id, { textOverrides: nextTextMap(key, value) })
  }

  const handleTextCommit = (key: string, value: string) => {
    if (!single) return
    updateItem(single.id, { textOverrides: nextTextMap(key, value) })
    setLottiePreview(single.id, null)
  }

  // Group the extracted colors by their original value so a color shared across
  // multiple shapes is a single editable swatch (a palette): recoloring it
  // updates every shape that used it. Overrides are still stored per instance.
  // A group is "named" when any member carries an author name (a slot or a named
  // shape) — those are the template's intended customization points and are
  // shown first; the anonymous rest (Fill/N shapes) tuck under a disclosure.
  const colorGroups = $derived.by(() => {
    const byOriginal = new Map<
      string,
      { keys: string[]; label: string; namedLabel: string | undefined }
    >()
    for (const layer of colorLayers) {
      const group = byOriginal.get(layer.color)
      if (group) {
        group.keys.push(layer.key)
        if (!group.namedLabel && layer.named) group.namedLabel = layer.label
      } else {
        byOriginal.set(layer.color, {
          keys: [layer.key],
          label: layer.label,
          namedLabel: layer.named ? layer.label : undefined,
        })
      }
    }
    return Array.from(byOriginal, ([original, { keys, label, namedLabel }]) => ({
      original,
      keys,
      named: namedLabel !== undefined,
      // Prefer an author name; fall back to a count ("N shapes") or the fill label.
      label:
        namedLabel ??
        (keys.length > 1 ? t('editor.lottieSection.colorGroup', { count: keys.length }) : label),
    }))
  })

  const namedColorGroups = $derived(colorGroups.filter((g) => g.named))
  const otherColorGroups = $derived(colorGroups.filter((g) => !g.named))
  let showOtherColors = $state(false)

  const nextColorMap = (
    keys: string[],
    original: string,
    value: string,
  ): Record<string, string> | undefined => {
    const next = { ...(single?.colorOverrides ?? {}) }
    // Reverting to the original color drops the override for every shape.
    const revert = value.toLowerCase() === original.toLowerCase()
    for (const key of keys) {
      if (revert) delete next[key]
      else next[key] = value
    }
    return Object.keys(next).length > 0 ? next : undefined
  }

  const previewColorGroup = (keys: string[], original: string, value: string) => {
    if (single) setLottiePreview(single.id, { colorOverrides: nextColorMap(keys, original, value) })
  }

  const commitColorGroup = (keys: string[], original: string, value: string) => {
    if (!single) return
    updateItem(single.id, { colorOverrides: nextColorMap(keys, original, value) })
    setLottiePreview(single.id, null)
  }

  const resetAllColors = () => {
    if (single) updateItem(single.id, { colorOverrides: undefined })
  }

  const hasColorOverrides = $derived(
    !!single?.colorOverrides && Object.keys(single.colorOverrides).length > 0,
  )

  // Value slots (scalar/vector) applied natively. Reverting to the slot's
  // authored default drops the override.
  const nextSlotMap = (
    id: string,
    next: number | [number, number],
    original: number | [number, number],
  ): Record<string, number | [number, number]> | undefined => {
    const revert = Array.isArray(next)
      ? Array.isArray(original) && next[0] === original[0] && next[1] === original[1]
      : next === original
    const overrides = { ...(single?.slotOverrides ?? {}) }
    if (revert) delete overrides[id]
    else overrides[id] = next
    return Object.keys(overrides).length > 0 ? overrides : undefined
  }

  const previewSlot = (
    id: string,
    next: number | [number, number],
    original: number | [number, number],
  ) => {
    if (single) setLottiePreview(single.id, { slotOverrides: nextSlotMap(id, next, original) })
  }

  const commitSlot = (
    id: string,
    next: number | [number, number],
    original: number | [number, number],
  ) => {
    if (!single) return
    updateItem(single.id, { slotOverrides: nextSlotMap(id, next, original) })
    setLottiePreview(single.id, null)
  }

  const resetAllSlots = () => {
    if (single) updateItem(single.id, { slotOverrides: undefined })
  }

  const hasSlotOverrides = $derived(
    !!single?.slotOverrides && Object.keys(single.slotOverrides).length > 0,
  )
</script>

{#snippet colorGroup(group: { original: string; keys: string[]; label: string })}
  <ColorPicker
    label={group.label}
    color={single?.colorOverrides?.[group.keys[0]!] ?? group.original}
    defaultColor={group.original}
    onLiveChange={(c) => previewColorGroup(group.keys, group.original, c)}
    onChange={(c) => commitColorGroup(group.keys, group.original, c)}
    onReset={() => commitColorGroup(group.keys, group.original, group.original)}
  />
{/snippet}

{#if lottieItems.length > 0}
  <PropertySection title={t('editor.lottieSection.title')} icon={FileJson} defaultOpen={true}>
    <PropertyRow label={t('editor.lottieSection.speed')}>
      <div class="flex items-center gap-1 w-full">
        <NumberInput
          value={speed}
          onChange={handleSpeedChange}
          min={MIN_SPEED}
          max={MAX_SPEED}
          step={0.1}
          unit="x"
          class="flex-1 min-w-0"
        />
        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7 flex-shrink-0"
          onclick={() => patchAll({ speed: 1 })}
          title={t('editor.lottieSection.resetSpeed')}
        >
          <RotateCcw class="w-3.5 h-3.5" />
        </Button>
      </div>
    </PropertyRow>

    <PropertyRow label={t('editor.lottieSection.reverse')}>
      <Switch checked={reversed === true} onCheckedChange={(c) => patchAll({ reversed: c })} />
    </PropertyRow>

    <PropertyRow label={t('editor.lottieSection.loop')}>
      <Switch checked={loopOn} onCheckedChange={(c) => patchAll({ loop: c })} />
    </PropertyRow>

    {#if loopOn}
      <PropertyRow label={t('editor.lottieSection.pingpong')}>
        <Switch
          checked={pingpong === true}
          onCheckedChange={(c) => patchAll({ loopMode: c ? 'pingpong' : 'loop' })}
        />
      </PropertyRow>
    {/if}

    {#if single && animations.length > 1}
      <PropertyRow label={t('editor.lottieSection.animation')}>
        <Select value={effectiveAnimationId} onValueChange={handleAnimationChange}>
          <SelectTrigger class="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {#each animations as a, i (a.id)}
              <SelectItem value={a.id} class="text-xs">
                {a.id || t('editor.lottieSection.animationN', { index: i + 1 })}
              </SelectItem>
            {/each}
          </SelectContent>
        </Select>
      </PropertyRow>
    {/if}

    {#if single && themes.length > 0}
      <PropertyRow label={t('editor.lottieSection.theme')}>
        <Select value={single.themeId ?? NO_THEME} onValueChange={handleThemeChange}>
          <SelectTrigger class="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_THEME} class="text-xs">
              {t('editor.lottieSection.themeNone')}
            </SelectItem>
            {#each themes as id (id)}
              <SelectItem value={id} class="text-xs">
                {id}
              </SelectItem>
            {/each}
          </SelectContent>
        </Select>
      </PropertyRow>
    {/if}

    {#if single && single.totalFrames > 1}
      {#if markers.length > 0}
        <PropertyRow label={t('editor.lottieSection.marker')}>
          <Select onValueChange={handleMarkerSelect}>
            <SelectTrigger class="h-7 text-xs">
              <SelectValue placeholder={t('editor.lottieSection.markerPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {#each markers as m (m.name)}
                <SelectItem value={m.name} class="text-xs">
                  {m.name}
                </SelectItem>
              {/each}
            </SelectContent>
          </Select>
        </PropertyRow>
      {/if}
      <PropertyRow label={t('editor.lottieSection.trimIn')}>
        <NumberInput
          value={single.segmentStart ?? 0}
          onChange={handleSegmentStart}
          min={0}
          max={single.totalFrames - 1}
          step={1}
          class="w-full"
        />
      </PropertyRow>
      <PropertyRow label={t('editor.lottieSection.trimOut')}>
        <NumberInput
          value={single.segmentEnd ?? single.totalFrames - 1}
          onChange={handleSegmentEnd}
          min={0}
          max={single.totalFrames - 1}
          step={1}
          class="w-full"
        />
      </PropertyRow>
    {/if}

    {#if single && textLayers.length > 0}
      <div class="space-y-1.5 pt-1">
        <div class="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <Type class="w-3 h-3" />
          {t('editor.lottieSection.text')}
        </div>
        {#each textLayers as layer (layer.key)}
          <TextLayerInput
            {layer}
            override={single.textOverrides?.[layer.key]}
            onLive={previewText}
            onCommit={handleTextCommit}
          />
        {/each}
      </div>
    {/if}

    {#if single && colorGroups.length > 0}
      <div class="space-y-1.5 pt-1">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <Palette class="w-3 h-3" />
            {t('editor.lottieSection.colors')}
          </div>
          {#if hasColorOverrides}
            <Button
              variant="ghost"
              size="sm"
              class="h-6 px-1.5 text-[11px] text-muted-foreground"
              onclick={resetAllColors}
            >
              {t('editor.lottieSection.resetColors')}
            </Button>
          {/if}
        </div>
        <!-- Author-named colors first (or everything, if nothing is named). -->
        {#each namedColorGroups.length > 0 ? namedColorGroups : otherColorGroups as group (group.original)}
          {@render colorGroup(group)}
        {/each}

        <!-- The anonymous rest (Fill / N shapes) tuck under a disclosure. -->
        {#if namedColorGroups.length > 0 && otherColorGroups.length > 0}
          <Button
            variant="ghost"
            size="sm"
            class="h-6 w-full justify-start gap-1 px-1 text-[11px] text-muted-foreground"
            onclick={() => (showOtherColors = !showOtherColors)}
          >
            {#if showOtherColors}
              <ChevronDown class="w-3 h-3" />
            {:else}
              <ChevronRight class="w-3 h-3" />
            {/if}
            {t('editor.lottieSection.otherColors', { count: otherColorGroups.length })}
          </Button>
          {#if showOtherColors}
            {#each otherColorGroups as group (group.original)}
              {@render colorGroup(group)}
            {/each}
          {/if}
        {/if}
      </div>
    {/if}

    {#if single && valueSlots.length > 0}
      <div class="space-y-1.5 pt-1">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <Sliders class="w-3 h-3" />
            {t('editor.lottieSection.properties')}
          </div>
          {#if hasSlotOverrides}
            <Button
              variant="ghost"
              size="sm"
              class="h-6 px-1.5 text-[11px] text-muted-foreground"
              onclick={resetAllSlots}
            >
              {t('editor.lottieSection.resetProperties')}
            </Button>
          {/if}
        </div>
        {#each valueSlots as slot (slot.id)}
          {@const current = single.slotOverrides?.[slot.id]}
          {#if slot.type === 'scalar'}
            {@const value = typeof current === 'number' ? current : slot.value}
            <PropertyRow label={slot.label}>
              <NumberInput
                {value}
                onChange={(v) => commitSlot(slot.id, v, slot.value)}
                onLiveChange={(v) => previewSlot(slot.id, v, slot.value)}
                step={0.1}
                class="w-full"
              />
            </PropertyRow>
          {:else}
            {@const vec = Array.isArray(current) ? current : slot.value}
            <PropertyRow label={slot.label}>
              <div class="flex items-center gap-1 w-full">
                <NumberInput
                  value={vec[0]}
                  onChange={(v) => commitSlot(slot.id, [v, vec[1]], slot.value)}
                  onLiveChange={(v) => previewSlot(slot.id, [v, vec[1]], slot.value)}
                  class="flex-1 min-w-0"
                />
                <NumberInput
                  value={vec[1]}
                  onChange={(v) => commitSlot(slot.id, [vec[0], v], slot.value)}
                  onLiveChange={(v) => previewSlot(slot.id, [vec[0], v], slot.value)}
                  class="flex-1 min-w-0"
                />
              </div>
            </PropertyRow>
          {/if}
        {/each}
      </div>
    {/if}
  </PropertySection>
{/if}
