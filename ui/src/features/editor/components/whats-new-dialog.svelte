<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import Sparkles from 'lucide-svelte/icons/sparkles'
  import Bug from 'lucide-svelte/icons/bug'
  import Zap from 'lucide-svelte/icons/zap'
  import { i18n } from '@/i18n'
  import changelogData from '@/data/changelog.json'
  import type {
    ChangelogEntry,
    ChangelogFile,
    ChangelogGroup,
  } from '@/data/changelog-types'

  const data = changelogData as ChangelogFile
  const GROUP_CONFIG: Record<ChangelogGroup, { labelKey: string; icon: typeof Sparkles }> =
    {
      added: { labelKey: 'editor.whatsNew.groupAdded', icon: Sparkles },
      fixed: { labelKey: 'editor.whatsNew.groupFixed', icon: Bug },
      improved: { labelKey: 'editor.whatsNew.groupImproved', icon: Zap },
    }

  const GROUP_ORDER: ChangelogGroup[] = ['added', 'fixed', 'improved']

  function capitalize(s: string): string {
    return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s
  }

  function formatEntryLabel(entry: ChangelogEntry): string {
    return entry.version === 'current' ? i18n.t('editor.whatsNew.thisWeek') : entry.version
  }

  function formatWeekRange(mondayIso: string): string {
    const monday = new Date(`${mondayIso}T00:00:00Z`)
    const sunday = new Date(monday.getTime() + 6 * 24 * 60 * 60 * 1000)
    const fmt = new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
    })
    return `${fmt.format(monday)} — ${fmt.format(sunday)}`
  }

  function formatEntrySubtitle(entry: ChangelogEntry): string {
    if (entry.subtitleKey) return i18n.t(`changelog.${entry.subtitleKey}`)
    if (entry.version === 'current')
      return i18n.t('editor.whatsNew.asOf', { date: formatSingleDate(entry.date) })
    return i18n.t('editor.whatsNew.weekOf', { range: formatWeekRange(entry.date) })
  }

  function formatSingleDate(iso: string): string {
    const d = new Date(`${iso}T00:00:00Z`)
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(d)
  }

  interface WhatsNewDialogProps {
    open: boolean
    onOpenChange?: (open: boolean) => void
  }
</script>

<script lang="ts">
  import ArrowRight from 'lucide-svelte/icons/arrow-right'
  import { t } from '$lib/i18n.svelte'
  import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
  import { ScrollArea } from '@/components/ui/scroll-area'
  import { Separator } from '@/components/ui/separator'
  import { cn } from '@/shared/ui/cn'
  import { markChangelogSeen } from './whats-new-seen'
  import { Link, findRouter } from '$lib/router'

  const router = findRouter()

  let { open = $bindable(), onOpenChange }: WhatsNewDialogProps = $props()

  const entries: ChangelogEntry[] = data.current ? [data.current, ...data.releases] : data.releases

  let selectedVersion = $state(entries[0]?.version ?? '')

  $effect(() => {
    if (open) markChangelogSeen()
  })

  const selected = $derived(entries.find((e) => e.version === selectedVersion) ?? entries[0])
  const latestReleaseVersion = data.releases[0]?.version
</script>

<Dialog
  bind:open={
    () => open,
    (next) => {
      open = next
      onOpenChange?.(next)
    }
  }
>
  <DialogContent class="max-w-3xl h-[72vh] p-0 flex flex-col overflow-hidden gap-0">
    <DialogHeader class="px-6 pt-5 pb-3">
      <DialogTitle class="flex items-center gap-2">
        <Sparkles class="h-4 w-4 text-primary" />
        {t('editor.whatsNew.title')}
      </DialogTitle>
    </DialogHeader>
    <Separator />
    <div class="flex flex-1 overflow-hidden min-h-0">
      <nav class="w-56 border-r shrink-0 bg-muted/20">
        <ScrollArea class="h-full">
          <ul class="p-2 space-y-0.5">
            {#each entries as entry (entry.version)}
              {@const isCurrent = entry.version === 'current'}
              {@const isSelected = selectedVersion === entry.version}
              <li>
                <button
                  type="button"
                  onclick={() => (selectedVersion = entry.version)}
                  class={cn(
                    'w-full text-left px-3 py-2 rounded-md text-sm transition-colors',
                    isSelected ? 'bg-accent' : 'hover:bg-accent/50',
                  )}
                >
                  <div class="flex items-center justify-between gap-2">
                    <span class="font-medium truncate">{formatEntryLabel(entry)}</span>
                    {#if isCurrent}
                      <span
                        class="text-[10px] uppercase tracking-wide text-primary bg-primary/10 px-1.5 py-0.5 rounded shrink-0"
                      >
                        {t('editor.whatsNew.newBadge')}
                      </span>
                    {/if}
                  </div>
                  <div class="text-xs text-muted-foreground mt-0.5 truncate">
                    {formatEntrySubtitle(entry)}
                  </div>
                </button>
              </li>
            {/each}
          </ul>
        </ScrollArea>
      </nav>
      <ScrollArea class="flex-1 min-w-0">
        {#if selected}
          <div class="px-6 py-5 space-y-6">
            {#each GROUP_ORDER as groupKey (groupKey)}
              {@const items = selected.groups[groupKey]}
              {#if items && items.length > 0}
                {@const { labelKey, icon: Icon } = GROUP_CONFIG[groupKey]}
                <section class="space-y-2.5">
                  <h3
                    class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    <Icon class="h-3.5 w-3.5" />
                    {t(labelKey)}
                  </h3>
                  <ul class="space-y-1.5 list-disc pl-5 marker:text-muted-foreground/60">
                    {#each items as item, i (i)}
                      <li class="text-xs leading-relaxed">
                        {capitalize(item.title)}
                      </li>
                    {/each}
                  </ul>
                </section>
              {/if}
            {/each}
          </div>
        {/if}
      </ScrollArea>
    </div>
    <Separator />
    <div class="px-6 py-3 flex justify-between items-center text-xs text-muted-foreground">
      <span>
        {latestReleaseVersion
          ? t('editor.whatsNew.released', { version: latestReleaseVersion })
          : t('editor.whatsNew.preRelease')}
      </span>
      <!-- The app's changelog page; a mounted editor has no pages. -->
      {#if router}
        <Link to="/changelog" class="flex items-center gap-1 hover:text-foreground hover:underline">
          {t('editor.whatsNew.fullChangelog')}
          <ArrowRight class="h-3 w-3" />
        </Link>
      {/if}
    </div>
  </DialogContent>
</Dialog>
