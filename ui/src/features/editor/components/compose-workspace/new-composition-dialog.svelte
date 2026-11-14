<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from '@/components/ui/dialog'
  import { Button } from '@/components/ui/button'
  import { Input } from '@/components/ui/input'
  import { Label } from '@/components/ui/label'
  import {
    createCompositeComposition,
    type CreateCompositeCompositionOptions,
  } from '@/features/editor/deps/timeline-motion'

  interface NewCompositionDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    defaults: { width: number; height: number; fps: number }
  }

  let { open, onOpenChange, defaults }: NewCompositionDialogProps = $props()

  let name = $state('')
  // svelte-ignore state_referenced_locally
  let width = $state(defaults.width)
  // svelte-ignore state_referenced_locally
  let height = $state(defaults.height)
  // svelte-ignore state_referenced_locally
  let fps = $state(defaults.fps)
  let durationSeconds = $state(10)

  $effect.pre(() => {
    if (!open) return
    name = ''
    width = defaults.width
    height = defaults.height
    fps = defaults.fps
    durationSeconds = 10
  })

  function createComposition() {
    const options: CreateCompositeCompositionOptions = {
      name,
      width,
      height,
      fps,
      durationInFrames: Math.max(1, Math.round(fps * durationSeconds)),
    }
    createCompositeComposition(options)
    onOpenChange(false)
  }
</script>

<Dialog bind:open={() => open, onOpenChange}>
  <DialogContent class="sm:max-w-md">
    <DialogHeader>
      <DialogTitle>{t('editor.compose.dialog.title')}</DialogTitle>
      <DialogDescription>{t('editor.compose.dialog.description')}</DialogDescription>
    </DialogHeader>

    <div class="grid gap-4 py-2">
      <div class="grid gap-1.5">
        <Label for="compose-name">{t('editor.compose.dialog.name')}</Label>
        <!-- svelte-ignore a11y_autofocus -->
        <Input
          id="compose-name"
          bind:value={name}
          placeholder={t('editor.compose.dialog.namePlaceholder')}
          autofocus
        />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="grid gap-1.5">
          <Label for="compose-width">{t('editor.compose.dialog.width')}</Label>
          <Input
            id="compose-width"
            type="number"
            min={1}
            max={7680}
            value={width}
            oninput={(event) => (width = Number(event.currentTarget.value))}
          />
        </div>
        <div class="grid gap-1.5">
          <Label for="compose-height">{t('editor.compose.dialog.height')}</Label>
          <Input
            id="compose-height"
            type="number"
            min={1}
            max={4320}
            value={height}
            oninput={(event) => (height = Number(event.currentTarget.value))}
          />
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="grid gap-1.5">
          <Label for="compose-fps">{t('editor.compose.dialog.frameRate')}</Label>
          <Input
            id="compose-fps"
            type="number"
            min={1}
            max={120}
            value={fps}
            oninput={(event) => (fps = Number(event.currentTarget.value))}
          />
        </div>
        <div class="grid gap-1.5">
          <Label for="compose-duration">{t('editor.compose.dialog.durationSeconds')}</Label>
          <Input
            id="compose-duration"
            type="number"
            min={0.1}
            max={3600}
            step={0.1}
            value={durationSeconds}
            oninput={(event) => (durationSeconds = Number(event.currentTarget.value))}
          />
        </div>
      </div>
    </div>

    <DialogFooter>
      <Button variant="outline" onclick={() => onOpenChange(false)}>
        {t('common.cancel')}
      </Button>
      <Button onclick={createComposition}>{t('editor.compose.dialog.create')}</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
