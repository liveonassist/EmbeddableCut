<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import Link2 from 'lucide-svelte/icons/link-2'

  interface Props {
    label: string
    badge?: Snippet
    isLinked: boolean
    linkedSyncOffsetLabel: string | null
    showLinkIcon?: boolean
    showLabel?: boolean
    showSyncOffset?: boolean
  }

  let {
    label,
    badge,
    isLinked,
    linkedSyncOffsetLabel,
    showLinkIcon = true,
    showLabel = true,
    showSyncOffset = true,
  }: Props = $props()
</script>

<div class="flex min-w-0 items-center gap-1.5 overflow-hidden">
  {#if linkedSyncOffsetLabel}<span
      class="shrink-0 rounded bg-destructive/90 px-1.5 py-0.5 font-mono text-[10px] font-bold leading-none text-destructive-foreground"
      hidden={!showSyncOffset}
      title={`Linked clips out of sync by ${linkedSyncOffsetLabel}`}>{linkedSyncOffsetLabel}</span
    >{/if}{#if isLinked}<span
      class={`inline-flex shrink-0 items-center justify-center rounded p-0.5 ${
        linkedSyncOffsetLabel
          ? 'bg-destructive/85 text-destructive-foreground'
          : 'bg-black/55 text-white/90'
      }`}
      hidden={!showLinkIcon}
      title={linkedSyncOffsetLabel
        ? `Linked audio/video pair out of sync by ${linkedSyncOffsetLabel}`
        : 'Linked audio/video pair'}><Link2 class="h-3 w-3" /></span
    >{/if}{@render badge?.()}<span class="min-w-0 truncate" hidden={!showLabel}>{label}</span>
</div>
