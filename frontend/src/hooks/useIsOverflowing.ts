import * as React from 'react';


/**
 Hook to detect if an element's content overflows its container


    Parameters:
    - ref: React ref to the element to monitor
    - callback: Optional callback function called when overflow state changes

    Returns: boolean | undefined - true if overflowing, false if not, undefined before first check

    Usage example:

        useEffect(() => {
        if (isOverflow) {
            // Do something
        }
        }, [isOverflow]);

        const scrollableRef = useRef<HTMLDivElement>(null);
        const isOverflow = useIsOverflowing(scrollableRef);

        Fallback example (for browsers without ResizeObserver):

        return (
        <div ref={scrollableRef} className="h-64 overflow-y-auto">
            {Content that might overflow}
        </div>
        );
*/


export const useIsOverflowing = (ref: React.RefObject<HTMLElement | null>, callback?: (isOverflow: boolean) => void) => {
  // State to track overflow status
  const [isOverflow, setIsOverflow] = React.useState<boolean | undefined>(undefined);

  React.useLayoutEffect(() => {
    const { current } = ref;

    // Function to check if element is overflowing
    const trigger = () => {
      if (!current) return;
      
      // Compare scroll height (total content height) vs client height (visible height)
      const hasOverflow = current.scrollHeight > current.clientHeight;
      setIsOverflow(hasOverflow);
      
      // Call optional callback with overflow state
      if (callback) callback(hasOverflow);
    };

    if (current) {
      // Use ResizeObserver for modern browsers (real-time detection)
      if ('ResizeObserver' in window) {
        const resizeObserver = new ResizeObserver(trigger);
        resizeObserver.observe(current);
        
        // Cleanup function to disconnect observer
        return () => {
          resizeObserver.disconnect();
        };
      }
      
      // Fallback for browsers without ResizeObserver support
      // Add a small delay to ensure the element is fully rendered
      setTimeout(trigger, 0);
    }
  }, [callback, ref]);

  return isOverflow;
}; 