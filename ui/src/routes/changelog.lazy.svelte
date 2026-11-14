<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import ArrowLeft from 'lucide-svelte/icons/arrow-left'
  import ArrowRight from 'lucide-svelte/icons/arrow-right'
  import CalendarDays from 'lucide-svelte/icons/calendar-days'
  import Plus from 'lucide-svelte/icons/plus'
  import Sparkles from 'lucide-svelte/icons/sparkles'
  import Wrench from 'lucide-svelte/icons/wrench'
  import changelogData from '@/data/changelog.json'
  import type { ChangelogEntry, ChangelogFile, ChangelogGroup } from '@/data/changelog-types'

  type Translate = (key: string, options?: Record<string, unknown>) => string

  const groupIcons = {
    added: Plus,
    fixed: Wrench,
    improved: Sparkles,
  }

  const groupLabelKeys: Record<ChangelogGroup, string> = {
    added: 'editor.whatsNew.groupAdded',
    fixed: 'editor.whatsNew.groupFixed',
    improved: 'editor.whatsNew.groupImproved',
  }

  const data = changelogData as ChangelogFile
  const releases: ChangelogEntry[] = data.current ? [data.current, ...data.releases] : data.releases
  const groupOrder: ChangelogGroup[] = ['added', 'fixed', 'improved']

  function formatSingleDate(iso: string, language?: string): string {
    const date = new Date(`${iso}T00:00:00Z`)
    return new Intl.DateTimeFormat(language, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date)
  }

  function formatWeekRange(mondayIso: string, language?: string): string {
    const monday = new Date(`${mondayIso}T00:00:00Z`)
    const sunday = new Date(monday.getTime() + 6 * 24 * 60 * 60 * 1000)
    const formatter = new Intl.DateTimeFormat(language, { month: 'short', day: 'numeric' })
    return `${formatter.format(monday)} — ${formatter.format(sunday)}`
  }

  function formatReleasePeriod(release: ChangelogEntry, t: Translate, language?: string): string {
    if (release.subtitleKey) return t(`changelog.${release.subtitleKey}`)
    if (release.version === 'current') {
      return t('editor.whatsNew.asOf', { date: formatSingleDate(release.date, language) })
    }
    return t('editor.whatsNew.weekOf', { range: formatWeekRange(release.date, language) })
  }

  function getChangeCount(release: ChangelogEntry): number {
    return groupOrder.reduce((count, group) => count + (release.groups[group]?.length ?? 0), 0)
  }

  function formatChangeCount(count: number, t: Translate): string {
    return t('changelog.changeCount', { count })
  }

  function getReleaseMarkerClass(isLatest: boolean): string {
    return isLatest ? 'h-4 w-4 bg-primary sm:h-6 sm:w-6' : 'h-4 w-4 bg-muted'
  }
</script>

<script lang="ts">
  import FreeCutLogo from '@/components/brand/freecut-logo.svelte'
  import { Button } from '@/components/ui/button'
  import { Link } from '@/app/router'
  import { locale, t } from '$lib/i18n.svelte'
</script>

{#snippet releaseTitle(release: ChangelogEntry, isLatest: boolean)}
  {@const label = release.version === 'current' ? t('editor.whatsNew.thisWeek') : release.version}
  <div class="flex flex-wrap items-center gap-2.5">
    <h2 class="text-xl font-semibold tracking-tight">{label}</h2>
    {#if isLatest}
      <span
        class="rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary"
      >
        {t('changelog.latest')}
      </span>
    {/if}
  </div>
{/snippet}

{#snippet groupSection(group: ChangelogGroup, items: ChangelogEntry['groups'][ChangelogGroup])}
  {#if items?.length}
    {@const GroupIcon = groupIcons[group]}
    <section class="bg-card px-5 py-6 sm:px-7">
      <h3 class="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider">
        <span class="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
          <GroupIcon class="h-3.5 w-3.5" />
        </span>
        {t(groupLabelKeys[group])}
      </h3>
      <ul class="space-y-3 text-sm leading-6 text-muted-foreground">
        {#each items as item (item.title)}
          <li class="flex gap-2.5">
            <span class="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-primary/70"></span>
            <span>{item.title}</span>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
{/snippet}

{#snippet changelogRelease(release: ChangelogEntry, index: number)}
  {@const isLatest = index === 0}
  {@const changeCount = getChangeCount(release)}
  <div class="relative pl-8 sm:pl-12">
    <div
      class="absolute left-0 top-7 z-10 rounded-full border-4 border-background {getReleaseMarkerClass(
        isLatest,
      )}"
    ></div>
    <details
      open={isLatest}
      class="group overflow-hidden rounded-xl border border-border bg-card/80 shadow-sm backdrop-blur-sm open:border-primary/30 open:shadow-lg open:shadow-primary/5"
    >
      <summary
        class="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-5 marker:hidden sm:px-7 [&::-webkit-details-marker]:hidden"
      >
        <div>
          {@render releaseTitle(release, isLatest)}
          <p class="mt-1 text-sm text-muted-foreground">
            {formatReleasePeriod(release, t, locale.current)}
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-3 text-sm text-muted-foreground">
          <span class="hidden sm:inline">{formatChangeCount(changeCount, t)}</span>
          <ArrowRight class="h-4 w-4 transition-transform duration-200 group-open:rotate-90" />
        </div>
      </summary>

      <div class="grid gap-px border-t border-border bg-border md:grid-cols-3">
        {#each groupOrder as group (group)}
          {@render groupSection(group, release.groups[group])}
        {/each}
      </div>
    </details>
  </div>
{/snippet}

<div class="min-h-screen bg-background text-foreground select-text">
  <div
    class="pointer-events-none fixed inset-x-0 top-0 h-96 bg-[radial-gradient(circle_at_50%_0%,color-mix(in_oklab,var(--primary)_12%,transparent),transparent_68%)]"
  ></div>

  <header class="relative border-b border-border/70 px-6 py-5">
    <div class="mx-auto flex max-w-5xl items-center justify-between gap-4">
      <Link to="/" aria-label={t('changelog.homeAria')}>
        <FreeCutLogo size="md" />
      </Link>
      <Button variant="ghost" size="sm" class="gap-2">
        {#snippet child({ props })}
          <Link {...props} to="/">
            <ArrowLeft class="h-4 w-4" />
            {t('changelog.backToHome')}
          </Link>
        {/snippet}
      </Button>
    </div>
  </header>

  <main class="relative px-6 py-14 sm:py-20">
    <div class="mx-auto max-w-5xl">
      <div class="mb-14 max-w-3xl">
        <div
          class="mb-5 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.22em] text-primary"
        >
          <CalendarDays class="h-4 w-4" />
          {t('changelog.releaseNotes')}
        </div>
        <h1 class="text-4xl font-bold tracking-tight sm:text-6xl">
          {t('changelog.title')}
        </h1>
        <p class="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
          {t('changelog.description')}
        </p>
      </div>

      <div
        class="relative space-y-5 before:absolute before:bottom-8 before:left-[7px] before:top-8 before:w-px before:bg-border sm:before:left-[11px]"
      >
        {#each releases as release, index (release.version)}
          {@render changelogRelease(release, index)}
        {/each}
      </div>

      <div
        class="mt-16 flex flex-col items-start justify-between gap-5 rounded-xl border border-border bg-card px-6 py-7 sm:flex-row sm:items-center sm:px-8"
      >
        <div>
          <h2 class="text-xl font-semibold">{t('changelog.ctaTitle')}</h2>
          <p class="mt-1 text-sm text-muted-foreground">
            {t('changelog.ctaDescription')}
          </p>
        </div>
        <Button class="gap-2">
          {#snippet child({ props })}
            <Link {...props} to="/projects">
              {t('changelog.openFreeCut')}
              <ArrowRight class="h-4 w-4" />
            </Link>
          {/snippet}
        </Button>
      </div>
    </div>
  </main>
</div>
