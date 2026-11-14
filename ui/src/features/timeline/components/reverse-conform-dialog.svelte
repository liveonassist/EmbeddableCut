<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import { createLogger } from '@/shared/logging/logger'

  const log = createLogger('ReverseConformDialog')

  function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError'
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte'
  import { t } from '$lib/i18n.svelte'
  import { select } from '$lib/store.svelte'
  import { Button } from '@/components/ui/button'
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from '@/components/ui/dialog'
  import { Progress } from '@/components/ui/progress'
  import {
    reverseConformService,
    type ReverseConformResult,
  } from '@/features/timeline/services/reverse-conform-service'
  import { useReverseConformDialogStore } from '@/features/timeline/stores/reverse-conform-dialog-store'
  import { commitPreparedReverseItems } from '@/features/timeline/stores/actions/item-actions'
  import { usePlaybackStore } from '@/shared/state/playback'

  const request = select(useReverseConformDialogStore, (state) => state.request)
  const close = select(useReverseConformDialogStore, (state) => state.close)
  const useProxy = select(usePlaybackStore, (state) => state.useProxy)
  let abortController: AbortController | null = null
  let userCancelled = false
  let progress = $state(0)
  let clipIndex = $state(0)
  let error = $state<string | null>(null)
  let isCancelling = $state(false)

  const clipCount = $derived(request.current?.videoItems.length ?? 0)
  const title = $derived(
    error
      ? t('timeline.reverseConform.titleFailed')
      : isCancelling
        ? t('timeline.reverseConform.titleCancelling')
        : t('timeline.reverseConform.titlePreparing'),
  )
  const description = $derived.by(() => {
    if (!request.current) return ''
    if (error) return error
    if (isCancelling) return t('timeline.reverseConform.cancellingDescription')
    const currentClip = Math.min(clipIndex + 1, clipCount)
    return t('timeline.reverseConform.progressDescription', {
      current: currentClip,
      total: clipCount,
    })
  })

  $effect(() => {
    const currentRequest = request.current
    const currentUseProxy = useProxy.current
    const closeRequest = close.current
    if (!currentRequest) return

    const controller = new AbortController()
    abortController = controller
    userCancelled = false
    untrack(() => {
      progress = 0
      clipIndex = 0
      error = null
      isCancelling = false
    })

    void (async () => {
      const results: ReverseConformResult[] = []
      try {
        for (let index = 0; index < currentRequest.videoItems.length; index += 1) {
          const item = currentRequest.videoItems[index]!
          clipIndex = index
          const result = await reverseConformService.prepareVideo(
            item,
            currentRequest.timelineFps,
            {
              quality: 'preview',
              useProxy: currentUseProxy,
              signal: controller.signal,
              onProgress: (clipProgress) => {
                const aggregate =
                  ((index + clipProgress) / currentRequest.videoItems.length) * 100
                progress = Math.max(0, Math.min(99, aggregate))
              },
            },
          )
          results.push(result)
          progress = ((index + 1) / currentRequest.videoItems.length) * 100
        }

        if (controller.signal.aborted) return
        commitPreparedReverseItems(currentRequest.items, results)
        closeRequest(currentRequest.id)
      } catch (caught) {
        if (isAbortError(caught) || controller.signal.aborted) {
          // Only dismiss the request when the user explicitly cancelled.
          // Effect cleanup also aborts (e.g. when the request or proxy setting
          // changes); closing here would tear down the request the replacement
          // effect run is still working with.
          if (userCancelled) {
            closeRequest(currentRequest.id)
          }
          return
        }
        log.warn('Reverse conform dialog failed', { error: caught })
        error =
          caught instanceof Error ? caught.message : t('timeline.reverseConform.couldNotPrepare')
      }
    })()

    return () => {
      controller.abort()
      if (abortController === controller) {
        abortController = null
      }
    }
  })

  const handleCancel = () => {
    isCancelling = true
    userCancelled = true
    abortController?.abort()
  }

  const handleCloseError = () => {
    close.current(request.current?.id)
  }
</script>

<Dialog open={request.current !== null}>
  <DialogContent
    hideCloseButton
    class="max-w-md"
    onEscapeKeydown={(event) => event.preventDefault()}
    onInteractOutside={(event) => event.preventDefault()}
  >
    <DialogHeader>
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>{description}</DialogDescription>
    </DialogHeader>
    {#if !error}
      <div class="space-y-2">
        <Progress value={progress} />
        <div class="text-xs tabular-nums text-muted-foreground">
          {Math.round(progress)}%
        </div>
      </div>
    {/if}
    <DialogFooter>
      {#if error}
        <Button type="button" onclick={handleCloseError}>
          {t('common.close')}
        </Button>
      {:else}
        <Button type="button" variant="secondary" onclick={handleCancel} disabled={isCancelling}>
          {t('common.cancel')}
        </Button>
      {/if}
    </DialogFooter>
  </DialogContent>
</Dialog>
