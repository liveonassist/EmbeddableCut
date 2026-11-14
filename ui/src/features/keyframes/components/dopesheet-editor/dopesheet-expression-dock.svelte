<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import BookOpenText from 'lucide-svelte/icons/book-open-text'
  import Braces from 'lucide-svelte/icons/braces'
  import Trash2 from 'lucide-svelte/icons/trash-2'
  import { Button } from '@/components/ui/button'
  import { cn } from '@/shared/ui/cn'
  import DopesheetExpressionPresetsMenu from './dopesheet-expression-menus.svelte'
  import DopesheetExpressionGuide from './dopesheet-expression-guide.svelte'
  import PickWhipIcon from './pick-whip-icon.svelte'
  import { EXPRESSION_DOCK_HEIGHT, type DopesheetExpressionDockProps } from './dopesheet-expression-dock'

  let {
    property,
    propertyLabel,
    source,
    enabled,
    preExpressionDisplay,
    postExpressionDisplay,
    error,
    hasStoredExpression,
    pickingReference,
    rootRef,
    textareaRef,
    onSourceChange,
    onSelectionChange,
    onToggleEnabled,
    onApplyPreset,
    onReferencePointerDown,
    onToggleReferencePicking,
    onRemove,
    onCancel,
    onApply,
  }: DopesheetExpressionDockProps = $props()

  let showSyntaxGuide = $state(false)
  const getSelection = () => ({
    selectionStart: textareaRef.current?.selectionStart ?? source.length,
    selectionEnd: textareaRef.current?.selectionEnd ?? source.length,
  })
</script>

<!-- svelte-ignore a11y_no_redundant_roles -->
<section
  bind:this={rootRef.current}
  class="flex flex-shrink-0 flex-col border-t border-border bg-background/95 shadow-[0_-8px_24px_rgba(0,0,0,0.22)]"
  style:height="{EXPRESSION_DOCK_HEIGHT}px"
  role="region"
  aria-label="{propertyLabel} expression editor"
  data-testid="dopesheet-expression-dock"
>
  <div class="flex h-8 flex-shrink-0 items-center gap-2 border-b border-border/60 px-2">
    <Braces class="h-3.5 w-3.5 text-sky-400" />
    <span class="text-[11px] font-medium text-foreground">{propertyLabel} expression</span>
    <span
      class="rounded bg-sky-500/10 px-1 py-0.5 text-[8px] font-medium uppercase tracking-wide text-sky-300"
    >
      Advanced
    </span>
    <Button
      type="button"
      variant="ghost"
      size="sm"
      class={cn('h-6 px-2 text-[10px]', enabled ? 'text-sky-300' : 'text-muted-foreground')}
      aria-pressed={enabled}
      onclick={onToggleEnabled}
    >
      {enabled ? 'Enabled' : 'Disabled'}
    </Button>
    <div class="ml-auto flex items-center gap-1">
      {#if hasStoredExpression}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="h-6 gap-1 px-2 text-[10px] text-destructive hover:text-destructive"
          onclick={onRemove}
        >
          <Trash2 class="h-3 w-3" />
          Remove
        </Button>
      {/if}
      <Button type="button" variant="ghost" size="sm" class="h-6 px-2 text-[10px]" onclick={onCancel}>
        Cancel
      </Button>
      <Button
        type="button"
        size="sm"
        class="h-6 px-2 text-[10px]"
        disabled={Boolean(error)}
        onclick={onApply}
      >
        Apply
      </Button>
    </div>
  </div>

  <div class="grid min-h-0 flex-1 grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] gap-2 p-2">
    <div class="flex min-w-0 flex-col gap-1">
      {#if showSyntaxGuide}
        <DopesheetExpressionGuide
          {property}
          {onApplyPreset}
          onClose={() => (showSyntaxGuide = false)}
        />
      {:else}
        <div class="grid grid-cols-2 gap-1 text-[9px]">
          <div class="min-w-0 rounded border border-border/70 bg-background/70 px-2 py-1">
            <div class="text-muted-foreground">Pre-expression</div>
            <div class="truncate font-mono text-foreground">{preExpressionDisplay}</div>
          </div>
          <div class="min-w-0 rounded border border-border/70 bg-background/70 px-2 py-1">
            <div class="text-muted-foreground">Post-expression</div>
            <div class="truncate font-mono text-foreground">{postExpressionDisplay}</div>
          </div>
        </div>

        <div class="flex min-w-0 items-center gap-1">
          <DopesheetExpressionPresetsMenu {property} onSelect={onApplyPreset} />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            class={cn(
              'h-7 cursor-crosshair gap-1 px-2 text-[10px] text-muted-foreground hover:text-sky-300',
              pickingReference && 'bg-sky-500/10 text-sky-300',
            )}
            aria-label="Pick a reference property for {propertyLabel}"
            aria-pressed={pickingReference}
            title="Click, then choose a highlighted property; or drag directly"
            onpointerdown={(event: PointerEvent & { currentTarget: HTMLButtonElement }) => {
              event.preventDefault()
              event.stopPropagation()
              const selection = getSelection()
              onReferencePointerDown(event, selection.selectionStart, selection.selectionEnd)
            }}
            onclick={(event: MouseEvent) => {
              event.stopPropagation()
              const selection = getSelection()
              onToggleReferencePicking(selection.selectionStart, selection.selectionEnd)
            }}
          >
            <PickWhipIcon class="h-3 w-3" />
            {pickingReference ? 'Choose property…' : 'Pick property'}
          </Button>
          {#if pickingReference}
            <span class="truncate text-[9px] text-sky-300" role="status">
              Click a highlighted row · Esc to cancel
            </span>
          {/if}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            class="h-7 gap-1 px-2 text-[10px] text-muted-foreground hover:text-sky-300"
            onclick={() => (showSyntaxGuide = true)}
            aria-label="Open expression syntax guide"
          >
            <BookOpenText class="h-3 w-3" />
            Syntax
          </Button>
        </div>

        <div
          class="truncate rounded bg-background/60 px-2 py-1 font-mono text-[8px] text-muted-foreground"
        >
          value · time · frame · sin/cos/abs · min/max/clamp/lerp · [x, y]
        </div>
      {/if}
    </div>

    <div class="flex min-h-0 min-w-0 flex-col gap-1">
      <!-- svelte-ignore a11y_autofocus -->
      <textarea
        bind:this={textareaRef.current}
        autofocus
        autocomplete="off"
        data-bwignore="true"
        spellcheck={false}
        value={source}
        oninput={(event) =>
          onSourceChange(
            event.currentTarget.value,
            event.currentTarget.selectionStart,
            event.currentTarget.selectionEnd,
          )}
        onselect={(event) =>
          onSelectionChange(event.currentTarget.selectionStart, event.currentTarget.selectionEnd)}
        onkeydown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault()
            if (!error) onApply()
          }
        }}
        class={cn(
          'min-h-0 flex-1 resize-none rounded border bg-background px-2 py-1.5 font-mono text-[10px] leading-4 text-foreground outline-none focus:border-sky-500/70',
          error ? 'border-red-500/60' : 'border-border',
        )}
        aria-label="{propertyLabel} expression source"
      ></textarea>
      {#if error}
        <div
          class="truncate rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-[9px] text-red-300"
        >
          {error}
        </div>
      {:else}
        <div class="text-right text-[9px] text-muted-foreground">Ctrl/Cmd+Enter to apply</div>
      {/if}
    </div>
  </div>
</section>
