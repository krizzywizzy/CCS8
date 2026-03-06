/**
 * Floating Action Button (FAB) Module
 * Provides font size adjustment and theme toggle functionality
 * 
 * Features:
 * - Increase/Decrease font size with local storage persistence
 * - Toggle between light and dark themes
 * - Accessibility-first with ARIA labels and keyboard support
 * - Respects prefers-reduced-motion preference
 */

(function () {
  'use strict';

  // Configuration
  const FAB_CONFIG = {
    FONT_SIZE_STEP: 12.5,
    MAX_FONT_SCALE: 4,
    STORAGE_KEYS: {
      FONT_SCALE: 'fab_font_scale',
      THEME: 'fab_theme'
    },
    CLASS_NAMES: {
      DARK_MODE: 'dark-mode',
      FONT_INCREASED: 'fab-font-increased'
    }
  };

  /**
   * Initialize the FAB module
   * Restores saved preferences and sets up event listeners
   */
  function initFAB() {
    // Restore saved preferences from localStorage
    restoreFontSize();
    restoreTheme();

    // Set up event listeners
    const increaseFontBtn = document.getElementById('fab-btn-increase');
    const decreaseFontBtn = document.getElementById('fab-btn-decrease');
    const toggleThemeBtn = document.getElementById('fab-btn-toggle-theme');

    if (increaseFontBtn) {
      increaseFontBtn.addEventListener('click', increaseFontSize);
    }

    if (decreaseFontBtn) {
      decreaseFontBtn.addEventListener('click', decreaseFontSize);
    }

    if (toggleThemeBtn) {
      toggleThemeBtn.addEventListener('click', toggleTheme);
    }

    // Log FAB initialization (helpful for debugging)
    console.log('FAB module initialized');
  }

  /**
   * Increase font size by incrementing the HTML element's font-size
   */
  function increaseFontSize() {
    const html = document.documentElement;
    let currentScale = parseInt(localStorage.getItem(FAB_CONFIG.STORAGE_KEYS.FONT_SCALE)) || 0;

    if (currentScale < FAB_CONFIG.MAX_FONT_SCALE) {
      currentScale++;
      localStorage.setItem(FAB_CONFIG.STORAGE_KEYS.FONT_SCALE, currentScale);
      applyFontScale(currentScale);
      announceToScreenReader(`Font size increased to ${currentScale * FAB_CONFIG.FONT_SIZE_STEP + 100}%`);
    } else {
      announceToScreenReader('Maximum font size reached');
    }
  }

  /**
   * Decrease font size by decrementing the HTML element's font-size
   */
  function decreaseFontSize() {
    const html = document.documentElement;
    let currentScale = parseInt(localStorage.getItem(FAB_CONFIG.STORAGE_KEYS.FONT_SCALE)) || 0;

    if (currentScale > 0) {
      currentScale--;
      localStorage.setItem(FAB_CONFIG.STORAGE_KEYS.FONT_SCALE, currentScale);
      applyFontScale(currentScale);
      announceToScreenReader(`Font size decreased to ${currentScale * FAB_CONFIG.FONT_SIZE_STEP + 100}%`);
    } else {
      announceToScreenReader('Minimum font size reached');
    }
  }

  /**
   * Apply font scale by adding/removing CSS classes
   * @param {number} scale - Scale level (0-4)
   */
  function applyFontScale(scale) {
    const html = document.documentElement;

    // Remove all font scale classes
    html.classList.remove(
      FAB_CONFIG.CLASS_NAMES.FONT_INCREASED,
      'fab-font-increased-2x',
      'fab-font-increased-3x',
      'fab-font-increased-4x'
    );

    // Add appropriate class based on scale
    if (scale > 0) {
      html.classList.add(FAB_CONFIG.CLASS_NAMES.FONT_INCREASED);
      if (scale >= 2) {
        html.classList.add('fab-font-increased-2x');
      }
      if (scale >= 3) {
        html.classList.add('fab-font-increased-3x');
      }
      if (scale >= 4) {
        html.classList.add('fab-font-increased-4x');
      }
    }
  }

  /**
   * Restore font size from localStorage
   */
  function restoreFontSize() {
    const savedScale = parseInt(localStorage.getItem(FAB_CONFIG.STORAGE_KEYS.FONT_SCALE)) || 0;
    if (savedScale > 0) {
      applyFontScale(savedScale);
    }
  }

  /**
   * Toggle between light and dark themes
   */
  function toggleTheme() {
    const body = document.body;
    const isDarkMode = body.classList.toggle(FAB_CONFIG.CLASS_NAMES.DARK_MODE);

    // Save theme preference
    localStorage.setItem(
      FAB_CONFIG.STORAGE_KEYS.THEME,
      isDarkMode ? 'dark' : 'light'
    );

    // if switching back to light, remove inline critical-dark style so colors revert
    if (!isDarkMode) {
      const existing = document.getElementById('theme-critical');
      if (existing && existing.parentElement) {
        existing.parentElement.removeChild(existing);
      }
      document.documentElement.style.colorScheme = 'light';
    }

    // Announce to screen readers
    const themeLabel = isDarkMode ? 'Dark mode' : 'Light mode';
    announceToScreenReader(`${themeLabel} enabled`);
  }

  /**
   * Restore saved theme from localStorage
   */
  function restoreTheme() {
    const savedTheme = localStorage.getItem(FAB_CONFIG.STORAGE_KEYS.THEME);
    
    if (savedTheme === 'dark') {
      document.body.classList.add(FAB_CONFIG.CLASS_NAMES.DARK_MODE);
    } else if (savedTheme === 'light') {
      document.body.classList.remove(FAB_CONFIG.CLASS_NAMES.DARK_MODE);
    } else {
      // Check system preference if no saved theme
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.body.classList.add(FAB_CONFIG.CLASS_NAMES.DARK_MODE);
      }
    }
  }

  /**
   * Announce message to screen readers using live region
   * @param {string} message - Message to announce
   */
  function announceToScreenReader(message) {
    // Create or get the live region
    let liveRegion = document.getElementById('fab-sr-announce');
    
    if (!liveRegion) {
      liveRegion = document.createElement('div');
      liveRegion.id = 'fab-sr-announce';
      liveRegion.setAttribute('aria-live', 'polite');
      liveRegion.setAttribute('aria-atomic', 'true');
      liveRegion.style.position = 'absolute';
      liveRegion.style.left = '-10000px';
      liveRegion.style.width = '1px';
      liveRegion.style.height = '1px';
      liveRegion.style.overflow = 'hidden';
      document.body.appendChild(liveRegion);
    }

    // Update the message
    liveRegion.textContent = message;
  }

  /**
   * Initialize FAB when DOM is ready
   */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFAB);
  } else {
    initFAB();
  }
})();
