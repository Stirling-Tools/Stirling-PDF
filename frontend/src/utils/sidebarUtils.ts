
/**
 * Gets the All tools sidebar 
 * @returns Object containing the sidebar rect and whether it's the correct sidebar
 */
export function getSidebarRect(): { rect: DOMRect | null, isCorrectSidebar: boolean } {
    // Find the rightmost sidebar - this will be the "All Tools" expanded panel
    const allSidebars = [];
  
    // Find the QuickAccessBar (narrow left bar)
    const quickAccessBar = document.querySelector('[data-sidebar="quick-access"]');
    if (quickAccessBar) {
      const rect = quickAccessBar.getBoundingClientRect();
      if (rect.width > 0) {
        allSidebars.push({
          element: 'QuickAccessBar',
          selector: '[data-sidebar="quick-access"]',
          rect
        });
      }
    }
  
    // Find the tool panel (the expanded "All Tools" panel)  
    const toolPanel = document.querySelector('[data-sidebar="tool-panel"]');
    if (toolPanel) {
      const rect = toolPanel.getBoundingClientRect();
      if (rect.width > 0) {
        allSidebars.push({
          element: 'ToolPanel',
          selector: '[data-sidebar="tool-panel"]',
          rect
        });
      }
    }
  
    // Use the rightmost sidebar (which should be the tool panel when expanded)
    if (allSidebars.length > 0) {
      const rightmostSidebar = allSidebars.reduce((rightmost, current) => {
        return current.rect.right > rightmost.rect.right ? current : rightmost;
      });
  
      // Only consider it correct if we're using the ToolPanel (expanded All Tools sidebar)
      const isCorrectSidebar = rightmostSidebar.element === 'ToolPanel';
      return { rect: rightmostSidebar.rect, isCorrectSidebar };
    }
  
    console.warn('⚠️ No sidebars found, using fallback positioning');
    // Final fallback
    return { rect: new DOMRect(0, 0, 280, window.innerHeight), isCorrectSidebar: false };
  } 