import React from 'react';

type PrivateContentProps = {
  children: React.ReactNode;
  as?: 'span' | 'div';
} & (
  | React.HTMLAttributes<HTMLSpanElement>
  | React.HTMLAttributes<HTMLDivElement>
);

/**
 * Wrapper component for content that should not be captured by analytics tools.
 * Currently applies the 'ph-no-capture' className to prevent PostHog capture.
 *
 * Use this component to wrap any content containing sensitive or private information
 * that should be excluded from analytics tracking.
 *
 * @example
 * // For inline content (default):
 * <PrivateContent>
 *   <Text>Sensitive filename.pdf</Text>
 * </PrivateContent>
 *
 * // For block-level content:
 * <PrivateContent as="div">
 *   <div style={{ height: '100%' }}>Block content</div>
 * </PrivateContent>
 */
export const PrivateContent: React.FC<PrivateContentProps> = ({
  children,
  as: Component = 'span',
  className = '',
  ...props
}) => {
  const combinedClassName = `ph-no-capture${className ? ` ${className}` : ''}`;

  return (
    <Component className={combinedClassName} {...props}>
      {children}
    </Component>
  );
};
