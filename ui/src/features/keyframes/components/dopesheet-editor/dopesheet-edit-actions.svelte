<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import MoveHorizontal from 'lucide-svelte/icons/move-horizontal'
  import MoveVertical from 'lucide-svelte/icons/move-vertical'
  import Trash2 from 'lucide-svelte/icons/trash-2'
  import { t } from '$lib/i18n.svelte'
  import { Button } from '@/components/ui/button'
  import MiniZoomControl from './mini-zoom-control.svelte'

  interface DopesheetEditActionsProps {
    disabled: boolean
    hasSelection: boolean
    removeKeyframesAvailable: boolean
    handleRemoveKeyframes: () => void
    horizontalZoomValue: number
    horizontalZoomDisabled: boolean
    setHorizontalZoomValue: (value: number) => void
    resetViewport: () => void
    visualizationMode: 'dopesheet' | 'graph'
    graphVerticalZoomValue: number
    verticalZoomDisabled: boolean
    setGraphVerticalZoomValue: (value: number) => void
  }

  let {
    disabled,
    hasSelection,
    removeKeyframesAvailable,
    handleRemoveKeyframes,
    horizontalZoomValue,
    horizontalZoomDisabled,
    setHorizontalZoomValue,
    resetViewport,
    visualizationMode,
    graphVerticalZoomValue,
    verticalZoomDisabled,
    setGraphVerticalZoomValue,
  }: DopesheetEditActionsProps = $props()
</script>

{#snippet horizontalIcon()}
  <MoveHorizontal class="h-3 w-3" />
{/snippet}

{#snippet verticalIcon()}
  <MoveVertical class="h-3 w-3" />
{/snippet}

<div class="flex items-center rounded-md border border-border/70 bg-background/85 px-0.5 py-0.5">
  <Button
    variant="ghost"
    size="sm"
    class="h-6 w-6 p-0 text-destructive hover:text-destructive"
    onclick={handleRemoveKeyframes}
    disabled={disabled || !hasSelection || !removeKeyframesAvailable}
    title={t('timeline.keyframeEditor.removeSelectedKeyframes')}
  >
    <Trash2 class="h-3 w-3" />
  </Button>
  <div class="mx-0.5 h-3.5 w-px bg-border/80"></div>
  <MiniZoomControl
    icon={horizontalIcon}
    label={t('timeline.keyframeEditor.horizontalZoom')}
    value={horizontalZoomValue}
    disabled={disabled || horizontalZoomDisabled}
    onValueChange={setHorizontalZoomValue}
    onReset={resetViewport}
  />
  {#if visualizationMode === 'graph'}
    <div class="mx-0.5 h-3.5 w-px bg-border/80"></div>
    <MiniZoomControl
      icon={verticalIcon}
      label={t('timeline.keyframeEditor.verticalZoom')}
      value={graphVerticalZoomValue}
      disabled={disabled || verticalZoomDisabled}
      onValueChange={setGraphVerticalZoomValue}
      onReset={() => setGraphVerticalZoomValue(0)}
    />
  {/if}
</div>
