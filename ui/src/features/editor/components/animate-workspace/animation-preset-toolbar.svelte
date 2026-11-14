<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import ListFilter from 'lucide-svelte/icons/list-filter'
  import Plus from 'lucide-svelte/icons/plus'
  import Search from 'lucide-svelte/icons/search'
  import X from 'lucide-svelte/icons/x'
  import { Button } from '@/components/ui/button'
  import { Input } from '@/components/ui/input'
  import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

  interface AnimationPresetToolbarProps {
    /** Whether the selection carries anything capturable (gates the save button). */
    canCapture: boolean
    searchQuery: string
    onSearchQueryChange: (value: string) => void
    compatibleOnly: boolean
    onToggleCompatibleOnly: () => void
    onOpenSaveDialog: () => void
    t: (key: string, options?: Record<string, unknown>) => string
  }

  /** Library header (title + save) and the search / compatible-only filter row. */
  let {
    canCapture,
    searchQuery,
    onSearchQueryChange,
    compatibleOnly,
    onToggleCompatibleOnly,
    onOpenSaveDialog,
    t,
  }: AnimationPresetToolbarProps = $props()
</script>

<div class="flex items-center justify-between border-b border-border px-3 py-2">
  <span class="text-xs font-medium text-muted-foreground">
    {t('editor.animatePresets.title')}
  </span>
  <Tooltip>
    <TooltipTrigger>
      {#snippet child({ props })}
        <span {...props}>
          <Button
            variant="ghost"
            size="sm"
            class="h-6 gap-1 px-1.5 text-[11px]"
            disabled={!canCapture}
            onclick={onOpenSaveDialog}
          >
            <Plus class="h-3 w-3" />
            {t('editor.animatePresets.saveButtonLong')}
          </Button>
        </span>
      {/snippet}
    </TooltipTrigger>
    {#if !canCapture}
      <TooltipContent>{t('editor.animatePresets.noAnimationToSave')}</TooltipContent>
    {/if}
  </Tooltip>
</div>

<div class="flex items-center gap-1.5 border-b border-border/70 p-2">
  <div class="relative min-w-0 flex-1">
    <Search
      class="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
      aria-hidden="true"
    />
    <Input
      type="search"
      name="animation-preset-search"
      value={searchQuery}
      oninput={(event) => onSearchQueryChange(event.currentTarget.value)}
      placeholder={t('editor.animatePresets.searchPlaceholder')}
      aria-label={t('editor.animatePresets.searchPlaceholder')}
      autocomplete="off"
      class="h-7 pl-7 pr-7 text-[11px]"
    />
    {#if searchQuery.length > 0}
      <button
        type="button"
        aria-label={t('editor.animatePresets.clearSearch')}
        class="absolute right-1 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        onclick={() => onSearchQueryChange('')}
      >
        <X class="h-3 w-3" />
      </button>
    {/if}
  </div>
  <Button
    type="button"
    variant={compatibleOnly ? 'secondary' : 'ghost'}
    size="sm"
    class="h-7 shrink-0 gap-1 px-2 text-[10px]"
    aria-pressed={compatibleOnly}
    title={t('editor.animatePresets.compatibleOnlyHint')}
    onclick={onToggleCompatibleOnly}
  >
    <ListFilter class="h-3 w-3" />
    {t('editor.animatePresets.compatibleOnly')}
  </Button>
</div>
