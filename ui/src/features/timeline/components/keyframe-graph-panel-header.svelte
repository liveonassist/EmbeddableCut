<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import Maximize2 from '@lucide/svelte/icons/maximize-2'
  import Minimize2 from '@lucide/svelte/icons/minimize-2'
  import X from '@lucide/svelte/icons/x'
  import { Button } from '@/components/ui/button'
  import { cn } from '@/shared/ui/cn'
  import { t } from '$lib/i18n.svelte'
  import type { KeyframeGraphPanelHeaderProps } from './keyframe-graph-panel-header'

  let {
    surface,
    selectedItemForEditor,
    effectiveEditorMode,
    splitView,
    setEditorMode,
    isFocusMode,
    onFocusModeChange,
    showCloseButton,
    onClose,
  }: KeyframeGraphPanelHeaderProps = $props()

  const focusModeLabel = $derived(
    t(
      isFocusMode
        ? 'timeline.keyframeEditor.exitFocusMode'
        : 'timeline.keyframeEditor.enterFocusMode',
    ),
  )
</script>

{#if surface !== 'edit'}
  <div
    class="h-8 flex items-center justify-between px-3 bg-secondary/30 border-b border-border"
  >
    <div class="flex items-center gap-2">
      <span class="text-xs font-medium text-muted-foreground"
        >{surface === 'motion'
          ? t('editor.compose.motionCurves')
          : t('timeline.keyframeEditor.title')}{#if selectedItemForEditor}<span
            class="ml-2 text-foreground"
            >- {selectedItemForEditor.label || selectedItemForEditor.type}<span
              class="ml-1 text-muted-foreground">({selectedItemForEditor.id.slice(0, 8)})</span
            ></span
          >{/if}</span
      >
    </div>

    <div
      class={cn(
        'flex items-center gap-0.5',
        surface === 'default' && 'rounded-md border border-border/60 bg-background/50 p-0.5',
      )}
      role={surface === 'default' ? 'tablist' : undefined}
      aria-label={surface === 'motion'
        ? t('editor.compose.motionCurves')
        : t('timeline.keyframeEditor.title')}
    >
      {#if surface === 'default'}
        <Button
          variant={effectiveEditorMode === 'dopesheet' ? 'secondary' : 'ghost'}
          size="sm"
          class="h-6 px-2 text-[11px]"
          role="tab"
          aria-selected={effectiveEditorMode === 'dopesheet'}
          title={t('timeline.keyframeEditor.legend.sheetMode')}
          aria-label={t('timeline.keyframeEditor.legend.sheetMode')}
          onclick={(e: MouseEvent) => {
            e.stopPropagation()
            setEditorMode('dopesheet')
          }}
        >
          {t('timeline.keyframeEditor.sheet')}
        </Button>
        <Button
          variant={effectiveEditorMode === 'graph' ? 'secondary' : 'ghost'}
          size="sm"
          class="h-6 px-2 text-[11px]"
          role="tab"
          aria-selected={effectiveEditorMode === 'graph'}
          title={t('timeline.keyframeEditor.legend.graphMode')}
          aria-label={t('timeline.keyframeEditor.legend.graphMode')}
          onclick={(e: MouseEvent) => {
            e.stopPropagation()
            setEditorMode('graph')
          }}
        >
          {t('timeline.keyframeEditor.graph')}
        </Button>
        {#if splitView}
          <Button
            variant={effectiveEditorMode === 'split' ? 'secondary' : 'ghost'}
            size="sm"
            class="h-6 px-2 text-[11px]"
            role="tab"
            aria-selected={effectiveEditorMode === 'split'}
            title={t('timeline.keyframeEditor.split')}
            aria-label={t('timeline.keyframeEditor.split')}
            onclick={(e: MouseEvent) => {
              e.stopPropagation()
              setEditorMode('split')
            }}
          >
            {t('timeline.keyframeEditor.split')}
          </Button>
        {/if}
      {/if}
      {#if onFocusModeChange}
        <Button
          variant={isFocusMode ? 'secondary' : 'ghost'}
          size="icon"
          class="ml-0.5 h-6 w-6 p-0"
          title={focusModeLabel}
          aria-label={focusModeLabel}
          aria-pressed={isFocusMode}
          onclick={(event: MouseEvent) => {
            event.stopPropagation()
            onFocusModeChange(!isFocusMode)
          }}
        >
          {#if isFocusMode}
            <Minimize2 class="h-3 w-3" />
          {:else}
            <Maximize2 class="h-3 w-3" />
          {/if}
        </Button>
      {/if}
      {#if showCloseButton}
        <Button
          variant="ghost"
          size="icon"
          class="h-5 w-5 p-0"
          aria-label={t('common.close')}
          onclick={(e: MouseEvent) => {
            e.stopPropagation()
            onClose()
          }}
        >
          <X class="w-3 h-3" />
        </Button>
      {/if}
    </div>
  </div>
{/if}
