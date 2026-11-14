<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  const MODIFIER_TOKENS = new Set(['mod', 'alt', 'shift'])
</script>

<script lang="ts">
  /** Full-width keyboard preview — ANSI layout with navigation + arrow cluster. */
  import { formatHotkeyBinding } from '@/config/hotkeys'
  import KeyCap from './key-cap.svelte'
  import { KEYBOARD_ROWS, getBindingTokens, type KeyboardKeySpec } from './model'

  let {
    activeBinding,
    layerTokens,
    hoverTokens,
    tokenLabels,
    labelForToken,
    isNativeLayout,
    ariaLabel,
    emptyKeyLabel,
    layoutFallbackNote,
    onTokenHover,
    onTokenClick,
  }: {
    activeBinding: string
    layerTokens: ReadonlySet<string>
    hoverTokens: ReadonlySet<string>
    tokenLabels: ReadonlyMap<string, string>
    labelForToken: (token: string) => string | null
    isNativeLayout: boolean
    ariaLabel: string
    emptyKeyLabel: (keyLabel: string) => string
    layoutFallbackNote: string
    onTokenHover: (token: string | null) => void
    onTokenClick: (token: string) => void
  } = $props()

  const activeTokens = $derived(
    new Set(getBindingTokens(activeBinding).filter((t) => !MODIFIER_TOKENS.has(t))),
  )
</script>

<!--
  Modifier caps are never actionable (handleTokenClick ignores them), so they
  stay non-interactive — no click/hover/aria, no tab stop.
-->
{#snippet row(keys: readonly KeyboardKeySpec[])}
  {#each keys as keySpec (keySpec.id)}
    {@const token = keySpec.token}
    {@const interactive = Boolean(token && !MODIFIER_TOKENS.has(token))}
    {@const keyLabel = token ? (labelForToken(token) ?? undefined) : undefined}
    {@const printedLabel =
      keyLabel ?? keySpec.label ?? (token ? formatHotkeyBinding(token) : '')}
    {@const command = token ? tokenLabels.get(token) : undefined}
    {@const ariaLabelForKey = interactive
      ? command
        ? `${printedLabel}: ${command}`
        : emptyKeyLabel(printedLabel)
      : undefined}
    <KeyCap
      {keySpec}
      displayLabel={keyLabel}
      ariaLabel={ariaLabelForKey}
      isActive={token
        ? hoverTokens.size > 0
          ? hoverTokens.has(token)
          : activeTokens.has(token)
        : false}
      isLayerKey={token ? layerTokens.has(token) : false}
      tooltip={interactive ? command : undefined}
      onClick={interactive ? () => onTokenClick(token!) : undefined}
      onMouseEnter={interactive ? () => onTokenHover(token!) : undefined}
      onMouseLeave={interactive ? () => onTokenHover(null) : undefined}
    />
  {/each}
{/snippet}

<div class="overflow-x-auto pb-1">
  <div
    role="group"
    aria-label={ariaLabel}
    class="mx-auto min-w-[760px] max-w-[1060px] space-y-[5px] xl:min-w-[900px]"
  >
    {#each KEYBOARD_ROWS as pair, index (index)}
      <div class="flex gap-3">
        <!-- Main alphanumeric section -->
        <div class="flex min-w-0 flex-[15] gap-[5px]">{@render row(pair.main)}</div>
        <!-- Navigation / arrow cluster -->
        <div class="flex min-w-0 flex-[3] gap-[5px]">
          {#if pair.nav.length > 0}{@render row(pair.nav)}{/if}
        </div>
      </div>
    {/each}
  </div>
  {#if !isNativeLayout}
    <p class="mx-auto mt-2 max-w-[1060px] text-center text-[10px] text-muted-foreground">
      {layoutFallbackNote}
    </p>
  {/if}
</div>
