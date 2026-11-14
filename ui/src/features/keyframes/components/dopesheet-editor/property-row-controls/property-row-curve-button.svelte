<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import LineChart from 'lucide-svelte/icons/chart-line'
  import { Button } from '@/components/ui/button'
  import { cn } from '@/shared/ui/cn'
  import { MINI_ICON_BUTTON_CLASS, MINI_ICON_CLASS } from '../dopesheet-constants'
  import type { PropertyRowCurveButtonProps } from './types'

  let {
    property,
    rowLabel,
    singleCurveMode,
    showGraphPane,
    selectedCurveVisibleExternally,
    selectedProperty,
    graphProperties,
    visible,
    onCurveVisibilityChange,
    showSinglePropertyCurve,
    togglePropertyCurve,
    t,
  }: PropertyRowCurveButtonProps = $props()

  const curveVisible = $derived(
    singleCurveMode
      ? (showGraphPane || selectedCurveVisibleExternally) && selectedProperty === property
      : graphProperties.has(property),
  )
  const label = $derived(
    t('timeline.keyframeEditor.showPropertyCurve', {
      property: rowLabel,
      defaultValue: `Show ${rowLabel} curve`,
    }),
  )
</script>

{#if visible}
  <Button
    type="button"
    variant="ghost"
    size="sm"
    class={cn(
      MINI_ICON_BUTTON_CLASS,
      'self-center text-muted-foreground hover:text-foreground',
      curveVisible ? 'text-orange-500 hover:text-orange-400' : 'opacity-30 hover:opacity-60',
    )}
    onclick={(event) => {
      event.stopPropagation()
      if (singleCurveMode) {
        if (curveVisible) {
          onCurveVisibilityChange?.(property, false)
        } else {
          showSinglePropertyCurve(property)
        }
        return
      }
      togglePropertyCurve(property)
    }}
    title={label}
    aria-label={label}
    aria-pressed={curveVisible}
  >
    <LineChart class={MINI_ICON_CLASS} />
  </Button>
{/if}
