<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  /**
   * Keyframe toggle button component.
   * Diamond-shaped button that appears next to animatable properties.
   * - Hollow diamond: No keyframe at current frame (click to add)
   * - Filled diamond: Keyframe exists at current frame (click to remove)
   * - Disabled with strikethrough: Frame is in transition region (keyframes not allowed)
   */
  import { cn } from '@/shared/ui/cn'
  import type { addKeyframes, removeKeyframes } from '@/features/keyframes/deps/timeline'
  import type { AnimatableProperty, ItemKeyframes, Keyframe } from '@/types/keyframe'
  import type { TimelineItem } from '@/types/timeline'
  import type { Transition } from '@/types/transition'
  import { isFrameInTransitionRegion } from '@/features/keyframes/utils/transition-region'

  interface KeyframeToggleTargetState {
    itemId: string
    item: Pick<TimelineItem, 'from' | 'durationInFrames'> | undefined
    relativeFrame: number
    propertyKeyframes: ItemKeyframes['properties'][number] | undefined
    keyframeAtFrame: Keyframe | undefined
    transitionBlockedRange: ReturnType<typeof isFrameInTransitionRegion>
  }

  function getRelevantTransitions(transitions: Transition[], itemIds: string[]): Transition[] {
    if (itemIds.length === 0) return []
    return transitions.filter(
      (transition) =>
        itemIds.includes(transition.leftClipId) || itemIds.includes(transition.rightClipId),
    )
  }

  function buildTargetStates(
    itemIds: string[],
    selectedItemBounds: Array<number | undefined>,
    selectedItemKeyframes: Array<ItemKeyframes | undefined>,
    currentFrame: number,
    property: AnimatableProperty,
    transitions: Transition[],
  ): KeyframeToggleTargetState[] {
    return itemIds.map((itemId, index) => {
      const from = selectedItemBounds[index * 2]
      const durationInFrames = selectedItemBounds[index * 2 + 1]
      const item =
        from === undefined || durationInFrames === undefined ? undefined : { from, durationInFrames }
      const itemKeyframes = selectedItemKeyframes[index]
      const relativeFrame = item ? currentFrame - item.from : 0
      const propertyKeyframes = itemKeyframes?.properties.find(
        (entry) => entry.property === property,
      )
      return {
        itemId,
        item,
        relativeFrame,
        propertyKeyframes,
        keyframeAtFrame: propertyKeyframes?.keyframes.find(
          (keyframe) => keyframe.frame === relativeFrame,
        ),
        transitionBlockedRange: item
          ? isFrameInTransitionRegion(relativeFrame, itemId, item, transitions)
          : undefined,
      }
    })
  }

  function toggleTargetKeyframes(
    states: KeyframeToggleTargetState[],
    property: AnimatableProperty,
    currentValue: number,
    getCurrentValue: (() => number) | undefined,
    currentValuesByItemId: Readonly<Record<string, number>> | undefined,
    removeKeyframesAction: typeof removeKeyframes,
    addKeyframesAction: typeof addKeyframes,
  ): void {
    const allHaveKeyframes =
      states.length > 0 && states.every((state) => state.keyframeAtFrame !== undefined)
    if (allHaveKeyframes) {
      removeKeyframesAction(
        states.flatMap((state) =>
          state.keyframeAtFrame
            ? [{ itemId: state.itemId, property, keyframeId: state.keyframeAtFrame.id }]
            : [],
        ),
      )
      return
    }

    const resolvedCurrentValue = getCurrentValue?.() ?? currentValue
    addKeyframesAction(
      states.flatMap((state) =>
        state.keyframeAtFrame
          ? []
          : [
              {
                itemId: state.itemId,
                property,
                frame: state.relativeFrame,
                value: currentValuesByItemId?.[state.itemId] ?? resolvedCurrentValue,
              },
            ],
      ),
    )
  }

  function getToggleInteractionClasses(
    effectiveDisabled: boolean,
    isInTransition: boolean,
  ): string[] {
    const classes: string[] = []
    if (effectiveDisabled) classes.push('opacity-50 cursor-not-allowed')
    if (isInTransition) classes.push('line-through')
    return classes
  }

  function getToggleKeyframeColorClass(
    hasAnyKeyframes: boolean,
    hasKeyframe: boolean,
    isInTransition: boolean,
  ): string {
    if (isInTransition) return 'text-muted-foreground/50'
    if (hasKeyframe) return 'text-amber-500'
    if (hasAnyKeyframes) return 'text-amber-500/50'
    return 'text-muted-foreground'
  }

  function getToggleButtonClassName(
    className: string | undefined,
    effectiveDisabled: boolean,
    hasAnyKeyframes: boolean,
    hasKeyframe: boolean,
    isInTransition: boolean,
  ): string {
    return cn(
      'flex items-center justify-center w-5 h-5 rounded-sm transition-colors',
      'hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
      ...getToggleInteractionClasses(effectiveDisabled, isInTransition),
      getToggleKeyframeColorClass(hasAnyKeyframes, hasKeyframe, isInTransition),
      className,
    )
  }
</script>

<script lang="ts">
  import Diamond from 'lucide-svelte/icons/diamond'
  import { t } from '$lib/i18n.svelte'
  import { select, shallow } from '$lib/store.svelte'
  import {
    addKeyframes as addKeyframesAction,
    removeKeyframes as removeKeyframesAction,
    useItemsStore,
    useKeyframesStore,
    useTransitionsStore,
  } from '@/features/keyframes/deps/timeline'
  import { useThrottledFrame } from '@/features/keyframes/deps/preview-contract'
  import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
  import { getTransitionBlockedMessage } from '@/features/keyframes/utils/transition-region'

  interface KeyframeToggleProps {
    /** The item ID(s) to toggle keyframes for */
    itemIds: string[]
    /** The property to animate */
    property: AnimatableProperty
    /** Current value of the property (used when adding keyframe) */
    currentValue: number
    /** Resolve the latest value lazily without rerendering the toggle */
    getCurrentValue?: () => number
    /** Per-item values for mixed selections; falls back to currentValue when omitted */
    currentValuesByItemId?: Readonly<Record<string, number>>
    /** Optional class name for the button */
    class?: string
    /** Disabled state */
    disabled?: boolean
  }

  /**
   * Keyframe toggle button for property panels.
   * Adds or removes a keyframe at the current playhead position.
   */
  let {
    itemIds,
    property,
    currentValue,
    getCurrentValue,
    currentValuesByItemId,
    class: className,
    disabled = false,
  }: KeyframeToggleProps = $props()

  // Current frame, throttled to reduce updates during playback
  const currentFrame = useThrottledFrame()

  const selectedItemKeyframes = $derived(
    select(
      useKeyframesStore,
      (s) => itemIds.map((itemId) => s.keyframesByItemId[itemId]),
      shallow,
    ),
  )
  const selectedItemBounds = $derived(
    select(
      useItemsStore,
      (state) =>
        itemIds.flatMap((itemId): Array<number | undefined> => {
          const item = state.itemById[itemId]
          return item ? [item.from, item.durationInFrames] : [undefined, undefined]
        }),
      shallow,
    ),
  )

  // Transitions, to check for blocked regions
  const transitions = $derived(
    select(useTransitionsStore, (s) => getRelevantTransitions(s.transitions, itemIds), shallow),
  )

  const targetStates = $derived(
    buildTargetStates(
      itemIds,
      selectedItemBounds.current,
      selectedItemKeyframes.current,
      currentFrame.current,
      property,
      transitions.current,
    ),
  )

  const transitionBlockedRange = $derived(
    targetStates.find((state) => state.transitionBlockedRange !== undefined)
      ?.transitionBlockedRange,
  )
  const isInTransition = $derived(transitionBlockedRange !== undefined)
  const isOutsideBounds = $derived(
    targetStates.length === 0 ||
      targetStates.some(
        ({ item, relativeFrame }) =>
          !item || relativeFrame < 0 || relativeFrame >= item.durationInFrames,
      ),
  )
  const hasKeyframe = $derived(
    targetStates.length > 0 && targetStates.every((state) => state.keyframeAtFrame !== undefined),
  )
  const hasAnyKeyframes = $derived(
    targetStates.some((state) => (state.propertyKeyframes?.keyframes.length ?? 0) > 0),
  )
  const relativeFrame = $derived(targetStates[0]?.relativeFrame ?? 0)

  function handleToggle() {
    if (disabled || isInTransition || isOutsideBounds) return

    toggleTargetKeyframes(
      targetStates,
      property,
      currentValue,
      getCurrentValue,
      currentValuesByItemId,
      removeKeyframesAction,
      addKeyframesAction,
    )
  }

  const effectiveDisabled = $derived(disabled || isInTransition || isOutsideBounds)

  const ariaLabel = $derived.by(() => {
    if (isInTransition) {
      return t('timeline.keyframeEditor.keyframesBlockedTransition', {
        defaultValue: 'Keyframes blocked (transition region)',
      })
    }
    if (isOutsideBounds) {
      return t('timeline.keyframeEditor.playheadOutsideClipBounds', {
        defaultValue: 'Playhead outside clip bounds',
      })
    }
    return hasKeyframe
      ? t('timeline.keyframeEditor.removeKeyframe', { defaultValue: 'Remove keyframe' })
      : t('timeline.keyframeEditor.addKeyframe', { defaultValue: 'Add keyframe' })
  })

  const tooltipBody = $derived.by(() => {
    if (isInTransition && transitionBlockedRange) {
      return getTransitionBlockedMessage(transitionBlockedRange)
    }
    if (isOutsideBounds) {
      return t('timeline.keyframeEditor.playheadIsOutsideClipBounds', {
        defaultValue: 'Playhead is outside clip bounds',
      })
    }
    return hasKeyframe
      ? t('timeline.keyframeEditor.removeKeyframeAtFrame', {
          frame: relativeFrame,
          defaultValue: 'Remove keyframe at frame {{frame}}',
        })
      : t('timeline.keyframeEditor.addKeyframeAtFrame', {
          frame: relativeFrame,
          defaultValue: 'Add keyframe at frame {{frame}}',
        })
  })
</script>

<Tooltip>
  <TooltipTrigger onclick={handleToggle}>
    {#snippet child({ props })}
      <button
        {...props}
        type="button"
        disabled={effectiveDisabled}
        class={getToggleButtonClassName(
          className,
          effectiveDisabled,
          hasAnyKeyframes,
          hasKeyframe,
          isInTransition,
        )}
        aria-label={ariaLabel}
      >
        <Diamond
          class={cn(
            'w-3 h-3 rotate-0 transition-transform',
            hasKeyframe && !isInTransition && 'fill-current',
          )}
        />
      </button>
    {/snippet}
  </TooltipTrigger>
  <TooltipContent side="top" class="text-xs max-w-[200px]">
    {tooltipBody}
  </TooltipContent>
</Tooltip>
