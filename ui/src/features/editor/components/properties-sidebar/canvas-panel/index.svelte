<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import { select } from '$lib/store.svelte'
  import { Button } from '@/components/ui/button'
  import { Separator } from '@/components/ui/separator'
  import ArrowLeftRight from 'lucide-svelte/icons/arrow-left-right'
  import RotateCcw from 'lucide-svelte/icons/rotate-ccw'
  import LayoutDashboard from 'lucide-svelte/icons/layout-dashboard'
  import Clock from 'lucide-svelte/icons/clock'
  import { useProjectStore } from '@/features/editor/deps/projects'
  import { DEFAULT_PROJECT_HEIGHT, DEFAULT_PROJECT_WIDTH } from '@/shared/projects/defaults'
  import {
    markDirty,
    setCompositionCanvasSettings,
    setCompositionDuration,
    useCompositionNavigationStore,
    useCompositionsStore,
    useItemsStore,
    useMarkersStore,
    useTimelineSettingsStore,
  } from '@/features/editor/deps/timeline-store'
  import { toast } from 'svelte-sonner'
  import { PropertySection, PropertyRow, LinkedDimensions, NumberInput } from '../components'
  import MarkerList from '../marker-panel/marker-list.svelte'
  import { formatTimecodeDotFrames } from '@/shared/utils/time-utils'
  import { commitProjectMetadataChange } from '@/features/editor/utils/project-metadata-history'
  import CompositionControlsAuthoringSection from './composition-controls-authoring-section.svelte'
  import ColorPicker from './color-picker.svelte'
  import Feature from '@/components/feature.svelte'

  /**
   * No-selection canvas inspector. In a layer composition it authors that
   * composition's independent canvas; at the root it authors project metadata.
   */
  // Granular selectors
  const currentProject = select(useProjectStore, (s) => s.currentProject)
  const fps = select(useTimelineSettingsStore, (s) => s.fps)
  // Inside a composition (Motion, or a drilled compound clip) the duration on
  // show is the comp's authored canvas length, and it is editable here.
  const activeCompositionId = select(useCompositionNavigationStore, (s) => s.activeCompositionId)
  const activeCompositionSelection = $derived(
    select(useCompositionsStore, (s) =>
      activeCompositionId.current ? s.compositionById[activeCompositionId.current] : undefined,
    ),
  )
  const activeComposition = $derived(activeCompositionSelection.current)
  const isLayerComposition = $derived(activeComposition?.editorKind === 'composite-2d')
  const markerCount = select(useMarkersStore, (s) => s.markers.length)

  // Derived selector: only returns the computed duration, not the full items array
  // This prevents re-renders when items change but duration stays the same
  const timelineDuration = select(useItemsStore, (s) =>
    s.items.length === 0 ? 0 : Math.max(...s.items.map((item) => item.from + item.durationInFrames)),
  )

  const projectWidth = $derived(currentProject.current?.metadata.width ?? DEFAULT_PROJECT_WIDTH)
  const projectHeight = $derived(currentProject.current?.metadata.height ?? DEFAULT_PROJECT_HEIGHT)
  const projectBackgroundColor = $derived(
    currentProject.current?.metadata.backgroundColor ?? '#000000',
  )
  const width = $derived(
    isLayerComposition && activeComposition ? activeComposition.width : projectWidth,
  )
  const height = $derived(
    isLayerComposition && activeComposition ? activeComposition.height : projectHeight,
  )
  const storedBackgroundColor = $derived(
    isLayerComposition && activeComposition
      ? (activeComposition.backgroundColor ?? '#000000')
      : projectBackgroundColor,
  )

  const applyProjectMetadataChange = async (
    updates: Parameters<typeof commitProjectMetadataChange>[0]['updates'],
    command: Parameters<typeof commitProjectMetadataChange>[0]['command'],
  ) => {
    const project = currentProject.current
    if (!project) {
      return
    }

    try {
      await commitProjectMetadataChange({
        project,
        updates,
        command,
        updateProject: useProjectStore.getState().updateProject,
        markDirty,
      })
    } catch (error) {
      toast.error(t('editor.canvasPanel.updateFailed'), {
        description: error instanceof Error ? error.message : t('editor.canvasPanel.tryAgain'),
      })
    }
  }

  const handleWidthChange = (newWidth: number) => {
    const normalizedWidth = Math.round(newWidth / 2) * 2
    const compositionId = activeCompositionId.current
    if (isLayerComposition && compositionId) {
      setCompositionCanvasSettings(compositionId, { width: normalizedWidth })
      return
    }
    void applyProjectMetadataChange(
      { width: normalizedWidth },
      { type: 'UPDATE_PROJECT_METADATA', payload: { fields: ['width'] } },
    )
  }

  const handleHeightChange = (newHeight: number) => {
    const normalizedHeight = Math.round(newHeight / 2) * 2
    const compositionId = activeCompositionId.current
    if (isLayerComposition && compositionId) {
      setCompositionCanvasSettings(compositionId, { height: normalizedHeight })
      return
    }
    void applyProjectMetadataChange(
      { height: normalizedHeight },
      { type: 'UPDATE_PROJECT_METADATA', payload: { fields: ['height'] } },
    )
  }

  const handleSwapDimensions = () => {
    const compositionId = activeCompositionId.current
    if (isLayerComposition && compositionId) {
      setCompositionCanvasSettings(compositionId, { width: height, height: width })
      return
    }
    void applyProjectMetadataChange(
      { width: height, height: width },
      {
        type: 'UPDATE_PROJECT_METADATA',
        payload: { fields: ['width', 'height'], operation: 'swap' },
      },
    )
  }

  const handleResetDimensions = () => {
    const compositionId = activeCompositionId.current
    if (isLayerComposition && compositionId) {
      setCompositionCanvasSettings(compositionId, {
        width: projectWidth,
        height: projectHeight,
      })
      return
    }
    void applyProjectMetadataChange(
      { width: 1920, height: 1080 },
      {
        type: 'UPDATE_PROJECT_METADATA',
        payload: { fields: ['width', 'height'], operation: 'reset' },
      },
    )
  }

  // Commit background color to store on release
  const handleBackgroundColorChange = (color: string) => {
    const compositionId = activeCompositionId.current
    if (isLayerComposition && compositionId) {
      setCompositionCanvasSettings(compositionId, { backgroundColor: color })
      return
    }
    void applyProjectMetadataChange(
      { backgroundColor: color },
      { type: 'UPDATE_PROJECT_METADATA', payload: { fields: ['backgroundColor'] } },
    )
  }

  // The duration field accepts either unit; the stored value is always frames.
  let durationUnit = $state<'frames' | 'seconds'>('frames')
  const toggleDurationUnit = () => {
    durationUnit = durationUnit === 'frames' ? 'seconds' : 'frames'
  }

  const compositionFps = $derived(activeComposition?.fps ?? fps.current)
  const handleCompositionDurationChange = (value: number) => {
    const compositionId = activeCompositionId.current
    if (!compositionId) return
    setCompositionDuration(compositionId, durationUnit === 'seconds' ? value * compositionFps : value)
  }

  // Reset background color to black
  const handleResetBackgroundColor = () => {
    const resetColor = isLayerComposition ? projectBackgroundColor : '#000000'
    if (storedBackgroundColor === resetColor) return
    const compositionId = activeCompositionId.current
    if (isLayerComposition && compositionId) {
      setCompositionCanvasSettings(compositionId, { backgroundColor: resetColor })
      return
    }
    void applyProjectMetadataChange(
      { backgroundColor: '#000000' },
      {
        type: 'UPDATE_PROJECT_METADATA',
        payload: { fields: ['backgroundColor'], operation: 'reset' },
      },
    )
  }
</script>

{#if !currentProject.current}
  <div class="flex flex-col items-center justify-center py-16 text-center">
    <p class="text-xs text-muted-foreground">{t('editor.canvasPanel.noProjectLoaded')}</p>
  </div>
{:else}
  {@const project = currentProject.current}
  <div class="space-y-4">
    <!-- Project canvas in Edit; authored composition canvas in Motion. -->
    <PropertySection
      title={isLayerComposition
        ? t('editor.canvasPanel.composition', { defaultValue: 'Composition' })
        : t('editor.canvasPanel.canvas')}
      icon={LayoutDashboard}
      defaultOpen={true}
    >
      <Feature id="project.size">
      <LinkedDimensions
        {width}
        {height}
        aspectLocked={false}
        onWidthChange={handleWidthChange}
        onHeightChange={handleHeightChange}
        onAspectLockToggle={() => {}}
        minWidth={320}
        minHeight={240}
        maxWidth={7680}
        maxHeight={4320}
        step={2}
      />

      <div class="flex gap-2 mt-2">
        <Button variant="outline" size="sm" class="flex-1 h-7 text-xs" onclick={handleSwapDimensions}>
          <ArrowLeftRight class="w-3 h-3 mr-1.5" />{t('editor.canvasPanel.swap')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          class="flex-1 h-7 text-xs"
          onclick={handleResetDimensions}
        >
          <RotateCcw class="w-3 h-3 mr-1.5" />{isLayerComposition
            ? t('editor.canvasPanel.matchProject', { defaultValue: 'Match Project' })
            : t('common.reset')}
        </Button>
      </div>
      </Feature>

      <!-- Background Color -->
      <Feature id="project.background">
      <PropertyRow label={t('editor.canvasPanel.background')}>
        <div class="flex items-center gap-1 w-full">
          <ColorPicker
            initialColor={storedBackgroundColor}
            onColorChange={handleBackgroundColorChange}
          />
          <Button
            variant="ghost"
            size="icon"
            class="h-7 w-7 flex-shrink-0"
            onclick={handleResetBackgroundColor}
            title={isLayerComposition
              ? t('editor.canvasPanel.matchProjectBackground', {
                  defaultValue: 'Match project background',
                })
              : t('editor.canvasPanel.resetToBlack')}
          >
            <RotateCcw class="w-3.5 h-3.5" />
          </Button>
        </div>
      </PropertyRow>
      </Feature>
    </PropertySection>

    <CompositionControlsAuthoringSection defaultOpen={false} />

    <Separator />

    <!-- Duration Section — authored (editable) inside a composition, derived
         from the content on the project timeline. -->
    <PropertySection title={t('editor.canvasPanel.duration')} icon={Clock} defaultOpen={true}>
      {#if activeComposition}
        <PropertyRow label={t('editor.canvasPanel.compositionDuration')}>
          <!-- Only a layer composition has an authored canvas length. A drilled
               compound clip's duration is derived from its content and gets
               recomputed when you leave it, so editing it here would not hold. -->
          {#if activeComposition.editorKind !== 'composite-2d'}
            <span class="text-xs text-muted-foreground tabular-nums">
              {activeComposition.durationInFrames} fr
            </span>
          {:else}
            <!-- Free to set shorter than the layers: whatever hangs past the end
                 of the comp is simply not rendered. -->
            <NumberInput
              {...durationUnit === 'seconds'
                ? {
                    value: activeComposition.durationInFrames / activeComposition.fps,
                    min: 1 / activeComposition.fps,
                    step: 0.1,
                    unit: 's',
                  }
                : {
                    value: activeComposition.durationInFrames,
                    min: 1,
                    step: 1,
                    unit: 'fr',
                  }}
              onChange={handleCompositionDurationChange}
              onUnitClick={toggleDurationUnit}
              unitTitle={t(
                durationUnit === 'seconds'
                  ? 'editor.canvasPanel.switchToFrames'
                  : 'editor.canvasPanel.switchToSeconds',
              )}
            />
          {/if}
        </PropertyRow>

        <PropertyRow label={t('editor.canvasPanel.timecode')}>
          <span class="text-xs text-muted-foreground tabular-nums">
            {formatTimecodeDotFrames(activeComposition.durationInFrames, activeComposition.fps)}
          </span>
        </PropertyRow>

        <PropertyRow label={t('editor.canvasPanel.frameRate')}>
          <span class="text-xs text-muted-foreground tabular-nums">
            {activeComposition.fps} fps
          </span>
        </PropertyRow>
      {:else}
        <PropertyRow label={t('editor.canvasPanel.duration')}>
          <span class="text-xs text-muted-foreground tabular-nums">
            {formatTimecodeDotFrames(timelineDuration.current, fps.current)}
          </span>
        </PropertyRow>

        <PropertyRow label={t('editor.canvasPanel.frameRate')}>
          <span class="text-xs text-muted-foreground tabular-nums">
            {project.metadata.fps} fps
          </span>
        </PropertyRow>

        <PropertyRow label={t('editor.canvasPanel.totalFrames')}>
          <span class="text-xs text-muted-foreground tabular-nums">
            {timelineDuration.current} fr
          </span>
        </PropertyRow>
      {/if}
    </PropertySection>

    {#if !isLayerComposition || markerCount.current > 0}
      <Separator />
      <MarkerList defaultOpen={!isLayerComposition} />
    {/if}
  </div>
{/if}
