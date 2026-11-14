<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /**
   * Dedicated dialog for the render queue and the saved export files. The Queue
   * tab shows this session's jobs; the Exports tab browses the project's
   * `projects/<id>/exports/` folder and lets you download / delete them.
   */
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
  } from '@/components/ui/dialog'
  import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
  import { useRenderQueueStore } from '@/features/export/stores/render-queue-store'
  import { select } from '$lib/store.svelte'
  import { t } from '$lib/i18n.svelte'
  import { RenderQueueList } from '../render-queue-panel'
  import type { ExportsDialogProps } from '../types'
  import ExportsList from './exports-list.svelte'

  let { open, onClose, projectId }: ExportsDialogProps = $props()

  const activeCount = select(
    useRenderQueueStore,
    (s) => s.jobs.filter((j) => j.status === 'queued' || j.status === 'rendering').length,
  )
</script>

<Dialog
  bind:open={
    () => open,
    (next) => {
      if (!next) onClose()
    }
  }
>
  <DialogContent class="sm:max-w-[600px]">
    <DialogHeader>
      <DialogTitle>{t('export.renderQueue.dialogTitle')}</DialogTitle>
      <DialogDescription>{t('export.renderQueue.description')}</DialogDescription>
    </DialogHeader>

    <Tabs defaultValue={activeCount.current > 0 ? 'queue' : 'exports'}>
      <TabsList class="grid w-full grid-cols-2">
        <TabsTrigger value="queue" class="gap-1.5">
          {t('export.renderQueue.tabQueue')}
          {#if activeCount.current > 0}
            <span
              class="rounded-full bg-primary px-1.5 text-[10px] font-medium leading-tight text-primary-foreground"
            >
              {activeCount.current}
            </span>
          {/if}
        </TabsTrigger>
        <TabsTrigger value="exports">{t('export.renderQueue.tabExports')}</TabsTrigger>
      </TabsList>

      <TabsContent value="queue" class="mt-4">
        <RenderQueueList />
      </TabsContent>
      <TabsContent value="exports" class="mt-4">
        <ExportsList {projectId} />
      </TabsContent>
    </Tabs>
  </DialogContent>
</Dialog>
