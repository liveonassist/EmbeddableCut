<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Component } from 'svelte'
  import { setRouter, type Router } from './router.svelte'
  import ResetOnChange from './reset-on-change.svelte'
  import type { ErrorComponentProps } from './types'

  /**
   * TanStack's `RouterProvider`: renders the matched route, its error
   * component when `beforeLoad`, `loader` or rendering throws, and the
   * not-found fallback.
   */
  let {
    router,
    defaultErrorComponent,
  }: { router: Router; defaultErrorComponent: Component<ErrorComponentProps> } = $props()

  // svelte-ignore state_referenced_locally
  setRouter(router)

  $effect(() => router.start())

  const state = $derived(router.state)
  const href = $derived(`${router.location.pathname}${router.location.search}`)
  const ErrorComponent = $derived(defaultErrorComponent)

  // As TanStack's: resetting a failed load changes nothing until the error
  // component invalidates the router, which reloads the route.
  const resetLoad = () => {}
</script>

{#if state.kind === 'ready'}
  {@const RouteComponent = state.component}
  <svelte:boundary>
    <RouteComponent params={state.params} loaderData={state.loaderData} />
    {#snippet failed(error, reset)}
      <ResetOnChange key={href} {reset} />
      <ErrorComponent {error} {reset} />
    {/snippet}
  </svelte:boundary>
{:else if state.kind === 'error'}
  <ErrorComponent error={state.error} reset={resetLoad} />
{:else if state.kind === 'not-found'}
  <!-- TanStack Router's default not-found component, which FreeCut keeps. -->
  <p>Not Found</p>
{/if}
