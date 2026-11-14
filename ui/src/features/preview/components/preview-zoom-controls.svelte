<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import ZoomIn from 'lucide-svelte/icons/zoom-in'
  import { Button } from '@/components/ui/button'
  import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
  import { EDITOR_LAYOUT_CSS_VALUES } from '@/config/editor-layout'
  import { usePreviewZoom } from '../hooks/use-preview-zoom.svelte'

  const previewZoom = usePreviewZoom()
  const { zoom, zoomPresets, handlePresetZoom } = $derived(previewZoom)
  const triggerRef: { current: HTMLButtonElement | null } = { current: null }

  const currentLabel = $derived(zoom === -1
      ? t('preview.zoom.auto')
      : zoomPresets.find((p) => p.value === zoom)?.label || `${Math.round(zoom * 100)}%`)

  const blurTrigger = () => {
    triggerRef.current?.blur()
  }
</script>

<DropdownMenu
  onOpenChange={(open) => {
    if (!open) requestAnimationFrame(blurTrigger)
  }}
>
  <DropdownMenuTrigger>
    {#snippet child({ props })}
      <Button {...props}
        bind:ref={triggerRef.current}
        variant="ghost"
        class="flex-shrink-0 text-muted-foreground hover:text-foreground gap-1 px-1.5"
        style={`height: ${EDITOR_LAYOUT_CSS_VALUES.previewControlButtonSize}`}
        data-tooltip={t('preview.zoom.tooltip', { label: currentLabel })}
        aria-label={t('preview.zoom.ariaLabel', { label: currentLabel })}
        onkeydown={(e) => {
          // Space is reserved for global play/pause
          if (e.key === ' ' || e.code === 'Space') e.preventDefault()
        }}
      >
        <ZoomIn class="w-3.5 h-3.5" />
        <span class="text-[10px] leading-none">
          {currentLabel}
        </span>
      </Button>
    {/snippet}
  </DropdownMenuTrigger>
  <DropdownMenuContent
    align="end"
    onCloseAutoFocus={(e) => {
      e.preventDefault()
      requestAnimationFrame(blurTrigger)
    }}
  >
    {#each zoomPresets as preset (preset.label)}
      <DropdownMenuItem class="text-xs" onSelect={() => handlePresetZoom(preset)}>
        <span
          class={zoom === preset.value || (preset.value === 'fit' && zoom === -1)
            ? 'font-semibold'
            : ''}
        >
          {preset.label}
        </span>
      </DropdownMenuItem>
    {/each}
  </DropdownMenuContent>
</DropdownMenu>
