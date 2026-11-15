<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import {
    isSettingHidden,
    isSettingLocked,
    type AppSettingKey,
  } from '@/features/settings/stores/settings-policy'

  /**
   * A control for settings the host's policy may hide or lock
   * (`EditorOptions.settings`). Hidden, it doesn't render; locked, it renders
   * inert and dimmed, showing the value the host chose.
   */
  let { keys, children }: { keys: readonly AppSettingKey[]; children: Snippet } = $props()

  const hidden = $derived(keys.some(isSettingHidden))
  const locked = $derived(keys.some(isSettingLocked))
</script>

{#if !hidden}
  {#if locked}
    <div class="contents *:opacity-50" inert aria-disabled="true">
      {@render children()}
    </div>
  {:else}
    {@render children()}
  {/if}
{/if}
