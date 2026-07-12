import {
  createTheme,
  MantineColorsTuple,
  MantineTheme,
  MantineThemeComponent,
} from "@mantine/core";

// Define color tuples using CSS variables
const primary: MantineColorsTuple = [
  "var(--color-primary-50)",
  "var(--color-primary-100)",
  "var(--color-primary-200)",
  "var(--color-primary-300)",
  "var(--color-primary-400)",
  "var(--color-primary-500)",
  "var(--color-primary-600)",
  "var(--color-primary-700)",
  "var(--color-primary-800)",
  "var(--color-primary-900)",
];

const green: MantineColorsTuple = [
  "var(--color-green-50)",
  "var(--color-green-100)",
  "var(--color-green-200)",
  "var(--color-green-300)",
  "var(--color-green-400)",
  "var(--color-green-500)",
  "var(--color-green-600)",
  "var(--color-green-700)",
  "var(--color-green-800)",
  "var(--color-green-900)",
];

const yellow: MantineColorsTuple = [
  "var(--color-yellow-50)",
  "var(--color-yellow-100)",
  "var(--color-yellow-200)",
  "var(--color-yellow-300)",
  "var(--color-yellow-400)",
  "var(--color-yellow-500)",
  "var(--color-yellow-600)",
  "var(--color-yellow-700)",
  "var(--color-yellow-800)",
  "var(--color-yellow-900)",
];

const gray: MantineColorsTuple = [
  "var(--color-gray-50)",
  "var(--color-gray-100)",
  "var(--color-gray-200)",
  "var(--color-gray-300)",
  "var(--color-gray-400)",
  "var(--color-gray-500)",
  "var(--color-gray-600)",
  "var(--color-gray-700)",
  "var(--color-gray-800)",
  "var(--color-gray-900)",
];

// Neutral dark scale (zinc, mirroring --p-zinc-*) replacing Mantine's default gray ramp; colors.css re-points dark-4..7 at the --c-* surfaces. 0..3 text, 4..7 surfaces, 8..9 deepest.
const dark: MantineColorsTuple = [
  "#f4f4f5", // dark-0  — primary text on dark bg (zinc-100)
  "#a1a1aa", // dark-1  — secondary text (zinc-200)
  "#71717a", // dark-2  — muted text / icons (zinc-300)
  "#52525b", // dark-3  — subtle text / dividers (zinc-400)
  "#2a2a2e", // dark-4  — elevated surface / selected bg (zinc-650)
  "#202023", // dark-5  — card / panel surface (zinc-775)
  "#18181b", // dark-6  — toolbar / sidebar bg (zinc-800)
  "#0a0a0b", // dark-7  — page background (zinc-950)
  "#070708", // dark-8  — deeper than the reachable surfaces
  "#050506", // dark-9  — deepest
];

export const mantineTheme = createTheme({
  // Primary color
  primaryColor: "primary",

  // Color palette
  colors: {
    primary,
    green,
    yellow,
    gray,
    dark,
  },

  // Spacing system - uses CSS variables
  spacing: {
    xs: "var(--space-xs)",
    sm: "var(--space-sm)",
    md: "var(--space-md)",
    lg: "var(--space-lg)",
    xl: "var(--space-xl)",
  },

  // Border radius system
  radius: {
    xs: "var(--radius-xs)",
    sm: "var(--radius-sm)",
    md: "var(--radius-md)",
    lg: "var(--radius-lg)",
    xl: "var(--radius-xl)",
  },

  // Shadow system
  shadows: {
    xs: "var(--shadow-xs)",
    sm: "var(--shadow-sm)",
    md: "var(--shadow-md)",
    lg: "var(--shadow-lg)",
    xl: "var(--shadow-xl)",
  },

  // Custom variables for specific components
  other: {
    crop: {
      overlayBorder: "var(--color-primary-500)",
      overlayBackground: "rgba(59, 130, 246, 0.1)", // Blue with 10% opacity
      handleColor: "var(--color-primary-500)",
      handleBorder: "var(--bg-surface)",
    },
  },

  // Component customizations
  components: {
    Button: {
      styles: {
        root: {
          fontWeight: "var(--font-weight-medium)",
          transition: "all 0.2s ease",
        },
      },
      variants: {
        // Custom button variant for PDF tools
        pdfTool: (_theme: MantineTheme) => ({
          root: {
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            color: "var(--text-primary)",
            "&:hover": {
              backgroundColor: "var(--hover-bg)",
              borderColor: "var(--color-primary-500)",
            },
          },
        }),
      },
    } as MantineThemeComponent,

    Paper: {
      styles: {
        root: {
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
        },
      },
    },

    Card: {
      styles: {
        root: {
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "var(--shadow-sm)",
        },
      },
    },

    Code: {
      styles: {
        root: {
          backgroundColor: "var(--color-gray-100)",
          color: "var(--text-primary)",
        },
      },
    },

    Textarea: {
      styles: (_theme: MantineTheme) => ({
        input: {
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-default)",
          color: "var(--text-primary)",
          "&:focus": {
            borderColor: "var(--color-primary-500)",
            boxShadow: "0 0 0 1px var(--color-primary-500)",
          },
        },
        label: {
          color: "var(--text-secondary)",
          fontWeight: "var(--font-weight-medium)",
        },
      }),
    },

    TextInput: {
      styles: (_theme: MantineTheme) => ({
        input: {
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-default)",
          color: "var(--text-primary)",
          "&:focus": {
            borderColor: "var(--color-primary-500)",
            boxShadow: "0 0 0 1px var(--color-primary-500)",
          },
        },
        label: {
          color: "var(--text-secondary)",
          fontWeight: "var(--font-weight-medium)",
        },
      }),
    },

    PasswordInput: {
      styles: (_theme: MantineTheme) => ({
        input: {
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-default)",
          color: "var(--text-primary)",
          "&:focus": {
            borderColor: "var(--color-primary-500)",
            boxShadow: "0 0 0 1px var(--color-primary-500)",
          },
        },
        label: {
          color: "var(--text-secondary)",
          fontWeight: "var(--font-weight-medium)",
        },
      }),
    },

    Select: {
      styles: {
        input: {
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-default)",
          color: "var(--text-primary)",
          "&:focus": {
            borderColor: "var(--color-primary-500)",
            boxShadow: "0 0 0 1px var(--color-primary-500)",
          },
        },
        label: {
          color: "var(--text-secondary)",
          fontWeight: "var(--font-weight-medium)",
        },
        dropdown: {
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-subtle)",
          boxShadow: "var(--shadow-lg)",
        },
        option: {
          color: "var(--text-primary)",
          "--combobox-option-hover": "var(--hover-bg)",
          "--combobox-option-selected": "var(--color-primary-100)",
        },
      },
    },

    MultiSelect: {
      styles: {
        input: {
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-default)",
          color: "var(--text-primary)",
          "&:focus": {
            borderColor: "var(--color-primary-500)",
            boxShadow: "0 0 0 1px var(--color-primary-500)",
          },
        },
        label: {
          color: "var(--text-secondary)",
          fontWeight: "var(--font-weight-medium)",
        },
        dropdown: {
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-subtle)",
          boxShadow: "var(--shadow-lg)",
        },
        option: {
          color: "var(--text-primary)",
          "--combobox-option-hover": "var(--hover-bg)",
          "--combobox-option-selected": "var(--color-primary-100)",
        },
      },
    },
    Tooltip: {
      styles: {
        tooltip: {
          backgroundColor: "var( --tooltip-title-bg)",
          color: "var( --tooltip-title-color)",
          border: "1px solid var(--tooltip-borderp)",
          fontSize: "0.75rem",
          fontWeight: "500",
          boxShadow: "var(--shadow-md)",
          borderRadius: "var(--radius-sm)",
        },
      },
    },

    Checkbox: {
      styles: {
        input: {
          borderColor: "var(--border-default)",
          "&:checked": {
            backgroundColor: "var(--color-primary-500)",
            borderColor: "var(--color-primary-500)",
          },
        },
        label: {
          color: "var(--text-primary)",
        },
      },
    },

    Slider: {
      styles: {
        track: {
          backgroundColor: "var(--bg-muted)",
        },
        bar: {
          backgroundColor: "var(--color-primary-500)",
        },
        thumb: {
          backgroundColor: "var(--color-primary-500)",
          borderColor: "var(--color-primary-500)",
        },
        mark: {
          borderColor: "var(--border-default)",
        },
        markLabel: {
          color: "var(--text-muted)",
        },
      },
    },

    Modal: {
      styles: {
        content: {
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "var(--shadow-xl)",
        },
        header: {
          backgroundColor: "var(--bg-surface)",
          borderBottom: "1px solid var(--border-subtle)",
        },
        title: {
          color: "var(--text-primary)",
          fontWeight: "var(--font-weight-semibold)",
        },
      },
    },

    Notification: {
      styles: {
        root: {
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "var(--shadow-lg)",
        },
        title: {
          color: "var(--text-primary)",
        },
        description: {
          color: "var(--text-secondary)",
        },
      },
    },
  },
});
