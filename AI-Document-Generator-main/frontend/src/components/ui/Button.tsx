import { ButtonHTMLAttributes } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent'
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

const base =
  'inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 focus-visible:ring-offset-slate-950 disabled:opacity-50 disabled:cursor-not-allowed'

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-blue-600 hover:bg-blue-500 text-white',
  secondary: 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700',
  ghost: 'bg-transparent hover:bg-slate-900 text-slate-300 border border-transparent',
  danger: 'bg-rose-600 hover:bg-rose-500 text-white',
  accent: 'bg-emerald-600 hover:bg-emerald-500 text-white',
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'text-xs px-3 py-1.5',
  md: 'text-sm px-4 py-2',
  lg: 'text-base px-5 py-3',
  icon: 'p-2',
}

export function Button({ variant = 'primary', size = 'md', className = '', ...props }: ButtonProps) {
  const classes = [base, variantStyles[variant], sizeStyles[size], className].filter(Boolean).join(' ')
  return <button className={classes} {...props} />
}
