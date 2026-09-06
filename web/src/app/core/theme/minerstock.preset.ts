import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

/**
 * Preset de PrimeNG alineado al sistema de diseño MinerStock:
 * primario ámbar (#F59E0B) con texto oscuro, radios de 8px, foco ámbar.
 */
export const MinerStockPreset = definePreset(Aura, {
  primitive: {
    borderRadius: {
      none: '0',
      xs: '4px',
      sm: '6px',
      md: '8px',
      lg: '8px',
      xl: '12px',
    },
    amber: {
      50: '#fffbeb',
      100: '#fef3c7',
      200: '#fde68a',
      300: '#fcd34d',
      400: '#fbbf24',
      500: '#f59e0b',
      600: '#d97706',
      700: '#b45309',
      800: '#92400e',
      900: '#78350f',
      950: '#451a03',
    },
  },
  semantic: {
    primary: {
      50: '{amber.50}',
      100: '{amber.100}',
      200: '{amber.200}',
      300: '{amber.300}',
      400: '{amber.400}',
      500: '{amber.500}',
      600: '{amber.600}',
      700: '{amber.700}',
      800: '{amber.800}',
      900: '{amber.900}',
      950: '{amber.950}',
    },
    focusRing: {
      width: '2px',
      style: 'solid',
      color: 'rgba(245, 158, 11, 0.45)',
      offset: '1px',
    },
    formField: {
      paddingX: '0.75rem',
      paddingY: '0.55rem',
      borderRadius: '8px',
      focusRing: {
        width: '2px',
        style: 'solid',
        color: 'rgba(245, 158, 11, 0.25)',
        offset: '0',
      },
    },
    colorScheme: {
      light: {
        primary: {
          color: '#f59e0b',
          contrastColor: '#1f2937',
          hoverColor: '#d97706',
          activeColor: '#b45309',
        },
        highlight: {
          background: '#fef3c7',
          focusBackground: '#fde68a',
          color: '#78350f',
          focusColor: '#451a03',
        },
        formField: {
          background: '#ffffff',
          borderColor: '#d1d5db',
          hoverBorderColor: '#9ca3af',
          focusBorderColor: '#f59e0b',
          invalidBorderColor: '#ef4444',
          color: '#1f2937',
          placeholderColor: '#9ca3af',
        },
        surface: {
          0: '#ffffff',
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e5e7eb',
          300: '#d1d5db',
          400: '#9ca3af',
          500: '#6b7280',
          600: '#4b5563',
          700: '#374151',
          800: '#1f2937',
          900: '#111827',
          950: '#0f172a',
        },
      },
    },
  },
});
