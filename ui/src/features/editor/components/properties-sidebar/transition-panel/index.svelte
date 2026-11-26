<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import type {
    TransitionTiming,
    WipeDirection,
    SlideDirection,
    FlipDirection,
    PresentationConfig,
    TransitionDefinition,
    TransitionParameterDefinition,
  } from '@/types/transition'

  function rgbArrayToHex(value: unknown): string {
    if (!Array.isArray(value)) return '#000000'
    const [r = 0, g = 0, b = 0] = value
    const toHex = (channel: unknown) => {
      const numeric = typeof channel === 'number' && Number.isFinite(channel) ? channel : 0
      return Math.round(Math.max(0, Math.min(1, numeric)) * 255)
        .toString(16)
        .padStart(2, '0')
    }
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`
  }

  function hexToRgbArray(hex: string): [number, number, number] {
    const normalized = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.slice(1) : '000000'
    return [
      parseInt(normalized.slice(0, 2), 16) / 255,
      parseInt(normalized.slice(2, 4), 16) / 255,
      parseInt(normalized.slice(4, 6), 16) / 255,
    ]
  }

  function getDefaultTransitionProperties(
    definition: TransitionDefinition | undefined,
  ): Record<string, unknown> | undefined {
    if (!definition?.parameters?.length) return undefined
    return Object.fromEntries(
      definition.parameters.map((parameter) => [parameter.key, parameter.defaultValue]),
    )
  }

  function getNumberParameterValue(
    properties: Record<string, unknown> | undefined,
    parameter: TransitionParameterDefinition,
  ): number {
    const value = properties?.[parameter.key]
    return typeof value === 'number' && Number.isFinite(value)
      ? value
      : Number(parameter.defaultValue)
  }

  function getColorParameterValue(
    properties: Record<string, unknown> | undefined,
    parameter: TransitionParameterDefinition,
  ): string {
    return rgbArrayToHex(properties?.[parameter.key] ?? parameter.defaultValue)
  }

  function getParameterDefaultValue(parameter: TransitionParameterDefinition): unknown {
    return Array.isArray(parameter.defaultValue)
      ? [...parameter.defaultValue]
      : parameter.defaultValue
  }

  function isParameterAtDefault(
    properties: Record<string, unknown> | undefined,
    parameter: TransitionParameterDefinition,
  ): boolean {
    if (parameter.type === 'number') {
      return getNumberParameterValue(properties, parameter) === Number(parameter.defaultValue)
    }

    return getColorParameterValue(properties, parameter) === rgbArrayToHex(parameter.defaultValue)
  }

  function formatParameterValue(parameter: TransitionParameterDefinition, value: number): string {
    const step = parameter.step ?? 1
    const [, decimalPart = ''] = step.toString().split('.')
    const decimals = decimalPart.length
    const fixed = value.toFixed(Math.min(3, decimals))
    return parameter.unit ? `${fixed}${parameter.unit}` : fixed
  }

  function getPresentationOptionValue(
    config: Pick<PresentationConfig, 'id' | 'direction'>,
  ): string {
    return config.direction ? `${config.id}:${config.direction}` : config.id
  }

  function getPresentationOptionLabel(
    config: Pick<PresentationConfig, 'label' | 'description' | 'direction'>,
  ): string {
    return config.direction ? config.description : config.label
  }

  const DIRECTION_OPTIONS = [
    { value: 'from-left', labelKey: 'editor.transitionPanel.directionLeft' },
    { value: 'from-right', labelKey: 'editor.transitionPanel.directionRight' },
    { value: 'from-top', labelKey: 'editor.transitionPanel.directionTop' },
    { value: 'from-bottom', labelKey: 'editor.transitionPanel.directionBottom' },
  ] as const satisfies ReadonlyArray<{
    value: WipeDirection | SlideDirection | FlipDirection
    labelKey: string
  }>

  const EASE_OPTIONS = [
    { value: 'linear', labelKey: 'editor.transitionPanel.easeLinear' },
    { value: 'ease-in', labelKey: 'editor.transitionPanel.easeIn' },
    { value: 'ease-out', labelKey: 'editor.transitionPanel.easeOut' },
    { value: 'ease-in-out', labelKey: 'editor.transitionPanel.easeInOut' },
  ] as const satisfies ReadonlyArray<{ value: TransitionTiming; labelKey: string }>

  const PLACEMENT_OPTIONS = [
    {
      value: 1,
      labelKey: 'editor.transitionPanel.placementLeft',
      titleKey: 'editor.transitionPanel.placementLeftTooltip',
    },
    {
      value: 0.5,
      labelKey: 'editor.transitionPanel.placementCenter',
      titleKey: 'editor.transitionPanel.placementCenterTooltip',
    },
    {
      value: 0,
      labelKey: 'editor.transitionPanel.placementRight',
      titleKey: 'editor.transitionPanel.placementRightTooltip',
    },
  ] as const

  function getSupportedEaseOptions(
    supportedTimings: readonly TransitionTiming[],
  ): ReadonlyArray<(typeof EASE_OPTIONS)[number]> {
    return EASE_OPTIONS.filter((option) => supportedTimings.includes(option.value))
  }
</script>

<script lang="ts">
  import { Portal } from 'bits-ui'
  import { t } from '$lib/i18n.svelte'
  import { select } from '$lib/store.svelte'
  import { portalTarget } from '$lib/context'
  import { i18n } from '@/i18n'
  import { Button } from '@/components/ui/button'
  import Trash2 from '@lucide/svelte/icons/trash-2'
  import Zap from '@lucide/svelte/icons/zap'
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import {
    removeTransition,
    updateTransition,
    useItemsStore,
    useTimelineSettingsStore,
    useTransitionsStore,
  } from '@/features/editor/deps/timeline-store'
  import { useSelectionStore } from '@/shared/state/selection'
  import { PropertySection, PropertyRow, SliderInput } from '../components'
  import {
    TRANSITION_CONFIGS,
    type Transition,
    type TransitionPresentation,
  } from '@/types/transition'
  import { cn } from '@/shared/ui/cn'
  import { transitionRegistry } from '@/shared/timeline/transitions'
  import {
    TRANSITION_CATEGORY_INFO,
    getTransitionConfigsByCategory,
  } from '@/features/editor/utils/transition-ui-config'
  import { getMaxTransitionDurationForHandles } from '@/features/editor/deps/timeline-utils'
  import TransitionColorPicker from './transition-color-picker.svelte'

  /**
   * Transition properties panel - shown when a transition is selected.
   * Allows editing presentation style, duration, timing, and direction.
   */
  // Granular selectors (Zustand v5 best practice)
  const selectedTransitionId = select(useSelectionStore, (s) => s.selectedTransitionId)
  const transitions = select(useTransitionsStore, (s) => s.transitions)
  const fpsStore = select(useTimelineSettingsStore, (s) => s.fps)
  const items = select(useItemsStore, (s) => s.items)
  const fps = $derived(fpsStore.current)

  // Derive selected transition
  const selectedTransition = $derived<Transition | undefined>(
    transitions.current.find((transition: Transition) => transition.id === selectedTransitionId.current),
  )

  // Get config for current transition type
  const transitionConfig = $derived(
    selectedTransition && selectedTransition.type in TRANSITION_CONFIGS
      ? TRANSITION_CONFIGS[selectedTransition.type]
      : null,
  )
  const leftClip = $derived(
    selectedTransition
      ? items.current.find((item) => item.id === selectedTransition.leftClipId)
      : null,
  )
  const rightClip = $derived(
    selectedTransition
      ? items.current.find((item) => item.id === selectedTransition.rightClipId)
      : null,
  )
  const presentationConfigGroups = Object.entries(getTransitionConfigsByCategory()).filter(
    ([, configs]) => configs.length > 0,
  )
  const presentationConfigs = presentationConfigGroups.flatMap(([, configs]) => configs)
  const currentPresentationConfig = $derived(
    presentationConfigs.find((config) => config.id === selectedTransition?.presentation),
  )
  const currentPresentationLabel = $derived(
    currentPresentationConfig
      ? getPresentationOptionLabel(currentPresentationConfig)
      : t('editor.transitionPanel.selectPreset'),
  )
  const transitionDefinition = $derived(
    selectedTransition ? transitionRegistry.getDefinition(selectedTransition.presentation) : undefined,
  )
  const easeOptions = $derived(getSupportedEaseOptions(transitionDefinition?.supportedTimings ?? []))

  const definitionMinDuration = $derived(transitionDefinition?.minDuration ?? 1)
  const definitionMaxDuration = $derived(
    transitionDefinition?.maxDuration ?? Number.POSITIVE_INFINITY,
  )
  const definitionDefaultDuration = $derived(transitionDefinition?.defaultDuration ?? fps)

  const minDuration = $derived(Math.max(1, definitionMinDuration))
  const maxDuration = $derived.by(() => {
    if (!transitionConfig || !selectedTransition || !leftClip || !rightClip) {
      const fallback = selectedTransition?.durationInFrames ?? transitionConfig?.defaultDuration ?? fps
      return Math.max(minDuration, Math.min(fallback, definitionMaxDuration))
    }

    const leftEnd = leftClip.from + leftClip.durationInFrames
    const isAdjacent = Math.abs(leftEnd - rightClip.from) <= 1
    const handleLimit = isAdjacent
      ? getMaxTransitionDurationForHandles(leftClip, rightClip, selectedTransition.alignment, fps)
      : Math.floor(Math.min(leftClip.durationInFrames, rightClip.durationInFrames) - 1)
    const combinedLimit = Math.min(handleLimit, definitionMaxDuration)
    return Math.max(minDuration, Math.max(selectedTransition.durationInFrames, combinedLimit))
  })

  // Handle presentation change
  const handlePresentationChange = (
    presentation: TransitionPresentation,
    direction?: WipeDirection | SlideDirection | FlipDirection,
  ) => {
    const transitionId = selectedTransitionId.current
    if (transitionId) {
      const nextDefinition = transitionRegistry.getDefinition(presentation)
      const currentDirection = selectedTransition?.direction
      const nextDirections = nextDefinition?.directions ?? []
      const nextDirection =
        direction ??
        (currentDirection && nextDirections.includes(currentDirection)
          ? currentDirection
          : undefined) ??
        nextDirections[0]
      const updates: Partial<Transition> = {
        presentation,
        direction: nextDefinition?.hasDirection ? nextDirection : undefined,
      }
      if (selectedTransition?.presentation !== presentation) {
        updates.properties = getDefaultTransitionProperties(nextDefinition)
      }
      const nextEaseOptions = getSupportedEaseOptions(nextDefinition?.supportedTimings ?? [])
      const fallbackEase = nextEaseOptions[0]
      const currentTiming = selectedTransition?.timing
      if (
        fallbackEase &&
        nextDefinition &&
        currentTiming &&
        !nextDefinition.supportedTimings.includes(currentTiming)
      ) {
        updates.timing = fallbackEase.value
      }
      updateTransition(transitionId, updates)
    }
  }

  const handlePresentationPresetChange = (value: string) => {
    const config = presentationConfigs.find((entry) => getPresentationOptionValue(entry) === value)
    if (!config) return
    handlePresentationChange(config.id, config.direction)
  }

  let presetPickerOpen = $state(false)
  let presetSearchQuery = $state('')
  let presetTrigger: HTMLButtonElement | null = $state(null)
  let presetPanel: HTMLDivElement | null = $state(null)
  let presetPanelStyle = $state('')
  const target = portalTarget()
  const filteredPresentationConfigGroups = $derived.by(() => {
    const query = presetSearchQuery.trim().toLowerCase()
    if (!query) return presentationConfigGroups

    return presentationConfigGroups
      .map(([category, configs]) => {
        const categoryTitle = TRANSITION_CATEGORY_INFO[category]
          ? i18n.t(TRANSITION_CATEGORY_INFO[category].titleKey)
          : category
        const filtered = configs.filter((config) =>
          [config.id, config.label, config.description, config.direction, category, categoryTitle]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(query)),
        )
        return [category, filtered] as const
      })
      .filter(([, configs]) => configs.length > 0)
  })

  const openPresetPicker = () => {
    if (presetTrigger) {
      const rect = presetTrigger.getBoundingClientRect()
      presetPanelStyle = `position: fixed; top: ${rect.bottom + 4}px; left: ${rect.left}px; width: ${rect.width}px`
    }
    presetPickerOpen = true
  }

  const closePresetPicker = () => {
    presetPickerOpen = false
    presetSearchQuery = ''
    presetTrigger?.blur()
  }

  const selectPresentationPreset = (value: string) => {
    handlePresentationPresetChange(value)
    closePresetPicker()
  }

  $effect(() => {
    if (!presetPickerOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      // A shadow-root editor retargets the event; the composed path still has the target.
      const eventTarget = (event.composedPath()[0] ?? event.target) as Node
      if (presetPanel?.contains(eventTarget) || presetTrigger?.contains(eventTarget)) {
        return
      }
      closePresetPicker()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePresetPicker()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  })

  // Handle duration change (in frames)
  const handleDurationChange = (durationInFrames: number) => {
    const transitionId = selectedTransitionId.current
    if (transitionId && transitionConfig) {
      const clamped = Math.max(minDuration, Math.min(maxDuration, Math.round(durationInFrames)))
      updateTransition(transitionId, { durationInFrames: clamped })
    }
  }

  // Prefer the registry-declared default; clamp into the allowable range.
  const defaultDuration = $derived(
    Math.max(minDuration, Math.min(maxDuration, definitionDefaultDuration)),
  )

  // Handle reset duration to default (1 second)
  const handleResetDuration = () => {
    const transitionId = selectedTransitionId.current
    if (transitionId && transitionConfig) {
      const clamped = Math.max(minDuration, Math.min(maxDuration, defaultDuration))
      updateTransition(transitionId, { durationInFrames: clamped })
    }
  }

  const selectedAlignment = $derived(selectedTransition?.alignment ?? 0.5)
  const handlePlacementChange = (alignment: number) => {
    const transitionId = selectedTransitionId.current
    if (!transitionId || !selectedTransition || !leftClip || !rightClip) return

    const maxForPlacement = getMaxTransitionDurationForHandles(leftClip, rightClip, alignment, fps)
    if (maxForPlacement < selectedTransition.durationInFrames) return

    updateTransition(transitionId, { alignment })
  }

  // Handle timing change
  const handleTimingChange = (timing: TransitionTiming) => {
    const transitionId = selectedTransitionId.current
    if (transitionId) {
      updateTransition(transitionId, { timing })
    }
  }

  const directionOptions = $derived.by(() => {
    const directions = transitionDefinition?.directions ?? []
    return DIRECTION_OPTIONS.filter((option) => directions.includes(option.value))
  })

  const selectedDirection = $derived(
    selectedTransition?.direction ?? transitionDefinition?.directions?.[0],
  )

  const handleDirectionChange = (direction: WipeDirection | SlideDirection | FlipDirection) => {
    const transitionId = selectedTransitionId.current
    if (transitionId) {
      updateTransition(transitionId, { direction })
    }
  }

  const handleParameterChange = (parameter: TransitionParameterDefinition, value: unknown) => {
    const transitionId = selectedTransitionId.current
    if (!transitionId || !selectedTransition) return
    updateTransition(transitionId, {
      properties: {
        ...(selectedTransition.properties ?? {}),
        [parameter.key]:
          parameter.type === 'color' && parameter.valueFormat === 'rgb-array'
            ? hexToRgbArray(String(value))
            : value,
      },
    })
  }

  const handleParameterReset = (parameter: TransitionParameterDefinition) => {
    const transitionId = selectedTransitionId.current
    if (!transitionId || !selectedTransition) return
    updateTransition(transitionId, {
      properties: {
        ...(selectedTransition.properties ?? {}),
        [parameter.key]: getParameterDefaultValue(parameter),
      },
    })
  }

  // Handle delete
  const handleDelete = () => {
    const transitionId = selectedTransitionId.current
    if (transitionId) {
      removeTransition(transitionId)
      useSelectionStore.getState().clearSelection()
    }
  }

  // Format duration for display
  const formatDuration = (frames: number): string => {
    const seconds = frames / fps
    return `${seconds.toFixed(2)}s`
  }

  const formatDurationInput = (frames: number): string => (frames / fps).toFixed(2)

  const parseDurationInput = (rawValue: string): number => {
    const normalized = rawValue.trim().replace(/s$/i, '')
    const seconds = parseFloat(normalized)
    return Number.isFinite(seconds) ? seconds * fps : Number.NaN
  }
</script>

{#if !selectedTransition || !transitionConfig}
  <div class="flex flex-col items-center justify-center py-16 text-center">
    <Zap class="w-8 h-8 text-muted-foreground/50 mb-2" />
    <p class="text-xs text-muted-foreground">{t('editor.transitionPanel.notFound')}</p>
  </div>
{:else}
  <div class="space-y-4">
    <PropertySection title={t('editor.transitionPanel.sectionTitle')} icon={Zap} defaultOpen={true}>
      <PropertyRow
        label={t('editor.transitionPanel.preset')}
        tooltip={t('editor.transitionPanel.presetTooltip')}
      >
        <div class="w-full">
          <Button
            bind:ref={presetTrigger}
            variant="outline"
            size="sm"
            role="combobox"
            aria-expanded={presetPickerOpen}
            class="h-7 w-full justify-between px-2 text-xs font-normal"
            onclick={() => (presetPickerOpen ? closePresetPicker() : openPresetPicker())}
            onkeydown={(event) => {
              if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                openPresetPicker()
              }
            }}
          >
            <span class="truncate">{currentPresentationLabel}</span>
            <ChevronDown class="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
          {#if presetPickerOpen}
            <Portal to={target}>
              <div
                bind:this={presetPanel}
                style={presetPanelStyle}
                class="z-50 rounded-md border bg-popover text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 slide-in-from-top-2"
              >
                <div class="border-b border-border p-1.5">
                  <!-- svelte-ignore a11y_autofocus -->
                  <input
                    type="search"
                    aria-label={t('editor.transitionPanel.searchTransitions')}
                    value={presetSearchQuery}
                    oninput={(event) => (presetSearchQuery = event.currentTarget.value)}
                    placeholder={t('editor.transitionPanel.searchTransitions')}
                    class="h-7 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
                    autofocus
                  />
                </div>
                <div class="max-h-[460px] overflow-y-auto overflow-x-hidden p-1">
                  {#each filteredPresentationConfigGroups as [category, configs], index (category)}
                    <div>
                      {#if index > 0}
                        <div class="-mx-1 my-1 h-px bg-muted"></div>
                      {/if}
                      <div class="px-2 py-1 text-xs font-medium text-muted-foreground">
                        {TRANSITION_CATEGORY_INFO[category]
                          ? t(TRANSITION_CATEGORY_INFO[category].titleKey)
                          : category}
                      </div>
                      {#each configs as config (getPresentationOptionValue(config))}
                        {@const value = getPresentationOptionValue(config)}
                        {@const selected =
                          !!currentPresentationConfig &&
                          getPresentationOptionValue(currentPresentationConfig) === value}
                        <!-- svelte-ignore a11y_role_supports_aria_props_implicit -->
                        <button
                          type="button"
                          aria-selected={selected}
                          class={cn(
                            'relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none hover:bg-accent hover:text-accent-foreground',
                            selected && 'bg-accent text-accent-foreground',
                          )}
                          onclick={() => selectPresentationPreset(value)}
                        >
                          <span class="truncate">{getPresentationOptionLabel(config)}</span>
                        </button>
                      {/each}
                    </div>
                  {/each}
                  {#if filteredPresentationConfigGroups.length === 0}
                    <div class="px-2 py-6 text-center text-xs text-muted-foreground">
                      {t('editor.transitionPanel.noTransitionsFound')}
                    </div>
                  {/if}
                </div>
              </div>
            </Portal>
          {/if}
        </div>
      </PropertyRow>

      <!-- Duration slider -->
      <PropertyRow
        label={t('editor.transitionPanel.duration')}
        tooltip={t('editor.transitionPanel.durationTooltip')}
      >
        <div class="flex items-center gap-1 w-full">
          <SliderInput
            value={selectedTransition.durationInFrames}
            onChange={handleDurationChange}
            min={minDuration}
            max={maxDuration}
            step={1}
            formatValue={formatDuration}
            formatInputValue={formatDurationInput}
            parseInputValue={parseDurationInput}
            class="flex-1 min-w-0"
          />
          <Button
            variant="ghost"
            size="icon"
            class="h-7 w-7 flex-shrink-0"
            onclick={handleResetDuration}
            title={t('editor.transitionPanel.resetToDefault')}
          >
            <RotateCcw class="w-3.5 h-3.5" />
          </Button>
        </div>
      </PropertyRow>

      <PropertyRow
        label={t('editor.transitionPanel.placement')}
        tooltip={t('editor.transitionPanel.placementTooltip')}
      >
        <div class="flex items-center gap-0.5 p-0.5 bg-secondary rounded-md">
          {#each PLACEMENT_OPTIONS as { value, labelKey, titleKey } (labelKey)}
            {@const maxForPlacement =
              leftClip && rightClip
                ? getMaxTransitionDurationForHandles(leftClip, rightClip, value, fps)
                : 0}
            {@const disabled = maxForPlacement < selectedTransition.durationInFrames}
            {@const selected = selectedAlignment === value}
            {@const label = t(labelKey)}
            {@const title = t(titleKey)}
            <button
              type="button"
              aria-label={t('editor.transitionPanel.placementAria', { label })}
              title={disabled ? t('editor.transitionPanel.placementDisabled', { title }) : title}
              {disabled}
              onclick={() => handlePlacementChange(value)}
              class={cn(
                'inline-flex h-7 min-w-[3.75rem] flex-1 items-center justify-center rounded px-2 text-xs transition-colors',
                selected
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
                disabled && 'cursor-not-allowed opacity-40 hover:text-muted-foreground',
              )}
            >
              <span>{label}</span>
            </button>
          {/each}
        </div>
      </PropertyRow>

      {#if easeOptions.length > 0}
        <PropertyRow
          label={t('editor.transitionPanel.ease')}
          tooltip={t('editor.transitionPanel.easeTooltip')}
        >
          <div class="flex items-center gap-0.5 p-0.5 bg-secondary rounded-md">
            {#each easeOptions as option (option.value)}
              <button
                type="button"
                onclick={() => handleTimingChange(option.value)}
                class={cn(
                  'px-3 py-1 text-xs rounded transition-colors',
                  selectedTransition.timing === option.value
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t(option.labelKey)}
              </button>
            {/each}
          </div>
        </PropertyRow>
      {/if}

      {#if transitionDefinition?.hasDirection && directionOptions.length > 0}
        <PropertyRow
          label={t('editor.transitionPanel.direction')}
          tooltip={t('editor.transitionPanel.directionTooltip')}
        >
          <div class="flex items-center gap-0.5 p-0.5 bg-secondary rounded-md">
            {#each directionOptions as option (option.value)}
              <button
                type="button"
                aria-label={t(option.labelKey)}
                onclick={() => handleDirectionChange(option.value)}
                class={cn(
                  'px-3 py-1 text-xs rounded transition-colors',
                  selectedDirection === option.value
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t(option.labelKey)}
              </button>
            {/each}
          </div>
        </PropertyRow>
      {/if}

      {#each transitionDefinition?.parameters ?? [] as parameter (parameter.key)}
        <PropertyRow label={parameter.label} tooltip={parameter.description}>
          <div class="flex items-center gap-1 w-full">
            {#if parameter.type === 'number'}
              <SliderInput
                value={getNumberParameterValue(selectedTransition.properties, parameter)}
                onChange={(value) => handleParameterChange(parameter, value)}
                onLiveChange={(value) => handleParameterChange(parameter, value)}
                min={parameter.min ?? 0}
                max={parameter.max ?? 1}
                step={parameter.step ?? 1}
                unit={parameter.unit}
                formatValue={(value) => formatParameterValue(parameter, value)}
                class="flex-1 min-w-0"
              />
            {:else}
              <TransitionColorPicker
                label={parameter.label}
                initialColor={getColorParameterValue(selectedTransition.properties, parameter)}
                onColorChange={(color) => handleParameterChange(parameter, color)}
              />
            {/if}
            <Button
              variant="ghost"
              size="icon"
              class="h-7 w-7 flex-shrink-0"
              onclick={() => handleParameterReset(parameter)}
              disabled={isParameterAtDefault(selectedTransition.properties, parameter)}
              title={t('editor.transitionPanel.resetParam', { label: parameter.label })}
              aria-label={t('editor.transitionPanel.resetParam', { label: parameter.label })}
            >
              <RotateCcw class="w-3.5 h-3.5" />
            </Button>
          </div>
        </PropertyRow>
      {/each}

      <!-- Action buttons -->
      <div class="pt-2">
        <!-- Delete button -->
        <Button variant="destructive" size="sm" class="w-full h-7 text-xs" onclick={handleDelete}>
          <Trash2 class="w-3 h-3 mr-1.5" />{t('common.delete')}
        </Button>
      </div>
    </PropertySection>
  </div>
{/if}
