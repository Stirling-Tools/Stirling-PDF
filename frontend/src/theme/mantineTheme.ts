import { createTheme, MantineColorsTuple } from '@mantine/core';

// Define color tuples using CSS variables
const primary: MantineColorsTuple = [
  'var(--color-primary-50)',
  'var(--color-primary-100)',
  'var(--color-primary-200)',
  'var(--color-primary-300)',
  'var(--color-primary-400)',
  'var(--color-primary-500)',
  'var(--color-primary-600)',
  'var(--color-primary-700)',
  'var(--color-primary-800)',
  'var(--color-primary-900)',
];

const gray: MantineColorsTuple = [
  'var(--color-gray-50)',
  'var(--color-gray-100)',
  'var(--color-gray-200)',
  'var(--color-gray-300)',
  'var(--color-gray-400)',
  'var(--color-gray-500)',
  'var(--color-gray-600)',
  'var(--color-gray-700)',
  'var(--color-gray-800)',
  'var(--color-gray-900)',
];

export const mantineTheme = createTheme({
  // Primary color
  primaryColor: 'primary',

  // Color palette
  colors: {
    primary,
    gray,
  },

  // Spacing system - uses CSS variables
  spacing: {
    xs: 'var(--space-xs)',
    sm: 'var(--space-sm)',
    md: 'var(--space-md)',
    lg: 'var(--space-lg)',
    xl: 'var(--space-xl)',
  },

  // Border radius system
  radius: {
    xs: 'var(--radius-xs)',
    sm: 'var(--radius-sm)',
    md: 'var(--radius-md)',
    lg: 'var(--radius-lg)',
    xl: 'var(--radius-xl)',
  },

  // Shadow system
  shadows: {
    xs: 'var(--shadow-xs)',
    sm: 'var(--shadow-sm)',
    md: 'var(--shadow-md)',
    lg: 'var(--shadow-lg)',
    xl: 'var(--shadow-xl)',
  },

  // Component customizations
  components: {
    Button: {
      styles: {
        root: {
          fontWeight: 'var(--font-weight-medium)',
          transition: 'all 0.2s ease',
        },
      },
      variants: {
        // Custom button variant for PDF tools
        pdfTool: (theme: any) => ({
          root: {
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            color: 'var(--text-primary)',
            '&:hover': {
              backgroundColor: 'var(--hover-bg)',
              borderColor: 'var(--color-primary-500)',
            },
          },
        }),
      },
    } as any,

    Paper: {
      styles: {
        root: {
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
        },
      },
    },

    Card: {
      styles: {
        root: {
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-sm)',
        },
      },
    },

    TextInput: {
      styles: {
        input: {
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-default)',
          color: 'var(--text-primary)',
          '&:focus': {
            borderColor: 'var(--color-primary-500)',
            boxShadow: '0 0 0 1px var(--color-primary-500)',
          },
        },
        label: {
          color: 'var(--text-secondary)',
          fontWeight: 'var(--font-weight-medium)',
        },
      },
    },

    Select: {
      styles: {
        input: {
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-default)',
          color: 'var(--text-primary)',
          '&:focus': {
            borderColor: 'var(--color-primary-500)',
            boxShadow: '0 0 0 1px var(--color-primary-500)',
          },
        },
        label: {
          color: 'var(--text-secondary)',
          fontWeight: 'var(--font-weight-medium)',
        },
        dropdown: {
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
          boxShadow: 'var(--shadow-lg)',
        },
        option: {
          color: 'var(--text-primary)',
          '&[data-hovered]': {
            backgroundColor: 'var(--hover-bg)',
          },
          '&[data-selected]': {
            backgroundColor: 'var(--color-primary-100)',
            color: 'var(--color-primary-900)',
          },
        },
      },
    },

    MultiSelect: {
      styles: {
        input: {
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-default)',
          color: 'var(--text-primary)',
          '&:focus': {
            borderColor: 'var(--color-primary-500)',
            boxShadow: '0 0 0 1px var(--color-primary-500)',
          },
        },
        label: {
          color: 'var(--text-secondary)',
          fontWeight: 'var(--font-weight-medium)',
        },
        dropdown: {
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
          boxShadow: 'var(--shadow-lg)',
        },
        option: {
          color: 'var(--text-primary)',
          '&[data-hovered]': {
            backgroundColor: 'var(--hover-bg)',
          },
          '&[data-selected]': {
            backgroundColor: 'var(--color-primary-100)',
            color: 'var(--color-primary-900)',
          },
        },
      },
    },
    Tooltip: {
      styles: {
        tooltip: {
          backgroundColor: 'var( --tooltip-title-bg)',
          color: 'var( --tooltip-title-color)',
          border: '1px solid var(--tooltip-borderp)',
          fontSize: '0.75rem',
          fontWeight: '500',
          boxShadow: 'var(--shadow-md)',
          borderRadius: 'var(--radius-sm)',
        },
      },
    },

    Checkbox: {
      styles: {
        input: {
          borderColor: 'var(--border-default)',
          '&:checked': {
            backgroundColor: 'var(--color-primary-500)',
            borderColor: 'var(--color-primary-500)',
          },
        },
        label: {
          color: 'var(--text-primary)',
        },
      },
    },

    Slider: {
      styles: {
        track: {
          backgroundColor: 'var(--bg-muted)',
        },
        bar: {
          backgroundColor: 'var(--color-primary-500)',
        },
        thumb: {
          backgroundColor: 'var(--color-primary-500)',
          borderColor: 'var(--color-primary-500)',
        },
        mark: {
          borderColor: 'var(--border-default)',
        },
        markLabel: {
          color: 'var(--text-muted)',
        },
      },
    },

    Modal: {
      styles: {
        content: {
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-xl)',
        },
        header: {
          backgroundColor: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
        },
        title: {
          color: 'var(--text-primary)',
          fontWeight: 'var(--font-weight-semibold)',
        },
      },
    },

    Notification: {
      styles: {
        root: {
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-lg)',
        },
        title: {
          color: 'var(--text-primary)',
        },
        description: {
          color: 'var(--text-secondary)',
        },
      },
    },

    SegmentedControl: {
      styles: {
        root: {
          backgroundColor: 'var(--bg-muted)',
          border: '1px solid var(--border-subtle)',
        },
        control: {
          color: 'var(--text-secondary)',
          '[dataActive]': {
            backgroundColor: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            boxShadow: 'var(--shadow-sm)',
          },
        },
      },
    },
  },
});
