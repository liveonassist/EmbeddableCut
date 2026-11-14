<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import Layers from 'lucide-svelte/icons/layers'
  import Play from 'lucide-svelte/icons/play'
  import Download from 'lucide-svelte/icons/download'
  import Search from 'lucide-svelte/icons/search'
  import AudioLines from 'lucide-svelte/icons/audio-lines'
  import Keyboard from 'lucide-svelte/icons/keyboard'
  import Palette from 'lucide-svelte/icons/palette'
  import WandSparkles from 'lucide-svelte/icons/wand-sparkles'

  const showcaseItems = [
    {
      id: 'timeline',
      titleKey: 'projects.landing.showcase.timeline.title',
      descriptionKey: 'projects.landing.showcase.timeline.description',
      icon: Layers,
      media: '/assets/landing/timeline.png',
    },
    {
      id: 'keyframe',
      titleKey: 'projects.landing.showcase.keyframe.title',
      descriptionKey: 'projects.landing.showcase.keyframe.description',
      icon: Play,
      media: '/assets/landing/dopesheet.png',
    },
    {
      id: 'semantic',
      titleKey: 'projects.landing.showcase.semantic.title',
      descriptionKey: 'projects.landing.showcase.semantic.description',
      icon: Search,
      media: '/assets/landing/semantic.png',
    },
    {
      id: 'export',
      titleKey: 'projects.landing.showcase.export.title',
      descriptionKey: 'projects.landing.showcase.export.description',
      icon: Download,
      media: '/assets/landing/export.png',
    },
    {
      id: 'audioEq',
      titleKey: 'projects.landing.showcase.audioEq.title',
      descriptionKey: 'projects.landing.showcase.audioEq.description',
      icon: AudioLines,
      media: '/assets/landing/eq.png',
    },
    {
      id: 'hotkeys',
      titleKey: 'projects.landing.showcase.hotkeys.title',
      descriptionKey: 'projects.landing.showcase.hotkeys.description',
      icon: Keyboard,
      media: '/assets/landing/hotkeys.png',
    },
    {
      id: 'motion',
      titleKey: 'projects.landing.showcase.motion.title',
      descriptionKey: 'projects.landing.showcase.motion.description',
      icon: WandSparkles,
      media: '/assets/landing/motion.png',
    },
    {
      id: 'colorGrade',
      titleKey: 'projects.landing.showcase.colorGrade.title',
      descriptionKey: 'projects.landing.showcase.colorGrade.description',
      icon: Palette,
      media: '/assets/landing/colorgrade.png',
    },
  ]
</script>

<script lang="ts">
  import ArrowRight from 'lucide-svelte/icons/arrow-right'
  import Star from 'lucide-svelte/icons/star'
  import ExternalLink from 'lucide-svelte/icons/external-link'
  import BookOpen from 'lucide-svelte/icons/book-open'
  import History from 'lucide-svelte/icons/history'
  import type { Snippet } from 'svelte'
  import FreeCutLogo from '@/components/brand/freecut-logo.svelte'
  import DiscordIcon from '@/components/brand/discord-icon.svelte'
  import Trans from '@/components/trans.svelte'
  import { Button } from '@/components/ui/button'
  import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
  } from '@/components/ui/accordion'
  import { Link } from '$lib/router'
  import { DISCORD_INVITE_URL } from '@/config/community'
  import {
    isGitHubStarsCacheFresh,
    readGitHubStarsCache,
    refreshGitHubStarCount,
  } from '@/shared/utils/github-stars'
  import { t } from '$lib/i18n.svelte'

  const initialCache = readGitHubStarsCache()
  let githubStarCount = $state<number | null>(initialCache?.stars ?? null)

  $effect(() => {
    if (initialCache && isGitHubStarsCacheFresh(initialCache)) return

    let active = true
    void refreshGitHubStarCount().then((count) => {
      if (active && count !== null) githubStarCount = count
    })
    return () => {
      active = false
    }
  })

  const faqItems: Array<{ id?: string; question: string; answer: string | Snippet }> = $derived([
    {
      question: t('projects.landing.faq.free.question'),
      answer: t('projects.landing.faq.free.answer'),
    },
    {
      question: t('projects.landing.faq.install.question'),
      answer: t('projects.landing.faq.install.answer'),
    },
    {
      question: t('projects.landing.faq.storage.question'),
      answer: t('projects.landing.faq.storage.answer'),
    },
    {
      id: 'browser-support',
      question: t('projects.landing.faq.browsers.question'),
      answer: browsersAnswer,
    },
    {
      question: t('projects.landing.faq.exportFormats.question'),
      answer: t('projects.landing.faq.exportFormats.answer'),
    },
    {
      question: t('projects.landing.faq.future.question'),
      answer: t('projects.landing.faq.future.answer'),
    },
    {
      question: t('projects.landing.faq.shoutout.question'),
      answer: shoutoutAnswer,
    },
  ])
</script>

{#snippet browsersAnswer()}
  <p class="mb-3">{t('projects.landing.faq.browsers.answerP1')}</p>
  <p>
    <Trans i18nKey="projects.landing.faq.browsers.answerP2">
      {#snippet strong(text: string)}<strong>{text}</strong>{/snippet}
      {#snippet code(text: string)}<code class="rounded bg-muted px-1 py-0.5 text-xs">{text}</code
        >{/snippet}
    </Trans>
  </p>
{/snippet}

{#snippet shoutoutAnswer()}
  <p class="mb-3">
    <Trans i18nKey="projects.landing.faq.shoutout.answerP1">
      {#snippet link(text: string)}<a
          href="https://mediabunny.dev/"
          target="_blank"
          rel="noopener noreferrer"
          class="text-primary underline hover:text-primary/80">{text}</a
        >{/snippet}
    </Trans>
  </p>
  <p class="mb-2 font-medium text-foreground">
    {t('projects.landing.faq.shoutout.builtWith')}
  </p>
  <ul class="list-disc pl-5 space-y-1">
    <li>React</li>
    <li>TypeScript</li>
    <li>Vite</li>
    <li>Shadcn</li>
  </ul>
{/snippet}

{#snippet gitHubStarCount(count: number | null)}
  {#if count !== null}
    <span class="rounded-md bg-primary/10 px-1.5 py-0.5 text-xs tabular-nums text-primary">
      {new Intl.NumberFormat().format(count)}
    </span>
  {/if}
{/snippet}

{#snippet communityButtons()}
  <Button variant="outline" size="lg" class="gap-2">
    {#snippet child({ props })}
      <a {...props} href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer">
        <DiscordIcon class="h-4 w-4" />
        Join Discord
      </a>
    {/snippet}
  </Button>

  <Button variant="outline" size="lg" class="gap-2">
    {#snippet child({ props })}
      <a {...props} href="https://github.com/walterlow/freecut" target="_blank" rel="noopener noreferrer">
        <Star class="h-4 w-4" />
        {t('projects.landing.starOnGitHub')}
        {@render gitHubStarCount(githubStarCount)}
      </a>
    {/snippet}
  </Button>
{/snippet}

<div class="min-h-screen bg-background text-foreground select-text">
  <!-- Hero Section -->
  <section class="relative flex min-h-[60vh] flex-col items-center justify-center px-6 py-12">
    <!-- Subtle gradient background -->
    <div class="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        class="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-3xl"
      ></div>
    </div>

    <div class="relative z-10 flex flex-col items-center text-center animate-fade-in">
      <div class="mb-6 flex items-center gap-3">
        <FreeCutLogo size="lg" />
        <span class="rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary">
          {t('projects.landing.beta')}
        </span>
      </div>

      <h1 class="mb-4 max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
        <Trans i18nKey="projects.landing.heroTitle">
          {#snippet accent(text: string)}<span class="text-primary">{text}</span>{/snippet}
        </Trans>
      </h1>

      <p class="mb-6 max-w-lg text-lg text-muted-foreground sm:text-xl">
        {t('projects.landing.heroSubtitle')}
      </p>

      <p class="mb-6 max-w-lg text-sm text-amber-600 dark:text-amber-500">
        {t('projects.landing.disclaimer')}
      </p>

      <div class="flex flex-col items-center gap-4 sm:flex-row sm:flex-wrap sm:justify-center">
        <Button size="lg" class="gap-2 px-8">
          {#snippet child({ props })}
            <Link {...props} to="/projects">
              {t('projects.landing.getStarted')}
              <ArrowRight class="h-4 w-4" />
            </Link>
          {/snippet}
        </Button>

        <Button variant="outline" size="lg" class="gap-2 px-8">
          {#snippet child({ props })}
            <Link {...props} to="/changelog">
              <History class="h-4 w-4" />
              {t('projects.landing.viewChangelog')}
            </Link>
          {/snippet}
        </Button>

        <Button variant="outline" size="lg" class="gap-2">
          {#snippet child({ props })}
            <Link {...props} to="/docs">
              <BookOpen class="h-4 w-4" />
              Docs
            </Link>
          {/snippet}
        </Button>

        {@render communityButtons()}
      </div>
    </div>
  </section>

  <!-- Showcase Bento Grid -->
  <section class="border-t border-border px-6 py-20">
    <div class="mx-auto max-w-6xl">
      <div class="mb-12 text-center">
        <h2 class="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
          {t('projects.landing.showcaseHeading')}
        </h2>
        <p class="mx-auto max-w-2xl text-muted-foreground">
          {t('projects.landing.showcaseSubheading')}
        </p>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        {#each showcaseItems as item (item.id)}
          <div
            class="group relative overflow-hidden rounded-xl border border-border bg-card transition-[border-color,box-shadow] duration-150 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5"
          >
            <div class="relative aspect-[16/10] w-full overflow-hidden bg-black">
              <img
                src={item.media}
                alt={t(item.titleKey)}
                loading="lazy"
                class="h-full w-full object-contain transition-transform duration-500 group-hover:scale-[1.02]"
              />
            </div>

            <!-- Content overlay -->
            <div
              class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-card via-card/95 to-transparent p-4 pt-8"
            >
              <div class="flex items-center gap-2">
                <div class="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                  <item.icon class="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h3 class="font-semibold">{t(item.titleKey)}</h3>
                  <p class="text-xs text-muted-foreground">{t(item.descriptionKey)}</p>
                </div>
              </div>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- Demo Video Section -->
  <section class="border-t border-border px-6 py-20">
    <div class="mx-auto max-w-4xl">
      <div class="mb-10 text-center">
        <h2 class="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
          {t('projects.landing.seeItInAction')}
        </h2>
        <p class="mx-auto max-w-2xl text-muted-foreground">
          {t('projects.landing.seeItInActionSubheading')}
        </p>
      </div>

      <a
        href="https://www.youtube.com/watch?v=2EWVUXpNntk"
        target="_blank"
        rel="noopener noreferrer"
        class="group block overflow-hidden rounded-xl border border-border bg-card shadow-lg transition-colors hover:border-primary/50"
      >
        <div class="relative aspect-video w-full overflow-hidden bg-muted">
          <picture>
            <source srcset="/assets/landing/main.webp" type="image/webp" />
            <img
              src="/assets/landing/main.png"
              alt={t('projects.landing.demoPreviewAlt')}
              loading="lazy"
              decoding="async"
              width={1920}
              height={959}
              class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          </picture>
          <div class="absolute inset-0 bg-black/30 transition-colors group-hover:bg-black/20"></div>
          <div class="absolute inset-0 flex items-center justify-center">
            <div
              class="flex h-20 w-20 items-center justify-center rounded-full border border-white/30 bg-black/55 text-white shadow-2xl backdrop-blur-sm"
            >
              <Play class="ml-1 h-8 w-8 fill-current" />
            </div>
          </div>
          <div
            class="absolute bottom-4 left-4 flex items-center gap-2 rounded-full border border-white/20 bg-black/60 px-3 py-1.5 text-sm text-white backdrop-blur-sm"
          >
            <span>{t('projects.landing.watchDemoOnYouTube')}</span>
            <ExternalLink class="h-3.5 w-3.5" />
          </div>
        </div>
      </a>
    </div>
  </section>

  <!-- FAQ Section -->
  <section class="border-t border-border bg-card/50 px-6 py-20">
    <div class="mx-auto max-w-3xl">
      <div class="mb-10 text-center">
        <h2 class="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
          {t('projects.landing.faqHeading')}
        </h2>
        <p class="text-muted-foreground">{t('projects.landing.faqSubheading')}</p>
      </div>

      <Accordion type="single" collapsible class="w-full">
        {#each faqItems as item, index (index)}
          <AccordionItem value={`item-${index}`} id={item.id}>
            <AccordionTrigger class="text-left">{item.question}</AccordionTrigger>
            <AccordionContent class="text-muted-foreground">
              {#if typeof item.answer === 'string'}{item.answer}{:else}{@render item.answer()}{/if}
            </AccordionContent>
          </AccordionItem>
        {/each}
      </Accordion>
    </div>
  </section>

  <!-- CTA Footer Section -->
  <section class="border-t border-border px-6 py-20">
    <div class="mx-auto flex max-w-2xl flex-col items-center text-center">
      <h2 class="mb-4 text-2xl font-bold sm:text-3xl">
        {t('projects.landing.ctaHeading')}
      </h2>
      <p class="mb-8 text-muted-foreground">{t('projects.landing.ctaSubheading')}</p>
      <div class="flex flex-col items-center gap-4 sm:flex-row">
        <Button size="lg" class="gap-2 px-8">
          {#snippet child({ props })}
            <Link {...props} to="/projects">
              {t('projects.landing.startEditing')}
              <ArrowRight class="h-4 w-4" />
            </Link>
          {/snippet}
        </Button>

        <Button variant="outline" size="lg" class="gap-2">
          {#snippet child({ props })}
            <Link {...props} to="/docs">
              <BookOpen class="h-4 w-4" />
              Docs
            </Link>
          {/snippet}
        </Button>

        {@render communityButtons()}
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer class="border-t border-border px-6 py-8">
    <div class="mx-auto max-w-5xl text-center text-sm text-muted-foreground">
      {t('projects.landing.footer', { year: new Date().getFullYear() })}
    </div>
  </footer>
</div>
