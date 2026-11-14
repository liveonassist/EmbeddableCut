// SPDX-License-Identifier: MIT

import { untrack } from 'svelte'
import { toast } from 'svelte-sonner'
import { useMotionPickWhipDrag } from '@/shared/hooks/use-pick-whip-drag.svelte'
import type { DirectLinkableProperty, PropertyExpression } from '@/types/keyframe'
import { resolveSetState, stateRef, type Ref, type SetState } from '../ref-state.svelte'
import { EXPRESSION_DOCK_HEIGHT } from './dopesheet-expression-dock'
import {
  getExpressionReferenceCandidate,
  resolveExpressionReferenceTarget,
  type ExpressionReferenceCandidate,
  type ExpressionReferenceDragOrigin,
  type PropertyExpressionDraft,
} from './expression-reference-utils'

type ExpressionPickWhipApi = ReturnType<
  typeof useMotionPickWhipDrag<ExpressionReferenceDragOrigin, ExpressionReferenceCandidate>
>

export interface PropertyExpressionEditorApi {
  readonly expressionEditor: PropertyExpressionDraft | null
  setExpressionEditor: SetState<PropertyExpressionDraft | null>
  readonly expressionReferencePick: ExpressionReferenceDragOrigin | null
  setExpressionReferencePick: SetState<ExpressionReferenceDragOrigin | null>
  readonly expressionReferenceDrag: ExpressionPickWhipApi['drag']
  readonly expressionDockOpen: boolean
  expressionDockRef: Ref<HTMLElement | null>
  expressionTextareaRef: Ref<HTMLTextAreaElement | null>
  beginExpressionReferenceDrag: ExpressionPickWhipApi['begin']
  openPropertyExpressionEditor: (
    property: DirectLinkableProperty,
    expression?: PropertyExpression,
  ) => void
  applyExpressionPreset: (property: DirectLinkableProperty, source: string) => void
}

export interface UsePropertyExpressionEditorOptions {
  onExpressionDockHeightChange?: (height: number) => void
  pickWhipRootRef: Ref<HTMLDivElement | null>
}

const CANDIDATE_ROW_SELECTOR = '[data-expression-item-id][data-expression-property]'
const PICK_WHIP_CLIP_SELECTOR =
  '[data-pick-whip-scroll-area], [data-testid="motion-layer-scroll-area"]'

/**
 * Owns the sandboxed expression editor: draft state, open/preset/reference
 * editing operations, pick-whip linking, and dock reveal/height effects.
 */
export function usePropertyExpressionEditor(
  options: () => UsePropertyExpressionEditorOptions,
): PropertyExpressionEditorApi {
  // Boxes rather than reassigned locals: the setters escape into the pick-whip
  // hook, and the boxes keep reads reactive.
  const editorState = stateRef<PropertyExpressionDraft | null>(null)
  const referencePickState = stateRef<ExpressionReferenceDragOrigin | null>(null)
  const setExpressionEditor: SetState<PropertyExpressionDraft | null> = (next) => {
    editorState.current = resolveSetState(
      next,
      untrack(() => editorState.current),
    )
  }
  const setExpressionReferencePick: SetState<ExpressionReferenceDragOrigin | null> = (next) => {
    referencePickState.current = resolveSetState(
      next,
      untrack(() => referencePickState.current),
    )
  }
  const expressionDock: Ref<HTMLElement | null> = { current: null }
  const expressionTextarea: Ref<HTMLTextAreaElement | null> = { current: null }
  const onExpressionDockHeightChange = $derived(options().onExpressionDockHeightChange)
  const getPickWhipRoot = () => options().pickWhipRootRef.current

  const openPropertyExpressionEditor = (
    property: DirectLinkableProperty,
    expression?: PropertyExpression,
  ) => {
    const source = expression?.source ?? 'value'
    setExpressionReferencePick(null)
    setExpressionEditor({
      property,
      source,
      enabled: expression?.enabled ?? true,
      selectionStart: source.length,
      selectionEnd: source.length,
    })
  }
  const expressionDockOpen = $derived(editorState.current !== null)
  $effect(() => {
    onExpressionDockHeightChange?.(expressionDockOpen ? EXPRESSION_DOCK_HEIGHT : 0)
  })
  $effect(() => {
    const onHeightChange = onExpressionDockHeightChange
    return () => {
      onHeightChange?.(0)
    }
  })
  const editedProperty = $derived(editorState.current?.property)
  $effect(() => {
    void editedProperty
    if (!expressionDockOpen) return

    let revealFrame = 0
    const layoutFrame = requestAnimationFrame(() => {
      revealFrame = requestAnimationFrame(() => {
        const dock = expressionDock.current
        const motionScrollArea = dock?.closest<HTMLElement>(
          '[data-testid="motion-layer-scroll-area"]',
        )
        if (!dock || !motionScrollArea) return

        const dockRect = dock.getBoundingClientRect()
        const viewportRect = motionScrollArea.getBoundingClientRect()
        const overflowBottom = dockRect.bottom - viewportRect.bottom + 8
        if (overflowBottom <= 0) return

        motionScrollArea.scrollTo({
          top: motionScrollArea.scrollTop + overflowBottom,
          behavior: 'smooth',
        })
      })
    })

    return () => {
      cancelAnimationFrame(layoutFrame)
      cancelAnimationFrame(revealFrame)
    }
  })
  const applyExpressionPreset = (property: DirectLinkableProperty, source: string) => {
    setExpressionEditor((current) => {
      if (!current || current.property !== property) return current
      requestAnimationFrame(() => {
        expressionTextarea.current?.focus()
        expressionTextarea.current?.setSelectionRange(source.length, source.length)
      })
      return {
        ...current,
        source,
        selectionStart: source.length,
        selectionEnd: source.length,
      }
    })
  }
  const insertExpressionReference = (
    origin: ExpressionReferenceDragOrigin,
    candidate: ExpressionReferenceCandidate,
  ) => {
    const reference = `prop(${JSON.stringify(candidate.itemId)}, ${JSON.stringify(candidate.property)})`
    setExpressionEditor((current) => {
      if (!current || current.property !== origin.property) return current
      const replaceDefaultValue =
        current.source.trim() === 'value' && origin.selectionStart === origin.selectionEnd
      const selectionStart = replaceDefaultValue ? 0 : origin.selectionStart
      const selectionEnd = replaceDefaultValue ? current.source.length : origin.selectionEnd
      const source =
        current.source.slice(0, selectionStart) + reference + current.source.slice(selectionEnd)
      const cursor = selectionStart + reference.length
      requestAnimationFrame(() => {
        const textarea = expressionTextarea.current
        textarea?.focus()
        textarea?.setSelectionRange(cursor, cursor)
      })
      return {
        ...current,
        source,
        selectionStart: cursor,
        selectionEnd: cursor,
      }
    })
  }
  const pickWhip = useMotionPickWhipDrag<
    ExpressionReferenceDragOrigin,
    ExpressionReferenceCandidate
  >(() => ({
    hoverAttribute: 'data-expression-reference-hover',
    getClipRoot: () =>
      getPickWhipRoot()?.closest<HTMLElement>(PICK_WHIP_CLIP_SELECTOR) ?? getPickWhipRoot(),
    resolveTarget: resolveExpressionReferenceTarget,
    onCommit: insertExpressionReference,
  }))
  $effect(() => {
    const pick = referencePickState.current
    if (!pick) return

    // Rows live in the editor's root, which is a shadow root when embedded:
    // query it rather than the host document.
    const root = getPickWhipRoot()
    const queryRoot = (root?.getRootNode() as Document | ShadowRoot | undefined) ?? document
    const markedRows = new Set<HTMLElement>()
    const syncCandidateRows = () => {
      for (const row of markedRows) {
        row.removeAttribute('data-expression-reference-pickable')
        row.removeAttribute('data-expression-reference-unavailable')
      }
      markedRows.clear()
      for (const row of queryRoot.querySelectorAll<HTMLElement>(CANDIDATE_ROW_SELECTOR)) {
        const candidate = getExpressionReferenceCandidate(row, pick)
        row.setAttribute(
          candidate
            ? 'data-expression-reference-pickable'
            : 'data-expression-reference-unavailable',
          'true',
        )
        markedRows.add(row)
      }
    }
    syncCandidateRows()

    const mutationRoot = root?.closest<HTMLElement>(PICK_WHIP_CLIP_SELECTOR) ?? document.body
    const observer =
      typeof MutationObserver === 'undefined' ? null : new MutationObserver(syncCandidateRows)
    observer?.observe(mutationRoot, { childList: true, subtree: true })

    const handleCandidateClick = (event: MouseEvent) => {
      // The document sees shadow-root targets retargeted to the host.
      const target = event.composedPath()[0] ?? event.target
      const element = target instanceof Element ? target : null
      const row = element?.closest<HTMLElement>(CANDIDATE_ROW_SELECTOR)
      if (!row) return
      event.preventDefault()
      event.stopPropagation()
      const candidate = getExpressionReferenceCandidate(row, pick)
      if (!candidate) {
        toast.info('Choose a compatible property', {
          id: 'expression-reference-compatible-help',
        })
        return
      }
      setExpressionReferencePick(null)
      insertExpressionReference(pick, candidate.value)
    }
    const handlePickKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setExpressionReferencePick(null)
      requestAnimationFrame(() => expressionTextarea.current?.focus())
    }
    document.addEventListener('click', handleCandidateClick, true)
    document.addEventListener('keydown', handlePickKeyDown, true)
    return () => {
      observer?.disconnect()
      document.removeEventListener('click', handleCandidateClick, true)
      document.removeEventListener('keydown', handlePickKeyDown, true)
      for (const row of markedRows) {
        row.removeAttribute('data-expression-reference-pickable')
        row.removeAttribute('data-expression-reference-unavailable')
      }
    }
  })

  return {
    get expressionEditor() {
      return editorState.current
    },
    setExpressionEditor,
    get expressionReferencePick() {
      return referencePickState.current
    },
    setExpressionReferencePick,
    get expressionReferenceDrag() {
      return pickWhip.drag
    },
    beginExpressionReferenceDrag: pickWhip.begin,
    get expressionDockOpen() {
      return expressionDockOpen
    },
    expressionDockRef: expressionDock,
    expressionTextareaRef: expressionTextarea,
    openPropertyExpressionEditor,
    applyExpressionPreset,
  }
}
