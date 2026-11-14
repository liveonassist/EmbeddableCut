<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import LumaScopeOverlay from './luma-scope-overlay.svelte'
  import VectorScopeOverlay from './vector-scope-overlay.svelte'

  type ScopeOverlayKind = 'waveform' | 'parade' | 'histogram' | 'vectorscope'

  let { kind }: { kind: ScopeOverlayKind } = $props()
</script>

{#if kind === 'vectorscope'}
  <VectorScopeOverlay />
{:else}
  <LumaScopeOverlay parade={kind === 'parade'} histogram={kind === 'histogram'} />
{/if}
