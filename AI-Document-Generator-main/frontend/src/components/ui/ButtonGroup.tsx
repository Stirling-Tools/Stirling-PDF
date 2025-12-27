import { PropsWithChildren } from 'react'

interface ButtonGroupProps extends PropsWithChildren {
  align?: 'start' | 'center' | 'end'
}

export function ButtonGroup({ children, align = 'start' }: ButtonGroupProps) {
  const alignment =
    align === 'center' ? 'justify-center' : align === 'end' ? 'justify-end' : 'justify-start'
  return <div className={`flex flex-wrap gap-2 ${alignment}`}>{children}</div>
}
