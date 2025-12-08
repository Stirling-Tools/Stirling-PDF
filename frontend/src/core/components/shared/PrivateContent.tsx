import React from 'react';

interface PrivateContentProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
}

/**
 * Wrapper component for content that should not be captured by analytics tools.
 * Currently applies the 'ph-no-capture' className to prevent PostHog capture.
 *
 * Uses `display: contents` to be layout-invisible - the wrapper exists in the DOM
 * for analytics filtering, but doesn't affect layout, flexbox, grid, or styling.
 *
 * Use this component to wrap any content containing sensitive or private information
 * that should be excluded from analytics tracking.
 *
 * @example
 * <PrivateContent>
 *   <Text>Sensitive filename.pdf</Text>
 * </PrivateContent>
 *
 * <PrivateContent>
 *   <img src={thumbnail} alt="preview" />
 * </PrivateContent>
 */
export const PrivateContent: React.FC<PrivateContentProps> = ({
  children,
  className = '',
  style,
  ...props
}) => {
  const combinedClassName = `ph-no-capture${className ? ` ${className}` : ''}`;
  const combinedStyle = { display: 'contents' as const, ...style };

  return (
    <span className={combinedClassName} style={combinedStyle} {...props}>
      {children}
    </span>
  );
};
