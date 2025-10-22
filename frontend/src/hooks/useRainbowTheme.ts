import { useCallback, useRef, useEffect } from 'react';
import { usePreferences } from '../contexts/PreferencesContext';
import type { ThemeMode } from '../constants/theme';
import rainbowStyles from '../styles/rainbow.module.css';

interface RainbowThemeHook {
  themeMode: ThemeMode;
  isRainbowMode: boolean;
  isToggleDisabled: boolean;
  toggleTheme: () => void;
  activateRainbow: () => void;
  deactivateRainbow: () => void;
}

const allowRainbowMode = false; // Override to allow/disallow fun

export function useRainbowTheme(): RainbowThemeHook {
  const { preferences, updatePreference } = usePreferences();
  const themeMode = preferences.theme;

  // Track rapid toggles for easter egg
  const toggleCount = useRef(0);
  const lastToggleTime = useRef(Date.now());
  const isToggleDisabled = useRef(false);
  const rainbowIntervalRef = useRef<number | null>(null);

  // Apply rainbow class to body whenever theme changes
  useEffect(() => {
    const root = document.documentElement;

    const clearRainbowInterval = () => {
      if (rainbowIntervalRef.current !== null) {
        window.clearInterval(rainbowIntervalRef.current);
        rainbowIntervalRef.current = null;
      }
    };

    const resetRainbowVariables = () => {
      root.style.removeProperty('--rainbow-hue');
      root.style.removeProperty('--rainbow-angle');
      root.style.removeProperty('--rainbow-sparkle-opacity');
      root.style.removeProperty('--rainbow-glow-strength');
    };

    if (themeMode === 'rainbow') {
      document.body.classList.add('rainbow-mode-active');
      showRainbowNotification();

      const applyRainbowVariables = () => {
        const hue = Math.floor(Math.random() * 360);
        const angle = Math.floor(Math.random() * 360);
        const sparkle = (Math.random() * 0.4 + 0.4).toFixed(2);
        const glow = (Math.random() * 0.3 + 0.35).toFixed(2);

        root.style.setProperty('--rainbow-hue', hue.toString());
        root.style.setProperty('--rainbow-angle', `${angle}deg`);
        root.style.setProperty('--rainbow-sparkle-opacity', sparkle);
        root.style.setProperty('--rainbow-glow-strength', glow);
      };

      applyRainbowVariables();
      clearRainbowInterval();
      rainbowIntervalRef.current = window.setInterval(applyRainbowVariables, 1400);
    } else {
      document.body.classList.remove('rainbow-mode-active');
      clearRainbowInterval();
      resetRainbowVariables();
    }

    return () => {
      clearRainbowInterval();
      resetRainbowVariables();
      document.body.classList.remove('rainbow-mode-active');
    };
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
    notification.className = rainbowStyles.rainbowNotification;
    notification.innerHTML = '🌈 RAINBOW MODE ACTIVATED! 🌈<br><small>Button disabled for 3 seconds, then click to exit</small>';

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

    const rootStyles = getComputedStyle(document.documentElement);
    const hueValue = rootStyles.getPropertyValue('--rainbow-hue').trim();
    const baseHue = Number.isNaN(Number.parseFloat(hueValue))
      ? 0
      : Number.parseFloat(hueValue);
    const exitHue = (baseHue + 200) % 360;
    const accentHue = (exitHue + 45) % 360;

    notification.innerHTML = '🌙 Rainbow mode deactivated — back to reality';
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, hsla(${exitHue}deg, 85%, 40%, 0.85), hsla(${accentHue}deg, 90%, 45%, 0.9));
      background-size: 220% 220%;
      animation: rainbowBackground 1.8s ease infinite;
      color: white;
      padding: 15px 20px;
      border-radius: 25px;
      font-weight: bold;
      font-size: 16px;
      z-index: 1000;
      border: 2px solid hsla(${accentHue}deg, 95%, 75%, 0.9);
      box-shadow: 0 0 25px hsla(${accentHue}deg, 100%, 65%, 0.45);
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
    if (isToggleDisabled.current) {
      return;
    }

    const currentTime = Date.now();

    // Simple exit from rainbow mode with single click (after cooldown period)
    if (themeMode === 'rainbow') {
      updatePreference('theme', 'light');
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

    // Easter egg: Activate rainbow mode after 10 rapid toggles
    if (allowRainbowMode && toggleCount.current >= 10) {
      updatePreference('theme', 'rainbow');
      console.log('🌈 RAINBOW MODE ACTIVATED! 🌈 You found the secret easter egg!');
      console.log('🌈 Button will be disabled for 3 seconds, then click once to exit!');

      // Disable toggle for 3 seconds
      isToggleDisabled.current = true;
      setTimeout(() => {
        isToggleDisabled.current = false;
        console.log('🌈 Theme toggle re-enabled! Click once to exit rainbow mode.');
      }, 3000);

      // Reset counter
      toggleCount.current = 0;
      return;
    }

    // Normal theme switching
    const nextTheme = themeMode === 'light' ? 'dark' : 'light';
    updatePreference('theme', nextTheme);
  }, [themeMode, updatePreference]);

  const activateRainbow = useCallback(() => {
    updatePreference('theme', 'rainbow');
    console.log('🌈 Rainbow mode manually activated!');
  }, [updatePreference]);

  const deactivateRainbow = useCallback(() => {
    if (themeMode === 'rainbow') {
      updatePreference('theme', 'light');
      console.log('🌈 Rainbow mode manually deactivated.');
    }
  }, [themeMode, updatePreference]);

  return {
    themeMode,
    isRainbowMode: themeMode === 'rainbow',
    isToggleDisabled: isToggleDisabled.current,
    toggleTheme,
    activateRainbow,
    deactivateRainbow,
  };
}
