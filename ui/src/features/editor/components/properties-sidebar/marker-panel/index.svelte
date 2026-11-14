<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  const DEFAULT_MARKER_COLOR = 'oklch(0.65 0.20 250)'

  // Preset colors for quick selection
  const MARKER_PRESET_COLORS = [
    'oklch(0.65 0.20 250)', // Blue (default)
    'oklch(0.65 0.20 30)', // Red
    'oklch(0.70 0.20 140)', // Green
    'oklch(0.70 0.18 85)', // Yellow
    'oklch(0.60 0.20 310)', // Purple
    'oklch(0.70 0.15 180)', // Cyan
  ]
</script>

<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import { select } from '$lib/store.svelte'
  import { Button } from '@/components/ui/button'
  import { Input } from '@/components/ui/input'
  import { Separator } from '@/components/ui/separator'
  import MapPin from 'lucide-svelte/icons/map-pin'
  import Trash2 from 'lucide-svelte/icons/trash-2'
  import {
    removeMarker,
    updateMarker,
    useMarkersStore,
    useTimelineSettingsStore,
  } from '@/features/editor/deps/timeline-store'
  import { useSelectionStore } from '@/shared/state/selection'
  import { formatTimecodeDotFrames } from '@/shared/utils/time-utils'
  import { getMarkerOrdinals } from '@/shared/timeline/marker-names'
  import { PropertySection, PropertyRow, NumberInput, ColorPicker } from '../components'
  import MarkerList from './marker-list.svelte'

  /**
   * Marker properties panel - shown when a marker is selected.
   * Allows editing frame position, label, and color.
   */
  const selectedMarkerId = select(useSelectionStore, (s) => s.selectedMarkerId)
  const markers = select(useMarkersStore, (s) => s.markers)
  const fps = select(useTimelineSettingsStore, (s) => s.fps)

  // Derive selected marker
  const selectedMarker = $derived(markers.current.find((m) => m.id === selectedMarkerId.current))

  // The name this marker shows while its label is empty, used as the input's
  // placeholder so the field previews what the ruler and list already display.
  const defaultName = $derived.by(() => {
    const markerId = selectedMarkerId.current
    if (!markerId) return ''
    const ordinal = getMarkerOrdinals(markers.current).get(markerId)
    return ordinal === undefined ? '' : t('timeline.markerName', { index: ordinal })
  })

  // Handle frame change
  const handleFrameChange = (frame: number) => {
    const markerId = selectedMarkerId.current
    if (markerId) {
      updateMarker(markerId, { frame: Math.max(0, Math.round(frame)) })
    }
  }

  // Handle label change
  const handleLabelChange = (e: Event & { currentTarget: HTMLInputElement }) => {
    const markerId = selectedMarkerId.current
    if (markerId) {
      // Store undefined if empty string to keep data clean
      updateMarker(markerId, { label: e.currentTarget.value || undefined })
    }
  }

  // Handle color change
  const handleColorChange = (color: string) => {
    const markerId = selectedMarkerId.current
    if (markerId) {
      updateMarker(markerId, { color })
    }
  }

  // Handle delete
  const handleDelete = () => {
    const markerId = selectedMarkerId.current
    if (markerId) {
      removeMarker(markerId)
      useSelectionStore.getState().clearSelection()
    }
  }

  // Handle reset color to default
  const handleResetColor = () => {
    const markerId = selectedMarkerId.current
    if (markerId && selectedMarker?.color !== DEFAULT_MARKER_COLOR) {
      updateMarker(markerId, { color: DEFAULT_MARKER_COLOR })
    }
  }
</script>

{#if !selectedMarker}
  <div class="space-y-4">
    <div class="flex flex-col items-center justify-center py-10 text-center">
      <MapPin class="w-8 h-8 text-muted-foreground/50 mb-2" />
      <p class="text-xs text-muted-foreground">{t('editor.markerPanel.notFound')}</p>
    </div>
    <Separator />
    <MarkerList />
  </div>
{:else}
  <div class="space-y-4">
    <PropertySection title={t('editor.markerPanel.title')} icon={MapPin} defaultOpen={true}>
      <!-- Frame position -->
      <PropertyRow label={t('editor.markerPanel.frame')}>
        <NumberInput
          value={selectedMarker.frame}
          onChange={handleFrameChange}
          min={0}
          step={1}
          unit="fr"
          class="flex-1 min-w-0"
        />
      </PropertyRow>

      <!-- Timecode (read-only) -->
      <PropertyRow label={t('editor.markerPanel.time')}>
        <span class="text-xs font-mono tabular-nums text-muted-foreground">
          {formatTimecodeDotFrames(selectedMarker.frame, fps.current)}
        </span>
      </PropertyRow>

      <!-- Label -->
      <PropertyRow label={t('editor.markerPanel.label')}>
        <Input
          value={selectedMarker.label || ''}
          oninput={handleLabelChange}
          placeholder={defaultName}
          class="h-7 text-xs flex-1 min-w-0"
        />
      </PropertyRow>

      <!-- Color -->
      <ColorPicker
        label={t('editor.markerPanel.color')}
        color={selectedMarker.color}
        onChange={handleColorChange}
        onReset={handleResetColor}
        defaultColor={DEFAULT_MARKER_COLOR}
        presets={MARKER_PRESET_COLORS}
      />

      <!-- Delete button -->
      <div class="pt-2">
        <Button variant="destructive" size="sm" class="w-full h-7 text-xs" onclick={handleDelete}>
          <Trash2 class="w-3 h-3 mr-1.5" />{t('editor.markerPanel.deleteMarker')}
        </Button>
      </div>
    </PropertySection>

    <Separator />

    <!-- All markers — jump between / manage the full set from the same panel -->
    <MarkerList />
  </div>
{/if}
