<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import { useColorPlayheadAutoSelect } from '../hooks/use-color-playhead-auto-select.svelte'
  import ColorGradePanel from './properties-sidebar/color-grade-panel/index.svelte'

  useColorPlayheadAutoSelect()
</script>

<section
  class="panel-bg flex h-full min-h-0 flex-col border-t border-border"
  aria-label={t('editor.colorPanel.dockLabel')}
  data-testid="color-grading-dock"
>
  <div class="min-h-0 flex-1 overflow-hidden p-2">
    <ColorGradePanel layout="dock" />
  </div>
</section>
