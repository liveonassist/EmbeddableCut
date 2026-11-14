<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import { Button } from '@/components/ui/button'
  import { Input } from '@/components/ui/input'
  import { Label } from '@/components/ui/label'
  import { addEntry, removeEntry } from './filler-removal-dialog-model'

  interface Props {
    id: string
    label: string
    entries: readonly string[]
    placeholder: string
    onChange: (entries: string[]) => void
  }

  let { id, label, entries, placeholder, onChange }: Props = $props()

  let value = $state('')

  function commit() {
    const nextEntries = addEntry(entries, value)
    if (nextEntries !== entries) {
      onChange(nextEntries)
    }
    value = ''
  }
</script>

<div class="space-y-2">
  <Label for={id} class="text-xs font-medium">
    {label}
  </Label>
  <div class="flex gap-2">
    <Input
      {id}
      bind:value
      {placeholder}
      onkeydown={(event) => {
        if (event.key !== 'Enter') return
        event.preventDefault()
        commit()
      }}
      class="h-8 text-xs"
    />
    <Button type="button" variant="secondary" size="sm" onclick={commit}>
      {t('timeline.fillerRemoval.add')}
    </Button>
  </div>
  <div class="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto rounded-md border bg-muted/20 p-2">
    {#if entries.length === 0}
      <span class="text-xs text-muted-foreground">{t('timeline.fillerRemoval.none')}</span>
    {:else}
      {#each entries as entry (entry)}
        <button
          type="button"
          onclick={() => onChange(removeEntry(entries, entry))}
          class="inline-flex overflow-hidden rounded border bg-background text-xs hover:bg-muted"
          title={t('timeline.fillerRemoval.remove')}
        ><span class="px-2 py-1">{entry}</span><span
            class="border-l border-border px-1.5 py-1 font-medium text-destructive">x</span
          ></button>
      {/each}
    {/if}
  </div>
</div>
