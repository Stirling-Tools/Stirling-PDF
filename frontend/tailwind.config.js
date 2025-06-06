/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Colors using CSS variables (namespaced to avoid Mantine conflicts)
      colors: {
        // Custom palette (avoid 'primary' and 'gray' which Mantine uses)
        'app-primary': {
          50: 'var(--color-primary-50)',
          100: 'var(--color-primary-100)',
          200: 'var(--color-primary-200)',
          300: 'var(--color-primary-300)',
          400: 'var(--color-primary-400)',
          500: 'var(--color-primary-500)',
          600: 'var(--color-primary-600)',
          700: 'var(--color-primary-700)',
          800: 'var(--color-primary-800)',
          900: 'var(--color-primary-900)',
        },
        // Custom gray palette
        'app-gray': {
          50: 'var(--color-gray-50)',
          100: 'var(--color-gray-100)',
          200: 'var(--color-gray-200)',
          300: 'var(--color-gray-300)',
          400: 'var(--color-gray-400)',
          500: 'var(--color-gray-500)',
          600: 'var(--color-gray-600)',
          700: 'var(--color-gray-700)',
          800: 'var(--color-gray-800)',
          900: 'var(--color-gray-900)',
        },
        // Semantic colors
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        error: 'var(--color-error)',
        info: 'var(--color-info)',
        
        // Background colors
        'bg-app': 'var(--bg-app)',
        'bg-surface': 'var(--bg-surface)',
        'bg-raised': 'var(--bg-raised)',
        'bg-muted': 'var(--bg-muted)',
        'bg-overlay': 'var(--bg-overlay)',
        
        // Text colors
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
        'text-inverse': 'var(--text-inverse)',
        
        // Border colors
        'border-subtle': 'var(--border-subtle)',
        'border-default': 'var(--border-default)',
        'border-strong': 'var(--border-strong)',
        
        // Interactive states
        'hover-bg': 'var(--hover-bg)',
        'active-bg': 'var(--active-bg)',
        'focus-ring': 'var(--focus-ring)',
        
        // PDF-specific colors
        'pdf-viewer': 'var(--pdf-viewer-bg)',
        'pdf-toolbar': 'var(--pdf-toolbar-bg)',
        'file-drop': 'var(--file-drop-border)',
        'file-drop-hover': 'var(--file-drop-hover)',
      },
      
      // Spacing using CSS variables (namespaced to avoid Mantine conflicts)
      spacing: {
        'app-xs': 'var(--space-xs)',
        'app-sm': 'var(--space-sm)',
        'app-md': 'var(--space-md)',
        'app-lg': 'var(--space-lg)',
        'app-xl': 'var(--space-xl)',
        'app-2xl': 'var(--space-2xl)',
      },
      
      // Border radius using CSS variables (namespaced)
      borderRadius: {
        'app-xs': 'var(--radius-xs)',
        'app-sm': 'var(--radius-sm)',
        'app-md': 'var(--radius-md)',
        'app-lg': 'var(--radius-lg)',
        'app-xl': 'var(--radius-xl)',
        'app-2xl': 'var(--radius-2xl)',
        'app-full': 'var(--radius-full)',
      },
      
      // Box shadows using CSS variables (namespaced)
      boxShadow: {
        'app-xs': 'var(--shadow-xs)',
        'app-sm': 'var(--shadow-sm)',
        'app-md': 'var(--shadow-md)',
        'app-lg': 'var(--shadow-lg)',
        'app-xl': 'var(--shadow-xl)',
      },
      
      // Font weights using CSS variables
      fontWeight: {
        'normal': 'var(--font-weight-normal)',
        'medium': 'var(--font-weight-medium)',
        'semibold': 'var(--font-weight-semibold)',
        'bold': 'var(--font-weight-bold)',
      },
      
      // Z-index scale
      zIndex: {
        'dropdown': 'var(--z-dropdown)',
        'sticky': 'var(--z-sticky)',
        'fixed': 'var(--z-fixed)',
        'modal-backdrop': 'var(--z-modal-backdrop)',
        'modal': 'var(--z-modal)',
        'popover': 'var(--z-popover)',
        'tooltip': 'var(--z-tooltip)',
      },
      
      // Layout variables
      width: {
        'sidebar': 'var(--sidebar-width)',
        'sidebar-min': 'var(--sidebar-width-min)',
        'sidebar-max': 'var(--sidebar-width-max)',
      },
      
      height: {
        'header': 'var(--header-height)',
      },
      
      // Border width
      borderWidth: {
        DEFAULT: 'var(--border-width)',
      },
    },
  },
  plugins: [],
  // Prevent conflicts with Mantine classes
  corePlugins: {
    preflight: false,
  },
}
