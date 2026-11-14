<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { formatHotkeyBinding } from '@/config/hotkeys'
  import { cn } from '@/shared/ui/cn'
  import { t } from '$lib/i18n.svelte'
  import { getBindingTokens } from './model'

  let {
    binding,
    isActive = false,
    isListening = false,
    isCustom = false,
    onClick,
  }: {
    binding: string
    isActive?: boolean
    isListening?: boolean
    isCustom?: boolean
    onClick?: () => void
  } = $props()

  const tokens = $derived(getBindingTokens(binding))
</script>

{#snippet content()}
  {#if tokens.length > 0}
    <span class="flex flex-wrap items-center justify-end gap-1.5">
      {#each tokens as token (`${binding}-${token}`)}
        <kbd
          class={cn(
            'min-w-8 rounded-lg border px-2.5 py-1 text-[11px] font-mono tracking-wide shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-colors duration-150 ease-out motion-reduce:transition-none',
            isActive
              ? 'border-primary/55 bg-primary/18 text-foreground'
              : 'border-white/8 bg-white/6 text-foreground/90',
            isListening && 'border-primary/60 bg-primary/20 text-primary',
          )}
        >
          {formatHotkeyBinding(token)}
        </kbd>
      {/each}
      {#if isCustom}
        <span
          class="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-primary"
        >
          {t('projects.settings.hotkeys.custom')}
        </span>
      {/if}
    </span>
  {:else}
    <span class="text-xs uppercase tracking-[0.18em] text-muted-foreground">
      {t('projects.settings.hotkeys.unassigned')}
    </span>
  {/if}
{/snippet}

{#if !onClick}
  <div>{@render content()}</div>
{:else}
  <button
    type="button"
    onclick={onClick}
    class={cn(
      'rounded-xl p-1 transition-colors duration-150 ease-out motion-reduce:transition-none',
      isActive ? 'bg-primary/10' : 'hover:bg-white/5',
    )}
  >
    {@render content()}
  </button>
{/if}
