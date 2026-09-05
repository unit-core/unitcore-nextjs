'use client'

import { useId, useMemo, useRef, useState } from 'react'
import { ChevronDownIcon, PlusIcon, Trash2Icon, XIcon } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCategories } from '@/hooks/use-categories'
import { useCreateTransaction } from '@/hooks/use-create-transaction'
import { useSpaces } from '@/hooks/use-spaces'
import { useTransaction, type EditedItem } from '@/hooks/use-transaction'
import { budgetMessages } from '@/lib/budget/messages'
import {
  CURRENCY_PATTERN,
  DEFAULT_CURRENCY,
  amountInput,
  dateInputOf,
  occurredAtFor,
  parseAmount,
  todayInput,
  type BudgetMessages,
  type Category,
  type CategoryKind,
} from '@/lib/budget/model'
import type { Dictionary } from '@/lib/i18n/dictionaries'
import { cn } from '@/lib/utils'

type FormDictionary = Dictionary['dashboard']['form']

/** A line of the form, before it is a row of anything. */
interface DraftLine {
  /** Stable across reorders and removals, which an index is not. */
  key: number
  /** The row it came from, absent when this line is new. */
  id?: string
  name: string
  /** Text, not a number: half-typed "12." has to survive being in the field. */
  amount: string
  categoryId: string | null
}

/** What the form was opened with, and what Cancel puts back. */
interface Initial {
  title: string
  date: string
  currencyCode: string
  lines: DraftLine[]
}

export interface SubmittedTransaction {
  spaceId: string
  title: string
  currencyCode: string
  dateInput: string
  items: EditedItem[]
}

/** A label above whatever changes the value. */
function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}

/** The dropdown trigger from the task dialog, repeated rather than shared: it is
 *  four lines of markup, and the two screens are free to drift apart. */
function MenuButton({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) {
  return (
    <DropdownMenuTrigger
      render={
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className="w-full justify-between"
        >
          <span className="truncate">{children}</span>
          <ChevronDownIcon className="size-3.5 shrink-0" />
        </Button>
      }
    />
  )
}

/** Both kinds, expense first: it is the ordinary one, and the one a line with no
 *  category at all is counted as. */
const KINDS = ['expense', 'income'] as const

/**
 * Which way the money went, as a dot with the word behind it.
 *
 * Built like `PriorityDot` on a task, down to the `title`: colour carries it at
 * a glance, and the name is there for anyone the colour does not reach. The two
 * tones are the ones the currency card already spends — destructive for money
 * going out, emerald for money coming in — so the dashboard does not explain the
 * same thing twice in two palettes.
 */
function KindDot({
  kind,
  d,
  className,
}: {
  kind: CategoryKind
  d: FormDictionary
  className?: string
}) {
  return (
    <span
      title={kind === 'expense' ? d.expense : d.income}
      className={cn(
        'size-1.5 shrink-0 rounded-full',
        kind === 'expense' ? 'bg-destructive' : 'bg-emerald-500',
        className
      )}
    />
  )
}

/**
 * The fields themselves, seeded once from {@link Initial}.
 *
 * Mounted under a `key` that changes with what is being edited, so the initial
 * values arrive as `useState` defaults rather than as an effect copying a
 * finished load into state — the cascading render React now warns about, and
 * one more chance for the two copies to disagree.
 */
function TransactionForm({
  d,
  messages,
  initial,
  fixedSpaceId,
  isSaving,
  error,
  onCancel,
  onDelete,
  onSubmit,
}: {
  d: FormDictionary
  messages: BudgetMessages
  initial: Initial
  /** The space this is written to when it is not the reader's to choose. */
  fixedSpaceId?: string
  isSaving: boolean
  error: string | null
  onCancel: () => void
  /** Absent for a transaction that does not exist yet. */
  onDelete?: () => void
  onSubmit: (draft: SubmittedTransaction) => void
}) {
  const { spaces } = useSpaces({ enabled: !fixedSpaceId })

  const [chosenSpace, setChosenSpace] = useState<string | null>(null)
  const [title, setTitle] = useState(initial.title)
  const [date, setDate] = useState(initial.date)
  const [currencyCode, setCurrencyCode] = useState(initial.currencyCode)
  const [lines, setLines] = useState<DraftLine[]>(initial.lines)
  const nextKey = useRef(initial.lines.length)

  // Which line is having a category invented for it, and what it will be called.
  const [creatingFor, setCreatingFor] = useState<number | null>(null)
  const [categoryName, setCategoryName] = useState('')
  const [categoryKind, setCategoryKind] = useState<CategoryKind>('expense')
  const [isCreatingCategory, setIsCreatingCategory] = useState(false)

  /**
   * Where this is written. Fixed when the dashboard's filter or the transaction
   * itself has already answered; otherwise the personal space is offered first,
   * the same fallback the assistant's `resolveSpaceId` uses, and the picker can
   * override it.
   */
  const target = fixedSpaceId ?? chosenSpace ?? spaces.find((space) => space.isDefault)?.id ?? null
  const { categories, createCategory } = useCategories(target ?? undefined, messages)

  /**
   * Choosing a different space drops every category already picked: a category
   * belongs to one space, and the composite foreign key on `transaction_items`
   * would refuse a borrowed one at the database.
   */
  const chooseSpace = (id: string) => {
    setChosenSpace(id)
    setLines((current) =>
      current.map((line) => (line.categoryId ? { ...line, categoryId: null } : line))
    )
    setCreatingFor(null)
  }

  const editLine = (key: number, change: Partial<DraftLine>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...change } : line)))

  const isCurrencyValid = CURRENCY_PATTERN.test(currencyCode)
  const isLineValid = (line: DraftLine) => line.name.trim() !== '' && parseAmount(line.amount) !== null
  const canSave = Boolean(target) && isCurrencyValid && lines.every(isLineValid) && !isSaving

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!canSave || !target) return
    onSubmit({
      spaceId: target,
      title,
      currencyCode,
      dateInput: date,
      items: lines.map((line) => ({
        id: line.id,
        name: line.name,
        // Valid by `canSave`; the fallback is here because the type says so.
        amount: parseAmount(line.amount) ?? 0,
        categoryId: line.categoryId,
      })),
    })
  }

  const saveCategory = async () => {
    if (!target || !categoryName.trim() || creatingFor === null) return
    setIsCreatingCategory(true)
    const category = await createCategory({ spaceId: target, name: categoryName, kind: categoryKind })
    setIsCreatingCategory(false)
    if (!category) return
    editLine(creatingFor, { categoryId: category.id })
    setCreatingFor(null)
    setCategoryName('')
    setCategoryKind('expense')
  }

  const spaceName = (id: string) => spaces.find((space) => space.id === id)?.name ?? ''
  const chosen = (id: string | null): Category | undefined =>
    id ? categories.find((category) => category.id === id) : undefined

  const titleId = useId()
  const dateId = useId()
  const currencyId = useId()

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {/* Absent when the space is already settled: the dashboard's filter has
          answered it, or — editing — the database has, since `space_id` carries
          no update grant and a transaction cannot move between spaces at all. */}
      {!fixedSpaceId && (
        <Field label={d.space}>
          <DropdownMenu>
            <MenuButton disabled={spaces.length === 0}>
              {target ? spaceName(target) : d.space}
            </MenuButton>
            <DropdownMenuContent align="start" className="min-w-56">
              {spaces.map((space) => (
                <DropdownMenuItem key={space.id} onClick={() => chooseSpace(space.id)}>
                  {space.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </Field>
      )}

      <Field label={d.titleField} htmlFor={titleId}>
        <Input
          id={titleId}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={d.titlePlaceholder}
          disabled={isSaving}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={d.date} htmlFor={dateId}>
          <Input
            id={dateId}
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            disabled={isSaving}
          />
        </Field>
        <Field label={d.currency} htmlFor={currencyId}>
          <Input
            id={currencyId}
            value={currencyCode}
            // Upper case as it is typed: the column is a domain over text with
            // `^[A-Z]{3}$` on it, and "rub" is a refusal, not a value.
            onChange={(event) => setCurrencyCode(event.target.value.toUpperCase().slice(0, 3))}
            aria-invalid={!isCurrencyValid || undefined}
            autoCapitalize="characters"
            maxLength={3}
            disabled={isSaving}
          />
        </Field>
      </div>

      <div className="flex flex-col gap-2">
        <Label className="text-xs text-muted-foreground">{d.items}</Label>
        {lines.map((line) => {
          const category = chosen(line.categoryId)
          return (
            <div key={line.key} className="flex flex-col gap-1.5 rounded-lg bg-muted/50 p-2">
              <div className="flex items-center gap-1.5">
                <Input
                  value={line.name}
                  onChange={(event) => editLine(line.key, { name: event.target.value })}
                  placeholder={d.itemNamePlaceholder}
                  aria-label={d.itemNamePlaceholder}
                  disabled={isSaving}
                />
                <Input
                  value={line.amount}
                  onChange={(event) => editLine(line.key, { amount: event.target.value })}
                  inputMode="decimal"
                  placeholder={d.amountPlaceholder}
                  aria-label={d.amountPlaceholder}
                  aria-invalid={(line.amount !== '' && parseAmount(line.amount) === null) || undefined}
                  disabled={isSaving}
                  className="w-28 shrink-0 text-right tabular-nums"
                />
                {/* Absent rather than disabled on the last line: a transaction with
                    no items is one nothing can be read back from. */}
                {lines.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={d.removeItem}
                    disabled={isSaving}
                    onClick={() => setLines((current) => current.filter((row) => row.key !== line.key))}
                  >
                    <XIcon />
                  </Button>
                )}
              </div>

              {creatingFor === line.key ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Input
                    autoFocus
                    value={categoryName}
                    onChange={(event) => setCategoryName(event.target.value)}
                    placeholder={d.categoryName}
                    aria-label={d.categoryName}
                    disabled={isCreatingCategory}
                    className="h-7 min-w-32 flex-1"
                  />
                  {/* Expense or income is the only thing that decides which side of
                      the dashboard the money lands on, so it is two visible buttons
                      rather than a menu to go looking in. */}
                  {KINDS.map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => setCategoryKind(kind)}
                      aria-pressed={categoryKind === kind}
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-xs transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                        categoryKind === kind
                          ? 'border-transparent bg-primary text-primary-foreground'
                          : 'border-border text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {kind === 'expense' ? d.expense : d.income}
                    </button>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    disabled={isCreatingCategory || !categoryName.trim()}
                    onClick={() => void saveCategory()}
                  >
                    {d.createCategory}
                  </Button>
                </div>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isSaving || !target}
                        className="h-7 self-start px-2 text-muted-foreground"
                      >
                        {category && <KindDot kind={category.kind} d={d} />}
                        <span className="truncate">{category?.name ?? d.noCategory}</span>
                        <ChevronDownIcon className="size-3.5 shrink-0" />
                      </Button>
                    }
                  />
                  <DropdownMenuContent align="start" className="min-w-56">
                    <DropdownMenuItem onClick={() => editLine(line.key, { categoryId: null })}>
                      {d.noCategory}
                    </DropdownMenuItem>
                    {/* Grouped under the two words rather than labelled row by row.
                        Names are not unique in a space and nothing stops "Rent"
                        existing as both kinds, so the heading a name sits under is
                        what tells the two apart — and the dot beside it is what
                        makes the same dot legible on the closed button. */}
                    {KINDS.map((kind) => {
                      const group = categories.filter((entry) => entry.kind === kind)
                      if (group.length === 0) return null
                      return (
                        <DropdownMenuGroup key={kind}>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel>
                            {kind === 'expense' ? d.expense : d.income}
                          </DropdownMenuLabel>
                          {group.map((entry) => (
                            <DropdownMenuItem
                              key={entry.id}
                              onClick={() => editLine(line.key, { categoryId: entry.id })}
                            >
                              <KindDot kind={entry.kind} d={d} />
                              <span className="truncate">{entry.name}</span>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuGroup>
                      )
                    })}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setCreatingFor(line.key)}>
                      {d.newCategory}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )
        })}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isSaving}
          onClick={() =>
            setLines((current) => [
              ...current,
              { key: nextKey.current++, name: '', amount: '', categoryId: null },
            ])
          }
          className="w-full justify-start px-2 text-muted-foreground"
        >
          <PlusIcon />
          {d.addItem}
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <DialogFooter>
        {/* Left of the way out, and away from Save: this is the one button in
            the dialog that cannot be taken back, so it should not sit under the
            finger that was reaching for the other one. */}
        {onDelete && (
          <Button
            type="button"
            variant="ghost"
            disabled={isSaving}
            onClick={onDelete}
            className="text-destructive hover:text-destructive sm:mr-auto"
          >
            <Trash2Icon />
            {d.deleteAction}
          </Button>
        )}
        <Button type="button" variant="outline" disabled={isSaving} onClick={onCancel}>
          {d.cancel}
        </Button>
        <Button type="submit" disabled={!canSave}>
          {isSaving ? d.saving : d.save}
        </Button>
      </DialogFooter>
    </form>
  )
}

/**
 * A transaction, being written or being corrected.
 *
 * One dialog for both because they are the same shape: the create path was
 * modelled on `create_transaction` in lib/mcp/tools.ts, and what the edit path
 * saves is the difference between what was loaded and what is on screen. Which
 * one this is depends only on whether a `transactionId` came in.
 *
 * The dialog stays mounted so it can animate itself closed, but every read is
 * gated on `open`: the dashboard renders one of these per currency card, and
 * none of them should be asking the database anything before somebody clicks.
 */
export function TransactionDialog({
  dict,
  open,
  onOpenChange,
  transactionId = null,
  spaceId,
  currency,
  onSaved,
}: {
  dict: Dictionary['dashboard']
  open: boolean
  onOpenChange: (open: boolean) => void
  /** An existing transaction to correct; absent for a new one. */
  transactionId?: string | null
  /** The dashboard's `?space=` filter, when it is set. Then there is nothing to choose. */
  spaceId?: string
  /** The card this was opened from, so its currency is already filled in. */
  currency?: string
  onSaved: () => void
}) {
  const d = dict.form
  const messages = useMemo(() => budgetMessages(dict), [dict])

  const created = useCreateTransaction(messages)
  const edited = useTransaction(open ? transactionId : null, messages)
  const isEditing = transactionId !== null
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)

  const close = () => {
    created.setError(null)
    edited.setError(null)
    setIsConfirmingDelete(false)
    onOpenChange(false)
  }

  const remove = async () => {
    if (!(await edited.deleteTransaction())) {
      // The sentence is on the form behind this, so the confirmation gets out of
      // its way rather than holding the reader in front of a failed question.
      setIsConfirmingDelete(false)
      return
    }
    setIsConfirmingDelete(false)
    onOpenChange(false)
    onSaved()
  }

  const save = async (draft: SubmittedTransaction) => {
    const ok = isEditing
      ? await edited.updateTransaction({
          title: draft.title,
          currencyCode: draft.currencyCode,
          dateInput: draft.dateInput,
          items: draft.items,
        })
      : await created.createTransaction({
          spaceId: draft.spaceId,
          title: draft.title,
          currencyCode: draft.currencyCode,
          occurredAt: occurredAtFor(draft.dateInput),
          items: draft.items,
        })
    if (!ok) return

    onOpenChange(false)
    // The totals are computed in the server component above this one, and there
    // is no cache to tag: asking for the page again is the whole of it.
    onSaved()
  }

  const existing = edited.transaction
  const initial: Initial = existing
    ? {
        title: existing.title,
        date: dateInputOf(existing.occurredAt),
        currencyCode: existing.currencyCode,
        lines: existing.items.map((item, index) => ({
          key: index,
          id: item.id,
          name: item.name,
          amount: amountInput(item.amount),
          categoryId: item.categoryId,
        })),
      }
    : {
        title: '',
        date: todayInput(),
        currencyCode: currency ?? DEFAULT_CURRENCY,
        lines: [{ key: 0, name: '', amount: '', categoryId: null }],
      }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? d.editTitle : d.newTitle}</DialogTitle>
          <DialogDescription>{isEditing ? d.editDescription : d.newDescription}</DialogDescription>
        </DialogHeader>

        {isEditing && edited.isLoading ? (
          <p role="status" className="py-8 text-center text-sm text-muted-foreground">
            {d.loading}
          </p>
        ) : isEditing && edited.isMissing ? (
          <p role="alert" className="py-8 text-center text-sm text-muted-foreground">
            {d.notFound}
          </p>
        ) : (
          <TransactionForm
            // Remounted per transaction, so the fields are seeded from what was
            // loaded instead of being copied into state after the fact.
            key={existing?.id ?? 'new'}
            d={d}
            messages={messages}
            initial={initial}
            fixedSpaceId={existing?.spaceId ?? spaceId}
            isSaving={created.isSaving || edited.isSaving}
            error={created.error ?? edited.error}
            onCancel={close}
            onDelete={existing ? () => setIsConfirmingDelete(true) : undefined}
            onSubmit={(draft) => void save(draft)}
          />
        )}
      </DialogContent>

      {/* Inside the dialog it interrupts, so closing it leaves the form open
          exactly as it was. Nothing in `budget` is soft-deleted — there is no
          trash to fish a transaction back out of — so the question is asked
          before the statement, not undone after it. */}
      <AlertDialog
        open={isConfirmingDelete}
        onOpenChange={(next) => {
          if (!next) setIsConfirmingDelete(false)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{d.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{d.deleteBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={edited.isSaving}>{d.cancel}</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={edited.isSaving}
              onClick={() => void remove()}
            >
              {edited.isSaving ? d.deleting : d.deleteAction}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
