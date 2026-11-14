<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import MousePointer2 from 'lucide-svelte/icons/mouse-pointer-2'
  import { t } from '$lib/i18n.svelte'
  import { Button } from '@/components/ui/button'
  import { PropertyRow } from '../components'
  import type { SharedShapeValue } from './shape-section-shared-values'

  interface ShapePathControlsProps {
    /** Id of the single selected path shape; null hides every path control. */
    pathItemId: string | null
    isEditingPath: boolean
    isMaskOnly: boolean
    showPathClosure: boolean
    pathClosed: SharedShapeValue<boolean>
    selectedVertexIndex: number | null
    startEditing: (itemId: string) => void
    stopEditing: () => void
    onReversePath: () => void
    onPathClosedChange: (closed: boolean) => void
    onSetFirstVertex: () => void
  }

  /** Editing entry point, vertex order, closure, and start-vertex controls for a bezier path shape. */
  let {
    pathItemId,
    isEditingPath,
    isMaskOnly,
    showPathClosure,
    pathClosed,
    selectedVertexIndex,
    startEditing,
    stopEditing,
    onReversePath,
    onPathClosedChange,
    onSetFirstVertex,
  }: ShapePathControlsProps = $props()
</script>

{#if pathItemId}
  <PropertyRow label={t('editor.shapeSection.path')}>
    <div class="flex items-center gap-2 w-full">
      <Button
        variant={isEditingPath ? 'default' : 'outline'}
        size="sm"
        class="h-7 text-xs gap-1.5"
        onclick={() => {
          if (isEditingPath) {
            stopEditing()
          } else {
            startEditing(pathItemId)
          }
        }}
      >
        <MousePointer2 class="w-3.5 h-3.5" />
        {isEditingPath ? t('common.done') : t('editor.shapeSection.editPath')}
      </Button>
      {#if !isMaskOnly}
        <Button variant="outline" size="sm" class="h-7 text-xs" onclick={onReversePath}>
          {t('editor.shapeSection.reversePath')}
        </Button>
      {/if}
    </div>
  </PropertyRow>
  {#if showPathClosure}
    <PropertyRow label={t('editor.shapeSection.pathClosure')}>
      <div class="grid w-full grid-cols-2 gap-1">
        <Button
          variant={pathClosed === false ? 'secondary' : 'ghost'}
          size="sm"
          class="h-7 text-xs"
          onclick={() => onPathClosedChange(false)}
        >
          {t('editor.shapeSection.openPath')}
        </Button>
        <Button
          variant={pathClosed === true ? 'secondary' : 'ghost'}
          size="sm"
          class="h-7 text-xs"
          onclick={() => onPathClosedChange(true)}
        >
          {t('editor.shapeSection.closedPath')}
        </Button>
      </div>
    </PropertyRow>
    <p class="px-1 pb-1 text-[10px] leading-4 text-muted-foreground">
      {t(
        pathClosed === false
          ? 'editor.shapeSection.openPathHint'
          : 'editor.shapeSection.closedPathHint',
      )}
    </p>
  {/if}
  {#if isEditingPath && !isMaskOnly && pathClosed === true}
    <PropertyRow label={t('editor.shapeSection.firstVertex')}>
      <Button
        variant="outline"
        size="sm"
        class="h-7 text-xs"
        disabled={selectedVertexIndex === null}
        onclick={onSetFirstVertex}
      >
        {t('editor.shapeSection.setSelectedFirst')}
      </Button>
    </PropertyRow>
  {/if}
{/if}
