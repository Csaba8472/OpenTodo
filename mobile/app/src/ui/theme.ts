// The app's colours (OpenSpec change native-app-everyday, design D6): the platform's own
// backgrounds and text (iOS system colours, Material 3 neutrals on Android) around the
// OpenTodo accent, the web's oklch(0.508 0.105 165.6). Light and dark follow the system,
// or the choice in Settings (Appearance.setColorScheme, src/screens/SettingsScreen.tsx).
import { Platform, useColorScheme } from 'react-native'

const ios = {
  light: { bg: '#ffffff', grouped: '#f2f2f7', card: '#ffffff', text: '#000000', muted: '#8a8a8e', field: '#f2f2f7', separator: '#c6c6c8', accent: '#0b7a5c', onAccent: '#ffffff', inverseAccent: '#7fd7b2', danger: '#d70015', warning: '#c93400', chip: '#e6f2ee' },
  dark: { bg: '#000000', grouped: '#000000', card: '#1c1c1e', text: '#ffffff', muted: '#98989f', field: '#1c1c1e', separator: '#38383a', accent: '#4cc79a', onAccent: '#00261b', inverseAccent: '#0b7a5c', danger: '#ff6961', warning: '#ff9f0a', chip: '#103a2e' },
}

const android = {
  light: { bg: '#fbfdf9', grouped: '#f1f4f0', card: '#ffffff', text: '#191c1b', muted: '#5b6460', field: '#eef1ed', separator: '#d4dbd7', accent: '#0b7a5c', onAccent: '#ffffff', inverseAccent: '#7fd7b2', danger: '#ba1a1a', warning: '#a05100', chip: '#cdeadd' },
  dark: { bg: '#111413', grouped: '#191c1b', card: '#1e2321', text: '#e1e3e0', muted: '#a3aca8', field: '#232927', separator: '#3a413e', accent: '#7fd7b2', onAccent: '#00382a', inverseAccent: '#0b7a5c', danger: '#ffb4ab', warning: '#ffb68a', chip: '#16493a' },
}

export type Colors = (typeof ios)['light']

const palette = Platform.OS === 'ios' ? ios : android

export function useColors(): Colors {
  return palette[useColorScheme() === 'dark' ? 'dark' : 'light']
}

/** Type sizes of the platform's text styles, scaled by the system text size as React Native does. */
export const type = Platform.select({
  ios: { largeTitle: 34, title: 22, headline: 17, body: 17, callout: 16, subhead: 15, footnote: 13, caption: 12 },
  default: { largeTitle: 32, title: 22, headline: 16, body: 16, callout: 16, subhead: 14, footnote: 12, caption: 12 },
})
