<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { cn } from '@/shared/ui/cn'
  import { getKeyframeGroupLabel } from '@/features/keyframes/utils/property-i18n'
  import DopesheetGroupOptionsMenu from '../dopesheet-group-options-menu.svelte'
  import {
    GroupCurvesButton,
    GroupExpandButton,
    GroupKeyframeNavButton,
    GroupLockButton,
    GroupReset,
  } from '../property-group-controls'
  import { resolveGroupHeaderState } from '../property-group-view-model'
  import { findGroupDimensionSeparation, type DopesheetGroupHeaderProps } from './types'

  let {
    group,
    t,
    expandedGroups,
    graphVisibleProperties,
    dimensionSeparationByProperty,
    canClearRow,
    disabled,
    isPropertyLocked,
    onNavigateToKeyframe,
    onResetPropertiesToDefault,
    presentation,
    setAllGroupsExpanded,
    setAllRowsLocked,
    setGroupLocked,
    toggleGroup,
    toggleGroupCurves,
    handleClearGroup,
    handleRowNavigate,
  }: DopesheetGroupHeaderProps = $props()

  const groupLabel = $derived(getKeyframeGroupLabel(t, group.id, group.label))
  const headerState = $derived(
    resolveGroupHeaderState({
      group,
      graphProperties: graphVisibleProperties,
      isPropertyLocked,
      canClearRow,
      hasResetToDefault: !!onResetPropertiesToDefault,
      disabled,
      groupLabel,
      t,
    }),
  )
  const isOpen = $derived(expandedGroups[group.id] ?? true)
  const dimensionSeparation = $derived(
    findGroupDimensionSeparation(group.rows, dimensionSeparationByProperty),
  )
</script>

<div
  class={cn(
    'group flex h-full items-center gap-px border-y border-border/60 bg-muted/70 pl-3 pr-0.5',
    presentation === 'lanes' &&
      "relative pl-6 before:absolute before:inset-y-0 before:left-3 before:w-px before:bg-border/40 before:content-['']",
  )}
>
  <div class="flex items-center gap-px self-stretch">
    <GroupCurvesButton
      groupProperties={headerState.groupProperties}
      {groupLabel}
      curveVisible={headerState.curveVisible}
      onToggleGroupCurves={toggleGroupCurves}
      {t}
    />
    <GroupLockButton
      groupProperties={headerState.groupProperties}
      {groupLabel}
      allRowsLocked={headerState.allRowsLocked}
      {setAllRowsLocked}
      {setGroupLocked}
      {t}
    />
  </div>
  <GroupExpandButton
    groupId={group.id}
    {groupLabel}
    {isOpen}
    {setAllGroupsExpanded}
    {toggleGroup}
    {t}
  />
  <div
    class="ml-auto flex items-center gap-0 rounded-sm border border-border/70 bg-background/90 px-px shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
  >
    <DopesheetGroupOptionsMenu {groupLabel} {dimensionSeparation} {disabled} {isPropertyLocked} />
    <GroupKeyframeNavButton
      direction="prev"
      entry={group.prevKeyframe}
      fallbackProperty={group.rows[0]?.property ?? 'x'}
      {groupLabel}
      {disabled}
      canNavigate={!!onNavigateToKeyframe}
      onNavigate={handleRowNavigate}
      {t}
    />
    <GroupKeyframeNavButton
      direction="next"
      entry={group.nextKeyframe}
      fallbackProperty={group.rows[0]?.property ?? 'x'}
      {groupLabel}
      {disabled}
      canNavigate={!!onNavigateToKeyframe}
      onNavigate={handleRowNavigate}
      {t}
    />
    <GroupReset
      groupId={group.id}
      canResetGroup={headerState.canResetGroup}
      resetGroupLabel={headerState.resetGroupLabel}
      canResetEffectGroup={headerState.canResetEffectGroup}
      groupProperties={headerState.groupProperties}
      onResetToDefault={onResetPropertiesToDefault}
      onClearGroup={() => handleClearGroup(group)}
    />
  </div>
</div>
