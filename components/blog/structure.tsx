import {
  CircleCheck,
  Focus,
  Info,
  List,
  Lock,
  LogOut,
  MailPlus,
  NotebookPen,
  PlugZap,
  Repeat,
  Shield,
  Sparkles,
  Split,
  SquareDashedBottomCode,
  ToggleRight,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Diagram blocks for the product-structure article: cards, the fork from one
 * account into two spaces, and the reason grid. Text is a prop or a child in
 * every one of them, so the two translations differ only in words.
 *
 * Colour comes from the design tokens rather than the literal oklch values of
 * the source design — the same palette, and correct in the dark theme too.
 */

/**
 * A closed icon map instead of a component prop: MDX names an icon as a
 * string, `next build` catches a typo, and the article source stays free of
 * lucide imports.
 */
const ICONS = {
  'circle-check': CircleCheck,
  focus: Focus,
  info: Info,
  list: List,
  lock: Lock,
  'log-out': LogOut,
  'mail-plus': MailPlus,
  'notebook-pen': NotebookPen,
  'plug-zap': PlugZap,
  repeat: Repeat,
  shield: Shield,
  sparkles: Sparkles,
  split: Split,
  'square-dashed-bottom-code': SquareDashedBottomCode,
  'toggle-right': ToggleRight,
  'user-check': UserCheck,
  'user-plus': UserPlus,
  users: Users,
  wallet: Wallet,
} as const

export type IconName = keyof typeof ICONS

function Icon({ name, className }: { name: IconName; className?: string }) {
  const Glyph = ICONS[name]
  return <Glyph className={cn('size-4 shrink-0 text-muted-foreground', className)} aria-hidden />
}

function Avatar({
  initial,
  filled,
  className,
}: {
  initial: string
  filled?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full font-medium',
        filled ? 'bg-primary text-primary-foreground' : 'border bg-muted text-muted-foreground',
        className
      )}
    >
      {initial}
    </span>
  )
}

export function Steps({ children }: { children: React.ReactNode }) {
  return <div className="not-prose my-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
}

export function Step({
  icon,
  number,
  title,
  children,
}: {
  icon: IconName
  number: string
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2">
        <Icon name={icon} />
        <span className="font-mono text-xs text-muted-foreground">{number}</span>
      </div>
      <div className="text-sm font-medium">{title}</div>
      <div className="text-sm leading-normal text-muted-foreground">{children}</div>
    </div>
  )
}

export interface Person {
  initial: string
  /** The reader's own avatar — filled, so one face is findable in both cards. */
  you?: boolean
}

export interface Module {
  icon: IconName
  label: string
}

/**
 * One account on top, two spaces below it. The fork is drawn with borders
 * rather than an SVG so it takes its colour from `--border` in both themes.
 */
export function Spaces({
  account,
  accountNote,
  ownerLabel,
  memberLabel,
  children,
}: {
  account: string
  accountNote: string
  ownerLabel: string
  memberLabel: string
  children: React.ReactNode
}) {
  return (
    <div className="not-prose my-8 flex flex-col items-center">
      <div className="flex items-center gap-2.5 rounded-full border bg-card py-2.5 pl-3 pr-[18px] shadow-sm">
        <Avatar initial={account.slice(0, 1)} filled className="size-7 text-xs" />
        <span className="text-sm font-medium">{account}</span>
        <span className="text-sm text-muted-foreground">·</span>
        <span className="text-sm text-muted-foreground">{accountNote}</span>
      </div>

      {/* The cards stack on a phone, where a fork would have nothing to fork
          into — a plain stem carries the same meaning at that width. */}
      <div className="h-8 w-px bg-border sm:hidden" aria-hidden />
      <div className="relative hidden h-[72px] w-full sm:block" aria-hidden>
        <div className="absolute left-1/2 top-0 h-[30px] w-px bg-border" />
        <div className="absolute left-[calc(25%-6px)] right-[calc(25%-6px)] top-[30px] h-px bg-border" />
        <div className="absolute left-[calc(25%-6px)] top-[30px] h-[42px] w-px bg-border" />
        <div className="absolute left-[calc(75%+6px)] top-[30px] h-[42px] w-px bg-border" />
        <div className="absolute left-[calc(25%-9px)] top-[66px] size-[7px] rounded-full bg-border" />
        <div className="absolute left-[calc(75%+3px)] top-[66px] size-[7px] rounded-full bg-border" />
        <span className="absolute left-[calc(25%+6px)] top-3 font-mono text-xs text-muted-foreground">
          {ownerLabel}
        </span>
        <span className="absolute right-[calc(25%+6px)] top-3 font-mono text-xs text-muted-foreground">
          {memberLabel}
        </span>
      </div>

      <div className="grid w-full gap-6 sm:grid-cols-2">{children}</div>
    </div>
  )
}

export function Space({
  icon,
  name,
  badge,
  people,
  peopleLabel,
  description,
  modulesLabel,
  modules,
}: {
  icon: IconName
  name: string
  badge: string
  people: readonly Person[]
  peopleLabel: string
  description: string
  modulesLabel: string
  modules: readonly Module[]
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border bg-card">
      <div className="flex flex-col gap-3 p-5 pb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon name={icon} />
            <span className="text-base font-semibold tracking-tight">{name}</span>
          </div>
          <span className="rounded-sm border px-2 py-0.5 text-xs text-muted-foreground">
            {badge}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {people.map((person, index) => (
            <Avatar
              key={`${person.initial}-${index}`}
              initial={person.initial}
              filled={person.you}
              className="size-6 text-[0.6875rem]"
            />
          ))}
          <span className="text-sm text-muted-foreground">{peopleLabel}</span>
        </div>
        <div className="text-sm leading-normal text-muted-foreground">{description}</div>
      </div>
      <div className="flex flex-1 flex-col gap-3 border-t bg-muted p-5 pt-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{modulesLabel}</div>
        <div className="grid grid-cols-2 gap-2">
          {modules.map((module) => (
            <div
              key={module.label}
              className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-2 text-sm"
            >
              <Icon name={module.icon} />
              {module.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** The aside that reads the diagram above it. */
export function StructureNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="not-prose my-6 flex items-start gap-2.5">
      <Icon name="info" className="mt-0.5" />
      <div className="text-sm leading-relaxed text-pretty text-muted-foreground">{children}</div>
    </div>
  )
}

export function Assistant({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="not-prose my-8 grid items-start gap-8 rounded-lg border bg-card p-6 sm:grid-cols-[220px_1fr]">
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <Icon name="sparkles" />
          <span className="text-base font-semibold tracking-tight">{title}</span>
        </div>
        <div className="text-sm leading-normal text-muted-foreground">{description}</div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  )
}

export function AssistantExample({
  context,
  children,
}: {
  context: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md border bg-muted p-4">
      <div className="font-mono text-xs text-muted-foreground">{context}</div>
      <div className="text-sm leading-normal">{children}</div>
    </div>
  )
}

export function Reasons({ children }: { children: React.ReactNode }) {
  return <div className="not-prose my-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
}

export function Reason({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border bg-card p-4">
      <Icon name={icon} className="mt-0.5" />
      <span className="text-sm leading-normal">{children}</span>
    </div>
  )
}
