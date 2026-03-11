import { cn } from '../../lib/utils'

export function Card({ className = '', ...props }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-slate-200/80 bg-white/90 text-slate-950 shadow-sm backdrop-blur-sm',
        className
      )}
      {...props}
    />
  )
}

export function CardHeader({ className = '', ...props }) {
  return <div className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
}

export function CardTitle({ className = '', ...props }) {
  return <h3 className={cn('text-sm font-semibold tracking-tight text-slate-950', className)} {...props} />
}

export function CardDescription({ className = '', ...props }) {
  return <p className={cn('text-sm leading-6 text-slate-500', className)} {...props} />
}

export function CardContent({ className = '', ...props }) {
  return <div className={cn('p-6 pt-0', className)} {...props} />
}
