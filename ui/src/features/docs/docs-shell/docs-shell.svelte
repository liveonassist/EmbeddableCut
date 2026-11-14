<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import FreeCutLogo from '@/components/brand/freecut-logo.svelte'
  import { Button } from '@/components/ui/button'
  import { Link } from '@/app/router'
  import DocsNavigation from './docs-navigation.svelte'

  interface DocsShellProps {
    children: Snippet
    currentSlug?: string
  }

  let { children, currentSlug }: DocsShellProps = $props()
</script>

<div class="min-h-screen bg-background text-foreground select-text">
  <header class="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
    <div class="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
      <Link to="/" class="flex items-center gap-3">
        <FreeCutLogo size="md" />
        <span class="hidden text-sm text-muted-foreground sm:inline">Docs</span>
      </Link>
      <nav class="flex items-center gap-2">
        <Button variant="ghost" size="sm">
          {#snippet child({ props })}<Link {...props} to="/projects">Open FreeCut</Link>{/snippet}
        </Button>
        <Button variant="outline" size="sm">
          {#snippet child({ props })}<Link {...props} to="/">Home</Link>{/snippet}
        </Button>
      </nav>
    </div>
  </header>

  <div
    class="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[260px_minmax(0,1fr)]"
  >
    <aside class="lg:sticky lg:top-20 lg:h-[calc(100vh-6rem)] lg:overflow-y-auto">
      <DocsNavigation {currentSlug} />
    </aside>
    <main>{@render children()}</main>
  </div>
</div>
