import { type MonthPoint } from '@/lib/budget/dashboard'
import { formatMoney, formatMonth } from '@/lib/budget/format'
import { type Locale } from '@/lib/i18n/config'
import { cn } from '@/lib/utils'

/**
 * A month with spending never draws shorter than this share of the chart.
 *
 * Heights stay strictly proportional — a bar that lies about a magnitude is
 * worse than no chart — so this is only a floor that keeps a real but small
 * month from collapsing into nothing. It sits just above the hairline an empty
 * month draws, which is the one distinction the eye has to be able to make;
 * telling €105 from €300 is then back to honest proportion.
 */
const MIN_BAR_SHARE = 4

/**
 * The six-month spend chart, built the way shadcn.com builds its own: flex
 * columns with a percentage height each. A charting library would add a client
 * bundle and a hydration boundary to draw six rectangles.
 */
export function MonthBars({
  locale,
  currency,
  months,
}: {
  locale: Locale
  currency: string
  months: MonthPoint[]
}) {
  const peak = months.reduce((max, point) => Math.max(max, point.total), 0)

  return (
    <div className="flex h-24 w-full items-end gap-2">
      {months.map((point, index) => {
        const isCurrent = index === months.length - 1
        const height =
          point.total > 0 && peak > 0
            ? Math.max((point.total / peak) * 100, MIN_BAR_SHARE)
            : null

        return (
          <div key={point.month} className="flex h-full flex-1 flex-col justify-end gap-2">
            <div
              data-index={index}
              data-empty={height === null ? '' : undefined}
              title={`${formatMonth(locale, point.month)}: ${formatMoney(locale, currency, point.total)}`}
              className={cn(
                'rounded-md',
                // An empty month keeps a hairline on the baseline rather than
                // vanishing: a gap would read as data that failed to load.
                height === null
                  ? 'h-0.5 bg-foreground/15'
                  : // Tones come from --primary rather than the --chart-* ramp,
                    // which runs light-to-dark and so inverts between themes:
                    // chart-5 is the darkest swatch, all but invisible on a dark
                    // card. --primary flips with the theme and stays legible.
                    isCurrent
                    ? 'bg-primary'
                    : 'bg-primary/30'
              )}
              style={height === null ? undefined : { height: `${height}%` }}
            />
            <span
              className={cn(
                'text-center text-xs',
                isCurrent ? 'font-medium text-foreground' : 'text-muted-foreground'
              )}
            >
              {formatMonth(locale, point.month, 'short')}
            </span>
          </div>
        )
      })}
    </div>
  )
}
