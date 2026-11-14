<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import Check from 'lucide-svelte/icons/check'
  import ChevronDown from 'lucide-svelte/icons/chevron-down'
  import Palette from 'lucide-svelte/icons/palette'
  import Sparkles from 'lucide-svelte/icons/sparkles'
  import Type from 'lucide-svelte/icons/type'
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from '@/components/ui/dropdown-menu'
  import { cn } from '@/shared/ui/cn'
  import { t } from '$lib/i18n.svelte'
  import { select } from '$lib/store.svelte'
  import { useSettingsStore, type CaptionSearchMode } from '@/features/scene-browser/deps/settings'
  import { useSceneBrowserStore } from '@/features/scene-browser/stores/scene-browser-store'

  /**
   * Row-1 toggles: Color mode, and (when not in color mode) the
   * semantic/keyword search-mode switch. Lifted out of the input field so
   * the scene browser header can keep all pill-shaped controls on one
   * line with the scope selector and the analyze menu, and push the
   * actual input surface to a second row.
   */
  let { compact = false }: { compact?: boolean } = $props()

  const colorMode = select(useSceneBrowserStore, (s) => s.colorMode)
  const captionSearchMode = select(useSettingsStore, (s) => s.captionSearchMode)

  const semanticActive = $derived(captionSearchMode.current === 'semantic')

  function setSearchMode(mode: CaptionSearchMode) {
    useSettingsStore.getState().setSetting('captionSearchMode', mode)
  }
</script>

<button
  type="button"
  onclick={() => useSceneBrowserStore.getState().setColorMode(!colorMode.current)}
  class={cn(
    'flex h-6 items-center gap-1 rounded-md border px-2 text-[11px] transition-colors',
    colorMode.current
      ? 'border-primary/60 bg-primary/10 text-primary'
      : 'border-border bg-secondary text-muted-foreground hover:text-foreground',
  )}
  title={colorMode.current
    ? t('sceneBrowser.search.exitColorMode')
    : t('sceneBrowser.search.colorTitle')}
  aria-label={colorMode.current
    ? t('sceneBrowser.search.exitColorMode')
    : t('sceneBrowser.search.colorTitle')}
  aria-pressed={colorMode.current}
>
  <Palette class="h-3 w-3" />{#if !compact}{t('sceneBrowser.search.color')}{/if}
</button>
{#if !colorMode.current}
  <DropdownMenu>
    <DropdownMenuTrigger>
      {#snippet child({ props })}
        <button
          {...props}
          type="button"
          class={cn(
            'flex h-6 items-center gap-1 rounded-md border px-2 text-[11px] transition-colors',
            semanticActive
              ? 'border-primary/60 bg-primary/10 text-primary'
              : 'border-border bg-secondary text-muted-foreground hover:text-foreground',
          )}
          title={semanticActive
            ? t('sceneBrowser.search.semanticTitle')
            : t('sceneBrowser.search.keywordTitle')}
          aria-label={semanticActive
            ? t('sceneBrowser.search.semanticLabel')
            : t('sceneBrowser.search.keywordLabel')}
        >
          {#if semanticActive}<Sparkles class="h-3 w-3" />{:else}<Type
              class="h-3 w-3"
            />{/if}{#if !compact}{semanticActive
              ? t('sceneBrowser.search.semantic')
              : t('sceneBrowser.search.keyword')}{/if}<ChevronDown class="h-3 w-3 opacity-70" />
        </button>
      {/snippet}
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="w-56">
      <DropdownMenuItem onSelect={() => setSearchMode('keyword')}>
        <Type class="mr-2 h-3 w-3" />
        <div class="flex flex-col">
          <span>{t('sceneBrowser.search.keyword')}</span>
          <span class="text-[10px] text-muted-foreground">
            {t('sceneBrowser.search.keywordDescription')}
          </span>
        </div>
        {#if !semanticActive}
          <Check class="ml-auto h-3 w-3" />
        {/if}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => setSearchMode('semantic')}>
        <Sparkles class="mr-2 h-3 w-3" />
        <div class="flex flex-col">
          <span>{t('sceneBrowser.search.semantic')}</span>
          <span class="text-[10px] text-muted-foreground">
            {t('sceneBrowser.search.semanticDescription')}
          </span>
        </div>
        {#if semanticActive}
          <Check class="ml-auto h-3 w-3" />
        {/if}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
{/if}
