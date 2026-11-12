// The app's colours, light and dark with the system (until the everyday screens bring
// the design tokens).
import { useColorScheme } from 'react-native'

const palette = {
  light: { bg: '#ffffff', text: '#1c1c1e', muted: '#6e6e73', field: '#f2f2f7', separator: '#c6c6c8', accent: '#0a66d8', error: '#c4281c' },
  dark: { bg: '#000000', text: '#f5f5f7', muted: '#98989d', field: '#1c1c1e', separator: '#38383a', accent: '#4c9bff', error: '#ff6b5e' },
}

export type Colors = (typeof palette)['light']

export function useColors(): Colors {
  return palette[useColorScheme() === 'dark' ? 'dark' : 'light']
}
