import { useState, useCallback, useRef, useEffect } from 'react';

type ThemeMode = 'light' | 'dark' | 'rainbow';

interface RainbowThemeHook {
  themeMode: ThemeMode;
  isRainbowMode: boolean;
  isToggleDisabled: boolean;
  toggleTheme: () => void;
  activateRainbow: () => void;
  deactivateRainbow: () => void;
}

export function useRainbowTheme(initialTheme: 'light' | 'dark' = 'light'): RainbowThemeHook {
  // Get theme from localStorage or use initial
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem('stirling-theme');
    if (stored && ['light', 'dark', 'rainbow'].includes(stored)) {
      return stored as ThemeMode;
    }
    return initialTheme;
  });

  // Track rapid toggles for easter egg
  const toggleCount = useRef(0);
  const lastToggleTime = useRef(Date.now());
  const [isToggleDisabled, setIsToggleDisabled] = useState(false);

  // Save theme to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('stirling-theme', themeMode);
    
    // Apply rainbow class to body if in rainbow mode
    if (themeMode === 'rainbow') {
      document.body.classList.add('rainbow-mode-active');
      
      // Show easter egg notification
      showRainbowNotification();
    } else {
      document.body.classList.remove('rainbow-mode-active');
    }
  }, [themeMode]);

  const showRainbowNotification = () => {
    // Remove any existing notification
    const existingNotification = document.getElementById('rainbow-notification');
    if (existingNotification) {
      existingNotification.remove();
    }

    // Create and show rainbow notification
    const notification = document.createElement('div');
    notification.id = 'rainbow-notification';
    notification.innerHTML = '🌈 RAINBOW MODE ACTIVATED! 🌈<br><small>Button disabled for 3 seconds, then click to exit</small>';
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(45deg, #ff0000, #ff8800, #ffff00, #88ff00, #00ff88, #00ffff, #0088ff, #8800ff);
      background-size: 300% 300%;
      animation: rainbowBackground 1s ease infinite;
      color: white;
      padding: 15px 20px;
      border-radius: 25px;
      font-weight: bold;
      font-size: 16px;
      z-index: 1000;
      border: 2px solid white;
      box-shadow: 0 0 20px rgba(255, 255, 255, 0.8);
      user-select: none;
      pointer-events: none;
      transition: opacity 0.3s ease;
    `;
    
    document.body.appendChild(notification);

    // Auto-remove notification after 3 seconds
    setTimeout(() => {
      if (notification) {
        notification.style.opacity = '0';
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
        }, 300);
      }
    }, 3000);
  };

  const showExitNotification = () => {
    // Remove any existing notification
    const existingNotification = document.getElementById('rainbow-exit-notification');
    if (existingNotification) {
      existingNotification.remove();
    }

    // Create and show exit notification
    const notification = document.createElement('div');
    notification.id = 'rainbow-exit-notification';
    notification.innerHTML = '🌙 Rainbow mode deactivated';
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(45deg, #333, #666);
      color: white;
      padding: 15px 20px;
      border-radius: 25px;
      font-weight: bold;
      font-size: 16px;
      z-index: 1000;
      border: 2px solid #999;
      box-shadow: 0 0 20px rgba(0, 0, 0, 0.3);
      user-select: none;
      pointer-events: none;
      transition: opacity 0.3s ease;
    `;
    
    document.body.appendChild(notification);

    // Auto-remove notification after 2 seconds
    setTimeout(() => {
      if (notification) {
        notification.style.opacity = '0';
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
        }, 300);
      }
    }, 2000);
  };

  const toggleTheme = useCallback(() => {
    // Don't allow toggle if disabled
    if (isToggleDisabled) {
      return;
    }

    const currentTime = Date.now();
    
    // Simple exit from rainbow mode with single click (after cooldown period)
    if (themeMode === 'rainbow') {
      setThemeMode('light');
      console.log('🌈 Rainbow mode deactivated. Thanks for trying it!');
      showExitNotification();
      return;
    }
    
    // Reset counter if too much time has passed (2.5 seconds)
    if (currentTime - lastToggleTime.current > 2500) {
      toggleCount.current = 1;
    } else {
      toggleCount.current++;
    }
    lastToggleTime.current = currentTime;

    // Easter egg: Activate rainbow mode after 6 rapid toggles
    if (toggleCount.current >= 6) {
      setThemeMode('rainbow');
      console.log('🌈 RAINBOW MODE ACTIVATED! 🌈 You found the secret easter egg!');
      console.log('🌈 Button will be disabled for 3 seconds, then click once to exit!');
      
      // Disable toggle for 3 seconds
      setIsToggleDisabled(true);
      setTimeout(() => {
        setIsToggleDisabled(false);
        console.log('🌈 Theme toggle re-enabled! Click once to exit rainbow mode.');
      }, 3000);
      
      // Reset counter
      toggleCount.current = 0;
      return;
    }

    // Normal theme switching
    setThemeMode(prevMode => prevMode === 'light' ? 'dark' : 'light');
  }, [themeMode, isToggleDisabled]);

  const activateRainbow = useCallback(() => {
    setThemeMode('rainbow');
    console.log('🌈 Rainbow mode manually activated!');
  }, []);

  const deactivateRainbow = useCallback(() => {
    if (themeMode === 'rainbow') {
      setThemeMode('light');
      console.log('🌈 Rainbow mode manually deactivated.');
    }
  }, [themeMode]);

  return {
    themeMode,
    isRainbowMode: themeMode === 'rainbow',
    isToggleDisabled,
    toggleTheme,
    activateRainbow,
    deactivateRainbow,
  };
}