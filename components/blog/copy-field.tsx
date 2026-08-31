'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { type Locale } from '@/lib/i18n/config'
import { useLocale } from '@/lib/i18n/use-locale'
import { cn } from '@/lib/utils'

/**
 * Microcopy lives here rather than in the dictionaries: `getDictionary()` is
 * server-only, and this component is not. Same local map the language switcher
 * keeps for the two labels it needs.
 */
const LABELS: Record<Locale, { copy: string; copied: string; failed: string }> = {
  en: { copy: 'Copy', copied: 'Copied', failed: 'Select the text and copy it by hand' },
  ru: {
    copy: 'Скопировать',
    copied: 'Скопировано',
    failed: 'Выделите текст и скопируйте вручную',
  },
}

const RESET_AFTER = 2000

type CopyState = 'idle' | 'copied' | 'failed'

/**
 * Module scope, like `rememberChoice` in the language switcher: these reach for
 * `navigator` and `window`, and the React Compiler lint rules reject touching
 * anything defined outside the component from inside its render scope.
 */
async function writeToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // No clipboard permission, or an insecure context. The button must say so
    // rather than look like it worked.
    return false
  }
}

/** Leaves the value selected so the fallback message is followed by one keystroke. */
function selectContents(node: HTMLElement | null) {
  if (!node) return
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.selectNodeContents(node)
  selection.removeAllRanges()
  selection.addRange(range)
}

export function CopyField({
  value,
  label,
  multiline = false,
}: {
  value: string
  /** Small caption above the box, naming the field this value goes into. */
  label?: string
  /** Ready-made prompts wrap; server URLs break anywhere. */
  multiline?: boolean
}) {
  const locale = useLocale()
  const labels = LABELS[locale]
  const [state, setState] = useState<CopyState>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const text = useRef<HTMLElement>(null)

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  const copy = () => {
    if (timer.current) clearTimeout(timer.current)
    void writeToClipboard(value).then((copied) => {
      setState(copied ? 'copied' : 'failed')
      if (copied) {
        timer.current = setTimeout(() => setState('idle'), RESET_AFTER)
        return
      }
      // The instruction is only honest if the text is actually selected, and it
      // stays on screen until the next attempt — long enough to act on.
      selectContents(text.current)
    })
  }

  return (
    <div className="not-prose my-6">
      {label && <p className="mb-1.5 text-sm text-muted-foreground">{label}</p>}
      <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3">
        <code
          ref={text}
          // py-1 pads the 20px line box out to the button's 28px, so the first
          // line sits on the button's centre line instead of above it.
          className={cn(
            'min-w-0 flex-1 py-1 font-mono text-sm',
            multiline ? 'whitespace-pre-wrap' : 'break-all'
          )}
        >
          {value}
        </code>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={copy}
          aria-label={labels.copy}
        >
          {state === 'copied' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        </Button>
      </div>
      {/* Fixed height so confirming a copy does not shift the article. */}
      <p aria-live="polite" className="mt-1.5 h-4 text-xs text-muted-foreground">
        {state === 'copied' ? labels.copied : state === 'failed' ? labels.failed : ''}
      </p>
    </div>
  )
}
