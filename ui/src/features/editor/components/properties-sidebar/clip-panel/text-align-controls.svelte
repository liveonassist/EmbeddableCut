<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import AlignCenter from 'lucide-svelte/icons/align-center'
  import AlignCenterHorizontal from 'lucide-svelte/icons/align-center-horizontal'
  import AlignEndHorizontal from 'lucide-svelte/icons/align-end-horizontal'
  import AlignLeft from 'lucide-svelte/icons/align-left'
  import AlignRight from 'lucide-svelte/icons/align-right'
  import AlignStartHorizontal from 'lucide-svelte/icons/align-start-horizontal'
  import { Button } from '@/components/ui/button'
  import type { TextItem } from '@/types/timeline'
  import { PropertyRow } from '../components'

  interface TextAlignControlsProps {
    textAlign: TextItem['textAlign']
    verticalAlign: TextItem['verticalAlign']
    onTextAlignChange: (value: string) => void
    onVerticalAlignChange: (value: string) => void
  }

  /** Horizontal and vertical text alignment, sharing one row. */
  let { textAlign, verticalAlign, onTextAlignChange, onVerticalAlignChange }: TextAlignControlsProps =
    $props()
</script>

<PropertyRow label={t('editor.textSection.align')}>
  <div class="flex gap-1">
    <Button
      variant={textAlign === 'left' ? 'secondary' : 'ghost'}
      size="icon"
      class="h-7 w-7"
      onclick={() => onTextAlignChange('left')}
      title={t('editor.textSection.alignLeft')}
    >
      <AlignLeft class="w-3.5 h-3.5" />
    </Button>
    <Button
      variant={textAlign === 'center' ? 'secondary' : 'ghost'}
      size="icon"
      class="h-7 w-7"
      onclick={() => onTextAlignChange('center')}
      title={t('editor.textSection.alignCenter')}
    >
      <AlignCenter class="w-3.5 h-3.5" />
    </Button>
    <Button
      variant={textAlign === 'right' ? 'secondary' : 'ghost'}
      size="icon"
      class="h-7 w-7"
      onclick={() => onTextAlignChange('right')}
      title={t('editor.textSection.alignRight')}
    >
      <AlignRight class="w-3.5 h-3.5" />
    </Button>
    <div class="w-px h-5 bg-border mx-1"></div>
    <Button
      variant={verticalAlign === 'top' ? 'secondary' : 'ghost'}
      size="icon"
      class="h-7 w-7"
      onclick={() => onVerticalAlignChange('top')}
      title={t('editor.textSection.alignTop')}
    >
      <AlignStartHorizontal class="w-3.5 h-3.5" />
    </Button>
    <Button
      variant={verticalAlign === 'middle' ? 'secondary' : 'ghost'}
      size="icon"
      class="h-7 w-7"
      onclick={() => onVerticalAlignChange('middle')}
      title={t('editor.textSection.alignMiddle')}
    >
      <AlignCenterHorizontal class="w-3.5 h-3.5" />
    </Button>
    <Button
      variant={verticalAlign === 'bottom' ? 'secondary' : 'ghost'}
      size="icon"
      class="h-7 w-7"
      onclick={() => onVerticalAlignChange('bottom')}
      title={t('editor.textSection.alignBottom')}
    >
      <AlignEndHorizontal class="w-3.5 h-3.5" />
    </Button>
  </div>
</PropertyRow>
