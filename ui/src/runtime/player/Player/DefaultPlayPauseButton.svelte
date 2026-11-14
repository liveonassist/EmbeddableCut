<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  let { isPlaying, onToggle }: { isPlaying: boolean; onToggle: () => void } = $props()
</script>

<button
  onclick={onToggle}
  class="p-2 rounded-full hover:bg-white/20 transition-colors"
  aria-label={isPlaying ? 'Pause' : 'Play'}
>
  {#if isPlaying}
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </svg>
  {:else}
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  {/if}
</button>
