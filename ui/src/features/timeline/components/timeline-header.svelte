<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import { select } from '$lib/store.svelte'
  import { Button } from '@/components/ui/button'
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from '@/components/ui/dropdown-menu'
  import Film from '@lucide/svelte/icons/film'
  import Magnet from '@lucide/svelte/icons/magnet'
  import Scissors from '@lucide/svelte/icons/scissors'
  import Gauge from '@lucide/svelte/icons/gauge'
  import ArrowRightLeft from '@lucide/svelte/icons/arrow-right-left'
  import BetweenHorizontalEnd from '@lucide/svelte/icons/between-horizontal-end'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import X from '@lucide/svelte/icons/x'
  import MousePointer2 from '@lucide/svelte/icons/mouse-pointer-2'
  import Undo2 from '@lucide/svelte/icons/undo-2'
  import Redo2 from '@lucide/svelte/icons/redo-2'
  import Flag from '@lucide/svelte/icons/flag'
  import FlagOff from '@lucide/svelte/icons/flag-off'
  import Link2 from '@lucide/svelte/icons/link-2'
  import Volume2 from '@lucide/svelte/icons/volume-2'
  import Diamond from '@lucide/svelte/icons/diamond'
  import { Separator } from '@/components/ui/separator'
  import Feature from '@/components/feature.svelte'
  import { formatHotkeyBinding } from '@/config/hotkeys'
  import { useMarkersStore } from '@/features/timeline/stores/markers-store'
  import { useTimelineSettingsStore } from '@/features/timeline/stores/timeline-settings-store'
  import {
    addMarker,
    clearAllMarkers,
    clearInOutPoints,
    removeMarker,
    toggleAudioSkimming,
    toggleSnap,
  } from '@/features/timeline/stores/timeline-actions'
  import { useInOutPoints } from '../hooks/use-in-out-points.svelte'
  import { useTimelineCommandStore } from '@/features/timeline/stores/timeline-command-store'
  import { usePlaybackStore } from '@/shared/state/playback'
  import { useEditorStore } from '@/shared/state/editor'
  import { useSelectionStore } from '@/shared/state/selection'
  import type { SelectionState } from '@/shared/state/selection'
  import { SLIP_SLIDE_TOOLS_ENABLED } from '@/features/timeline/constants'
  import { EDITOR_LAYOUT_CSS_VALUES } from '@/config/editor-layout'
  import { useResolvedHotkeys } from '@/features/timeline/deps/settings-ui'
  import { MicRecordControl } from './mic-record-control'
  import TimelineZoomControls from './timeline-header-zoom-controls.svelte'
  import type { TimelineHeaderProps } from './timeline-header-types'

  /**
   * Timeline Toolbar Component
   *
   * Unified toolbar for timeline controls:
   * - Select/Razor tools
   * - Undo/Redo
   * - In/Out points, Snap toggle
   * - Zoom controls
   */
  let { onZoomChange, onZoomIn, onZoomOut, onZoomToFit }: TimelineHeaderProps = $props()

  const hotkeys = useResolvedHotkeys()
  const snapEnabled = select(useTimelineSettingsStore, (s) => s.snapEnabled)
  const audioSkimmingEnabled = select(useTimelineSettingsStore, (s) => s.audioSkimmingEnabled)
  const inOutPoints = useInOutPoints()
  // Only subscribe to marker count for disabled state - avoids re-render on marker changes
  const hasMarkers = select(useMarkersStore, (s) => s.markers.length > 0)
  // NOTE: Don't subscribe to currentFrame - only needed in click handlers
  // Read from store directly when needed to avoid re-renders every frame
  const activeTool = select(useSelectionStore, (s) => s.activeTool)
  const selectedMarkerId = select(useSelectionStore, (s) => s.selectedMarkerId)
  const inlineKeyframesOpen = select(useSelectionStore, (s) => s.editKeyframePanelOpen)
  const linkedSelectionEnabled = select(useEditorStore, (s) => s.linkedSelectionEnabled)
  const canUndo = select(useTimelineCommandStore, (s) => s.canUndo)
  const canRedo = select(useTimelineCommandStore, (s) => s.canRedo)
  const undoLabel = select(useTimelineCommandStore, (s) => s.getUndoLabel())
  const redoLabel = select(useTimelineCommandStore, (s) => s.getRedoLabel())
  const SlipSlideFlyoutIcon = $derived(
    activeTool.current === 'slide' ? BetweenHorizontalEnd : ArrowRightLeft,
  )

  const btnStyle = `width: ${EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize}; height: ${EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize}`
  const activeClass = 'bg-primary text-primary-foreground hover:bg-primary/90'

  const setActiveTool = (tool: SelectionState['activeTool']) =>
    useSelectionStore.getState().setActiveTool(tool)

  const handleUndo = () => {
    useTimelineCommandStore.getState().undo()
  }

  const handleRedo = () => {
    useTimelineCommandStore.getState().redo()
  }

  const keyframesToggleLabel = $derived(
    t(
      inlineKeyframesOpen.current
        ? 'timeline.keyframeEditor.editLane.hide'
        : 'timeline.keyframeEditor.editLane.show',
      {
        defaultValue: inlineKeyframesOpen.current ? 'Hide keyframe panel' : 'Show keyframe panel',
      },
    ),
  )
</script>

{#snippet trimEditIcon(className: string)}
  <svg viewBox="0 0 24 24" fill="none" class={className} aria-hidden="true">
    <rect x="10.6" y="4" width="2.8" height="16" rx="0.75" fill="currentColor" opacity="0.72" />
    <path d="m9 7-6 5 6 5z" fill="currentColor" stroke="none" />
    <path d="m15 7 6 5-6 5z" fill="currentColor" stroke="none" />
  </svg>
{/snippet}

<div
  class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-3"
  style:height={EDITOR_LAYOUT_CSS_VALUES.timelineHeaderHeight}
  role="toolbar"
  aria-label={t('timeline.header.controls')}
>
  <!-- Left: Title -->
  <div class="flex min-w-0 items-center gap-2.5">
    <h2
      class="text-xs font-semibold tracking-wide uppercase text-muted-foreground flex items-center gap-2"
    >
      <Film class="w-3 h-3" />
      {t('timeline.header.title')}
    </h2>
  </div>

  <!-- Middle: Timeline Controls -->
  <div class="min-w-0 overflow-x-auto overflow-y-hidden">
    <div class="flex w-max min-w-full items-center justify-center gap-2.5">
      <!-- Timeline Tools -->
      <div class="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          style={btnStyle}
          class={activeTool.current === 'select' ? activeClass : ''}
          onclick={() => setActiveTool('select')}
          aria-label={t('timeline.header.selectTool')}
          data-tooltip={t('timeline.header.selectToolTooltip')}
        >
          <MousePointer2 class="w-3.5 h-3.5" />
        </Button>

        <Feature id="timeline.trim-tool">
        <Button
          variant="ghost"
          size="icon"
          style={btnStyle}
          class={activeTool.current === 'trim-edit' ? activeClass : ''}
          onclick={() => setActiveTool(activeTool.current === 'trim-edit' ? 'select' : 'trim-edit')}
          aria-label={t('timeline.header.trimEditTool')}
          data-tooltip={t('timeline.header.trimEditToolTooltip')}
        >
          {@render trimEditIcon('w-3.5 h-3.5')}
        </Button>
        </Feature>

        <Feature id="timeline.razor">
        <Button
          variant="ghost"
          size="icon"
          style={btnStyle}
          class={activeTool.current === 'razor' ? activeClass : ''}
          onclick={() => setActiveTool(activeTool.current === 'razor' ? 'select' : 'razor')}
          aria-label={t('timeline.header.razorTool')}
          data-tooltip={t('timeline.header.razorToolTooltip')}
        >
          <Scissors class="w-3.5 h-3.5 -rotate-90" />
        </Button>
        </Feature>

        <Feature id="timeline.rate-stretch">
        <Button
          variant="ghost"
          size="icon"
          style={btnStyle}
          class={activeTool.current === 'rate-stretch' ? activeClass : ''}
          onclick={() =>
            setActiveTool(activeTool.current === 'rate-stretch' ? 'select' : 'rate-stretch')}
          aria-label={t('timeline.header.rateStretchTool')}
          data-tooltip={t('timeline.header.rateStretchToolTooltip')}
        >
          <Gauge class="w-3.5 h-3.5" />
        </Button>
        </Feature>

        <Feature id="timeline.slip-slide">
        {#if SLIP_SLIDE_TOOLS_ENABLED}
          <DropdownMenu>
            <DropdownMenuTrigger>
              {#snippet child({ props })}
                <Button
                  {...props}
                  variant="ghost"
                  style="height: {EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize}"
                  class="gap-1 px-2 {activeTool.current === 'slip' || activeTool.current === 'slide'
                    ? activeClass
                    : ''}"
                  aria-label={t('timeline.header.slipSlideTools')}
                  data-tooltip={t('timeline.header.slipSlideToolsTooltip')}
                >
                  <span class="flex items-center gap-1">
                    <span class="inline-flex items-center justify-center">
                      <SlipSlideFlyoutIcon class="w-3.5 h-3.5" />
                    </span>
                    <ChevronDown class="w-3 h-3 opacity-70" />
                  </span>
                </Button>
              {/snippet}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                onclick={() => setActiveTool(activeTool.current === 'slip' ? 'select' : 'slip')}
              >
                <ArrowRightLeft class="w-3.5 h-3.5" />
                <span class="flex-1">{t('timeline.header.slipTool')}</span>
                <span class="text-xs text-muted-foreground"
                  >{formatHotkeyBinding(hotkeys.current.SLIP_TOOL)}</span
                >
              </DropdownMenuItem>
              <DropdownMenuItem
                onclick={() => setActiveTool(activeTool.current === 'slide' ? 'select' : 'slide')}
              >
                <BetweenHorizontalEnd class="w-3.5 h-3.5" />
                <span class="flex-1">{t('timeline.header.slideTool')}</span>
                <span class="text-xs text-muted-foreground"
                  >{formatHotkeyBinding(hotkeys.current.SLIDE_TOOL)}</span
                >
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        {/if}
        </Feature>
      </div>

      <Separator orientation="vertical" class="h-5 mx-1.5" />

      <!-- Undo/Redo -->
      <Feature id="timeline.history">
      <div class="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          style={btnStyle}
          onclick={handleUndo}
          disabled={!canUndo.current}
          aria-label={undoLabel.current
            ? t('timeline.header.undoWithLabel', { label: undoLabel.current })
            : t('timeline.header.undo')}
          data-tooltip={undoLabel.current
            ? t('timeline.header.undoWithLabelTooltip', { label: undoLabel.current })
            : t('timeline.header.undoTooltip')}
        >
          <Undo2 class="w-3.5 h-3.5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          style={btnStyle}
          onclick={handleRedo}
          disabled={!canRedo.current}
          aria-label={redoLabel.current
            ? t('timeline.header.redoWithLabel', { label: redoLabel.current })
            : t('timeline.header.redo')}
          data-tooltip={redoLabel.current
            ? t('timeline.header.redoWithLabelTooltip', { label: redoLabel.current })
            : t('timeline.header.redoTooltip')}
        >
          <Redo2 class="w-3.5 h-3.5" />
        </Button>
      </div>

      <Separator orientation="vertical" class="h-5 mx-1.5" />
      </Feature>

      <!-- In/Out Points -->
      <Feature id="timeline.in-out">
      <div class="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          style={btnStyle}
          onclick={() => inOutPoints.setInPoint(usePlaybackStore.getState().currentFrame)}
          aria-label={t('timeline.header.setInPoint')}
          data-tooltip={t('timeline.header.setInPointTooltip')}
        >
          <span class="text-sm font-bold" style:color="var(--color-timeline-in)">[</span>
        </Button>

        <Button
          variant="ghost"
          size="icon"
          style={btnStyle}
          onclick={() => inOutPoints.setOutPoint(usePlaybackStore.getState().currentFrame)}
          aria-label={t('timeline.header.setOutPoint')}
          data-tooltip={t('timeline.header.setOutPointTooltip')}
        >
          <span class="text-sm font-bold" style:color="var(--color-timeline-out)">]</span>
        </Button>

        <Button
          variant="ghost"
          size="icon"
          style={btnStyle}
          onclick={clearInOutPoints}
          disabled={inOutPoints.inPoint === null && inOutPoints.outPoint === null}
          aria-label={t('timeline.header.clearInOutPoints')}
          data-tooltip={t('timeline.header.clearInOutPointsTooltip')}
        >
          <X class="w-3.5 h-3.5" />
        </Button>
      </div>

      <Separator orientation="vertical" class="h-5 mx-1.5" />
      </Feature>

      <!-- Markers -->
      <Feature id="timeline.markers">
      <div class="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          style={btnStyle}
          onclick={() => addMarker(usePlaybackStore.getState().currentFrame)}
          aria-label={t('timeline.header.addMarker')}
          data-tooltip={t('timeline.header.addMarkerTooltip')}
        >
          <Flag class="w-3.5 h-3.5" style="color: var(--color-timeline-marker)" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          style={btnStyle}
          onclick={() => {
            const markerId = selectedMarkerId.current
            if (markerId) {
              removeMarker(markerId)
              useSelectionStore.getState().clearSelection()
            }
          }}
          disabled={!selectedMarkerId.current}
          aria-label={t('timeline.header.removeSelectedMarker')}
          data-tooltip={t('timeline.header.removeSelectedMarkerTooltip')}
        >
          <FlagOff class="w-3.5 h-3.5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          style={btnStyle}
          onclick={clearAllMarkers}
          disabled={!hasMarkers.current}
          aria-label={t('timeline.header.clearAllMarkers')}
          data-tooltip={t('timeline.header.clearAllMarkersTooltip')}
        >
          <X class="w-3.5 h-3.5" />
        </Button>
      </div>

      <Separator orientation="vertical" class="h-5 mx-1.5" />
      </Feature>

      <!-- Microphone voiceover -->
      <Feature id="timeline.record">
      <MicRecordControl />

      <Separator orientation="vertical" class="h-5 mx-1.5" />
      </Feature>

      <!-- Snap Toggle -->
      <Feature id="timeline.snap">
      <Button
        variant="ghost"
        size="icon"
        style={btnStyle}
        class={snapEnabled.current ? activeClass : ''}
        onclick={toggleSnap}
        aria-label={snapEnabled.current
          ? t('timeline.header.disableSnapping')
          : t('timeline.header.enableSnapping')}
        data-tooltip={snapEnabled.current
          ? t('timeline.header.snapEnabled')
          : t('timeline.header.snapDisabled')}
      >
        <Magnet class="w-3.5 h-3.5" />
      </Button>
      </Feature>

      <Feature id="timeline.audio-skimming">
      <Button
        variant="ghost"
        size="icon"
        style={btnStyle}
        class={audioSkimmingEnabled.current ? activeClass : ''}
        onclick={toggleAudioSkimming}
        aria-label={audioSkimmingEnabled.current
          ? t('timeline.header.disableAudioSkimming')
          : t('timeline.header.enableAudioSkimming')}
        aria-pressed={audioSkimmingEnabled.current}
        data-tooltip={audioSkimmingEnabled.current
          ? t('timeline.header.audioSkimmingEnabled')
          : t('timeline.header.audioSkimmingDisabled')}
      >
        <Volume2 class="w-3.5 h-3.5" />
      </Button>
      </Feature>

      <Separator orientation="vertical" class="h-5 mx-1.5" />

      <!-- Inline keyframes toggle -->
      <Feature id="timeline.keyframes">
      <Button
        variant="ghost"
        size="icon"
        style={btnStyle}
        class={inlineKeyframesOpen.current ? activeClass : ''}
        onclick={() => useSelectionStore.getState().toggleEditKeyframePanel()}
        aria-label={keyframesToggleLabel}
        aria-pressed={inlineKeyframesOpen.current}
        data-tooltip={keyframesToggleLabel}
      >
        <Diamond class="h-3.5 w-3.5" />
      </Button>
      </Feature>

      <Feature id="timeline.linked-selection">
      <Button
        variant="ghost"
        size="icon"
        style={btnStyle}
        class={linkedSelectionEnabled.current ? activeClass : ''}
        onclick={() =>
          useEditorStore.getState().setLinkedSelectionEnabled(!linkedSelectionEnabled.current)}
        aria-label={linkedSelectionEnabled.current
          ? t('timeline.header.disableLinkedSelection')
          : t('timeline.header.enableLinkedSelection')}
        aria-pressed={linkedSelectionEnabled.current}
        data-tooltip={t('timeline.header.linkedSelectionTooltip', {
          state: linkedSelectionEnabled.current
            ? t('timeline.header.linkedSelectionOn')
            : t('timeline.header.linkedSelectionOff'),
          shortcut: formatHotkeyBinding(hotkeys.current.TOGGLE_LINKED_SELECTION),
        })}
      >
        <Link2 class="w-3.5 h-3.5" />
      </Button>
      </Feature>
    </div>
  </div>

  <TimelineZoomControls {onZoomChange} {onZoomIn} {onZoomOut} {onZoomToFit} />
</div>
