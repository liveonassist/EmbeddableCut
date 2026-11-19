<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import ArrowRight from 'lucide-svelte/icons/arrow-right'
  import BookOpen from 'lucide-svelte/icons/book-open'
  import Search from 'lucide-svelte/icons/search'
  import { Button } from '@/components/ui/button'
  import { Link } from '$lib/router'
  import { DOC_PAGES, type DocCategory } from '../docs-content'

  const groups = [
    ['Start', 'Set up the browser, workspace, projects, and editor layout.'],
    ['Core Editing', 'Import media, cut on the timeline, preview, and adjust clip properties.'],
    [
      'Creative Tools',
      'Text, shapes and masks, audio, effects, color, transitions, keyframes, animation, scenes, and local AI.',
    ],
    ['Output', 'Export files from the browser and manage queued renders.'],
  ] satisfies [DocCategory, string][]
</script>

<div class="space-y-8">
  <section class="rounded-lg border border-border bg-card p-6 sm:p-8">
    <div class="mb-4 flex items-center gap-2 text-primary">
      <BookOpen class="h-5 w-5" />
      <span class="text-sm font-medium">Documentation</span>
    </div>
    <h1 class="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">User Guide</h1>
    <p class="mt-4 max-w-3xl text-muted-foreground">
      Start with setup, workspaces, media import, timeline editing, and export. Use the reference
      pages when you need a precise control, shortcut, or troubleshooting path.
    </p>
    <div class="mt-6 flex flex-wrap gap-3">
      <Button>
        {#snippet child({ props })}
          <Link {...props} to="/docs/$slug" params={{ slug: 'getting-started' }}>
            Start editing
            <ArrowRight class="h-4 w-4" />
          </Link>
        {/snippet}
      </Button>
      <Button variant="outline">
        {#snippet child({ props })}
          <Link {...props} to="/docs/$slug" params={{ slug: 'troubleshooting' }}>Fix a problem</Link>
        {/snippet}
      </Button>
    </div>
  </section>

  <section class="grid gap-4 md:grid-cols-2">
    {#each groups as [title, description] (title)}
      <div class="rounded-lg border border-border bg-card p-5">
        <h2 class="text-lg font-semibold">{title}</h2>
        <p class="mt-2 text-sm text-muted-foreground">{description}</p>
        <div class="mt-4 space-y-1">
          {#each DOC_PAGES.filter((page) => page.category === title) as page (page.slug)}
            <Link
              to="/docs/$slug"
              params={{ slug: page.slug }}
              class="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent"
            >
              {page.title}
              <ArrowRight class="h-3.5 w-3.5 text-muted-foreground" />
            </Link>
          {/each}
        </div>
      </div>
    {/each}
  </section>

  <section class="rounded-lg border border-border bg-card p-5">
    <div class="mb-3 flex items-center gap-2">
      <Search class="h-4 w-4 text-primary" />
      <h2 class="text-lg font-semibold">Reference</h2>
    </div>
    <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {#each DOC_PAGES.filter((page) => page.category === 'Reference') as page (page.slug)}
        <Link
          to="/docs/$slug"
          params={{ slug: page.slug }}
          class="rounded-md border border-border bg-background p-3 hover:border-primary/60"
        >
          <p class="text-sm font-medium">{page.title}</p>
          <p class="mt-1 text-xs text-muted-foreground">{page.description}</p>
        </Link>
      {/each}
    </div>
  </section>
</div>
