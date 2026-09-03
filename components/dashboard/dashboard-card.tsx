import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * The card as it looks on the shadcn.com landing page: a 24px corner, a soft
 * shadow, a hairline ring and 20px of internal spacing.
 *
 * These are overrides rather than edits to components/ui/card.tsx, which is the
 * plainer variant the settings pages are already drawn with. Changing the shared
 * component to suit the dashboard would restyle those pages by accident.
 */
export function DashboardCard({ className, ...props }: React.ComponentProps<typeof Card>) {
  return (
    <Card
      className={cn(
        'rounded-[min(var(--radius-4xl),24px)] shadow-sm ring-foreground/5 [--card-spacing:--spacing(5)] dark:ring-foreground/10',
        className
      )}
      {...props}
    />
  )
}
