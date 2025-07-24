import * as React from 'react';

export const useIsOverflow = (ref: React.RefObject<HTMLElement | null>, callback?: (isOverflow: boolean) => void) => {
  const [isOverflow, setIsOverflow] = React.useState<boolean | undefined>(undefined);

  React.useLayoutEffect(() => {
    const { current } = ref;

    const trigger = () => {
      if (!current) return;
      
      const hasOverflow = current.scrollHeight > current.clientHeight;
      setIsOverflow(hasOverflow);
      
      if (callback) callback(hasOverflow);
    };

    if (current) {
      if ('ResizeObserver' in window) {
        const resizeObserver = new ResizeObserver(trigger);
        resizeObserver.observe(current);
        
        // Cleanup function
        return () => {
          resizeObserver.disconnect();
        };
      }
      
      // Add a small delay to ensure the element is fully rendered
      setTimeout(trigger, 0);
    }
  }, [callback, ref]);

  return isOverflow;
}; 