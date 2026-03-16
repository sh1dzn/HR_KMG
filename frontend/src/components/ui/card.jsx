function cn(...inputs) {
  return inputs.filter(Boolean).join(' ')
}

export function Card({ className = '', style = {}, ...props }) {
  return (
    <div
      className={cn('rounded-xl', className)}
      style={{
        backgroundColor: 'var(--bg-primary)',
        border: '1px solid var(--border-secondary)',
        boxShadow: '0px 1px 2px rgba(10,13,18,0.05)',
        ...style,
      }}
      {...props}
    />
  )
}

export function CardHeader({ className = '', ...props }) {
  return <div className={cn('flex flex-col space-y-1 p-5 pb-0', className)} {...props} />
}

export function CardTitle({ className = '', ...props }) {
  return (
    <h3
      className={cn('text-sm font-semibold', className)}
      style={{ color: 'var(--text-primary)' }}
      {...props}
    />
  )
}

export function CardDescription({ className = '', ...props }) {
  return (
    <p
      className={cn('text-sm leading-5', className)}
      style={{ color: 'var(--text-tertiary)' }}
      {...props}
    />
  )
}

export function CardContent({ className = '', ...props }) {
  return <div className={cn('p-5 pt-3', className)} {...props} />
}
