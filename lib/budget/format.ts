import { type Locale } from '@/lib/i18n/config'

/**
 * Money, in the reader's language and the transaction's own currency.
 *
 * There are no FX rates in this project, so nothing is ever converted — the
 * currency code is passed straight through and each currency is totalled on its
 * own card. Fractions are dropped: a dashboard compares magnitudes, and cents on
 * a four-figure total are noise. `currency_code` is a domain checked against
 * /^[A-Z]{3}$/, so an unknown-but-well-formed code still formats, falling back
 * to printing the code itself rather than throwing.
 */
export function formatMoney(
  locale: Locale,
  currency: string,
  amount: number,
  { cents = false }: { cents?: boolean } = {}
): string {
  // Totals drop the fraction: on a four-figure month the cents are noise, and
  // the headline is there to be compared at a glance. Single purchases keep it,
  // because that is where the difference between 5.60 and 6 is the whole point.
  const digits = cents ? 2 : 0
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(amount)
  } catch {
    const value = new Intl.NumberFormat(locale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(amount)
    return `${value} ${currency}`
  }
}

/** `2026-09-01` -> `сентябрь` / `September`. */
export function formatMonth(locale: Locale, iso: string, style: 'long' | 'short' = 'long'): string {
  return new Intl.DateTimeFormat(locale, { month: style, timeZone: 'UTC' }).format(new Date(iso))
}

/** `2026-09-03T…` -> `3 сент.` / `Sep 3`. */
export function formatDay(locale: Locale, iso: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(iso)
  )
}

/**
 * Month-over-month change as a percentage.
 *
 * Null when there is nothing to compare against: with no spend last month any
 * spend at all is an infinite rise, and "+∞%" says less than showing nothing.
 */
export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return ((current - previous) / previous) * 100
}
