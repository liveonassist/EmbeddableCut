<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { FormEventHandler } from 'svelte/elements'
  import { t } from '$lib/i18n.svelte'
  import { Textarea } from '@/components/ui/textarea'

  interface TextPlainEditorProps {
    value: string
    /** True while the selection disagrees on the text, so the field shows a placeholder. */
    isMixed: boolean
    onChange: FormEventHandler<HTMLTextAreaElement>
  }

  /** The single plain-text field used when the selection has no structured spans. */
  let { value, isMixed, onChange }: TextPlainEditorProps = $props()
</script>

<Textarea
  {value}
  oninput={onChange}
  placeholder={isMixed ? t('editor.textSection.mixed') : t('editor.textSection.enterText')}
  class="min-h-[60px] text-xs flex-1 min-w-0"
  rows={3}
/>
