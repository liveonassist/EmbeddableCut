<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { select } from '$lib/store.svelte'
  import {
    importBentoLayoutDialog,
    importFillerRemovalDialog,
    importReverseConformDialog,
    importSilenceRemovalDialog,
    useBentoLayoutDialogStore,
    useFillerRemovalDialogStore,
    useReverseConformDialogStore,
    useSilenceRemovalDialogStore,
  } from '@/features/editor/deps/timeline-ui'

  const bentoLayoutOpen = select(useBentoLayoutDialogStore, (s) => s.isOpen)
  const reverseConformOpen = select(useReverseConformDialogStore, (s) => s.request !== null)
  const silenceRemovalOpen = select(useSilenceRemovalDialogStore, (s) => s.isOpen)
  const fillerRemovalOpen = select(useFillerRemovalDialogStore, (s) => s.isOpen)
</script>

{#if bentoLayoutOpen.current}
  {#await importBentoLayoutDialog() then { default: BentoLayoutDialog }}
    <BentoLayoutDialog />
  {/await}
{/if}
{#if reverseConformOpen.current}
  {#await importReverseConformDialog() then { default: ReverseConformDialog }}
    <ReverseConformDialog />
  {/await}
{/if}
{#if silenceRemovalOpen.current}
  {#await importSilenceRemovalDialog() then { default: SilenceRemovalDialog }}
    <SilenceRemovalDialog />
  {/await}
{/if}
{#if fillerRemovalOpen.current}
  {#await importFillerRemovalDialog() then { default: FillerRemovalDialog }}
    <FillerRemovalDialog />
  {/await}
{/if}
