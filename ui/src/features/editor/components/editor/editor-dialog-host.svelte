<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { select } from '$lib/store.svelte'
  import { useClearKeyframesDialogStore } from '@/shared/state/clear-keyframes-dialog'
  import { useTtsGenerateDialogStore } from '@/shared/state/tts-generate-dialog'
  import { useProjectMediaMatchDialogStore } from '@/shared/state/project-media-match-dialog'
  import {
    useEmbeddedSubtitlePickerStore,
    useSubtitleScanProgressStore,
  } from '@/features/editor/deps/media-library'
  import {
    importEmbeddedSubtitleTrackPickerHost,
    importSubtitleScanProgressDialog,
  } from '@/features/editor/deps/media-library-ui'

  let { projectId }: { projectId: string } = $props()

  const clearKeyframesDialogOpen = select(useClearKeyframesDialogStore, (s) => s.isOpen)
  const ttsGenerateDialogOpen = select(useTtsGenerateDialogStore, (s) => s.isOpen)
  const projectMediaMatchDialogOpen = select(
    useProjectMediaMatchDialogStore,
    (s) => s.isOpen && s.projectId === projectId,
  )
  const embeddedSubtitlePickerOpen = select(useEmbeddedSubtitlePickerStore, (s) => s.media !== null)
  const subtitleScanProgressOpen = select(useSubtitleScanProgressStore, (s) => s.open)
</script>

{#if clearKeyframesDialogOpen.current}
  {#await import('../clear-keyframes-dialog.svelte') then { default: ClearKeyframesDialog }}
    <ClearKeyframesDialog />
  {/await}
{/if}
{#if projectMediaMatchDialogOpen.current}
  {#await import('../project-media-match-dialog.svelte') then { default: ProjectMediaMatchDialog }}
    <ProjectMediaMatchDialog {projectId} />
  {/await}
{/if}
{#if ttsGenerateDialogOpen.current}
  {#await import('../tts-generate-dialog.svelte') then { default: TtsGenerateDialog }}
    <TtsGenerateDialog />
  {/await}
{/if}
{#if embeddedSubtitlePickerOpen.current}
  {#await importEmbeddedSubtitleTrackPickerHost() then { default: EmbeddedSubtitleTrackPickerHost }}
    <EmbeddedSubtitleTrackPickerHost />
  {/await}
{/if}
{#if subtitleScanProgressOpen.current}
  {#await importSubtitleScanProgressDialog() then { default: SubtitleScanProgressDialog }}
    <SubtitleScanProgressDialog />
  {/await}
{/if}
