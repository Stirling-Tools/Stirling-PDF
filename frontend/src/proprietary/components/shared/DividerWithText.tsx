import '@app/components/shared/dividerWithText/DividerWithText.css';

interface TextDividerProps {
  text?: string
  className?: string
  style?: React.CSSProperties
  variant?: 'default' | 'subcategory'
  respondsToDarkMode?: boolean
  opacity?: number
}

export default function DividerWithText({ text, className = '', style, variant = 'default', respondsToDarkMode = true, opacity }: TextDividerProps) {
  const variantClass = variant === 'subcategory' ? 'subcategory' : '';
  const themeClass = respondsToDarkMode ? '' : 'force-light';
  const styleWithOpacity = opacity !== undefined ? { ...(style || {}), ['--text-divider-opacity' as any]: opacity } : style;

  if (text) {
    return (
      <div
        className={`text-divider ${variantClass} ${themeClass} ${className}`}
        style={styleWithOpacity}
      >
        <div className="text-divider__rule" />
        <span className="text-divider__label">{text}</span>
        <div className="text-divider__rule" />
      </div>
    );
  }

  return (
    <div
      className={`h-px my-2.5 ${themeClass} ${className}`}
      style={styleWithOpacity}
    />
  );
}
