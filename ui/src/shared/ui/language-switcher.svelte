<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  function getLanguageButtonLabel(languageCode: string): string {
    return languageCode.split('-')[0]?.slice(0, 2).toUpperCase() || 'EN'
  }

  interface LanguageSwitcherProps {
    size?: 'sm' | 'md'
    align?: 'start' | 'end'
    side?: 'top' | 'right' | 'bottom' | 'left'
  }
</script>

<script lang="ts">
  import Check from '@lucide/svelte/icons/check'
  import { Button } from '@/components/ui/button'
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from '@/components/ui/dropdown-menu'
  import { cn } from '@/shared/ui/cn'
  import { changeAppLanguage } from '@/i18n'
  import { SUPPORTED_LANGUAGES } from '@/i18n/languages'
  import { locale, t } from '$lib/i18n.svelte'

  let { size = 'sm', align = 'end', side = 'bottom' }: LanguageSwitcherProps = $props()

  const currentLanguage = $derived(locale.current)
  const buttonClass = $derived(
    size === 'md'
      ? 'h-10 w-10 font-mono text-xs font-semibold leading-none tracking-normal'
      : 'h-7 w-7 font-mono text-[10px] font-semibold leading-none tracking-normal',
  )
</script>

<DropdownMenu>
  <DropdownMenuTrigger>
    {#snippet child({ props })}
      <Button
        {...props}
        variant="outline"
        size="icon"
        class={buttonClass}
        data-tooltip={t('language.label')}
        data-tooltip-side={side}
        aria-label={t('language.ariaLabel')}
      >
        {getLanguageButtonLabel(currentLanguage)}
      </Button>
    {/snippet}
  </DropdownMenuTrigger>
  <DropdownMenuContent {align} class="w-48">
    {#each SUPPORTED_LANGUAGES as lng (lng.code)}
      {@const active = lng.code === currentLanguage}
      <DropdownMenuItem
        onSelect={() => {
          void changeAppLanguage(lng.code)
        }}
        class="justify-between"
      >
        <span class="flex min-w-0 flex-col">
          <span class="truncate">{lng.nativeName}</span>
          <span class="truncate text-[11px] text-muted-foreground">
            {lng.englishName}
          </span>
        </span>
        <Check class={cn('h-4 w-4', active ? 'opacity-100' : 'opacity-0')} />
      </DropdownMenuItem>
    {/each}
  </DropdownMenuContent>
</DropdownMenu>
