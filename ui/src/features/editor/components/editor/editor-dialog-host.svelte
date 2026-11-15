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
  import { useFeatures } from '../../../../extensions/feature-gate.svelte'

  let { projectId }: { projectId: string } = $props()

  const clearKeyframesDialogOpen = select(useClearKeyframesDialogStore, (s) => s.isOpen)
  const ttsGenerateDialogOpen = select(useTtsGenerateDialogStore, (s) => s.isOpen)
  const projectMediaMatchDialogOpen = select(
    useProjectMediaMatchDialogStore,
    (s) => s.isOpen && s.projectId === projectId,
  )
  const embeddedSubtitlePickerOpen = select(useEmbeddedSubtitlePickerStore, (s) => s.media !== null)
  const subtitleScanProgressOpen = select(useSubtitleScanProgressStore, (s) => s.open)
  // A host that fixes the project's size or frame rate is never asked to match a clip's.
  const features = useFeatures()
  const projectMatchAllowed = $derived(
    features.mode(['project.size', 'project.frame-rate']) === 'on',
  )
  $effect(() => {
    if (projectMediaMatchDialogOpen.current && !projectMatchAllowed) {
      useProjectMediaMatchDialogStore.getState().resolveProjectMediaMatch('keep-current')
    }
  })

  // Loaded on first use; a loader in the script lets static analysis see the import.
  const loadClearKeyframesDialog = () => import('../clear-keyframes-dialog.svelte')
  const loadProjectMediaMatchDialog = () => import('../project-media-match-dialog.svelte')
  const loadTtsGenerateDialog = () => import('../tts-generate-dialog.svelte')
</script>

{#if clearKeyframesDialogOpen.current}
  {#await loadClearKeyframesDialog() then { default: ClearKeyframesDialog }}
    <ClearKeyframesDialog />
  {/await}
{/if}
{#if projectMediaMatchDialogOpen.current && projectMatchAllowed}
  {#await loadProjectMediaMatchDialog() then { default: ProjectMediaMatchDialog }}
    <ProjectMediaMatchDialog {projectId} />
  {/await}
{/if}
{#if ttsGenerateDialogOpen.current}
  {#await loadTtsGenerateDialog() then { default: TtsGenerateDialog }}
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
