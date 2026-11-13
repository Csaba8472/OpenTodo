// Icons (design D6): SF Symbols on iOS, Material Symbols on Android, through
// expo-symbols. One name per meaning, so a screen never names a platform's symbol.
import { SymbolView } from 'expo-symbols'
import type { ComponentProps } from 'react'
import { Platform, useWindowDimensions } from 'react-native'

type Pair = NonNullable<Exclude<ComponentProps<typeof SymbolView>['name'], string>>

const ICONS = {
  today: { ios: 'star', android: 'today' },
  inbox: { ios: 'tray', android: 'inbox' },
  upcoming: { ios: 'calendar', android: 'calendar_month' },
  browse: { ios: 'square.grid.2x2', android: 'grid_view' },
  search: { ios: 'magnifyingglass', android: 'search' },
  add: { ios: 'plus', android: 'add' },
  check: { ios: 'checkmark', android: 'check' },
  schedule: { ios: 'calendar', android: 'event' },
  move: { ios: 'folder', android: 'drive_file_move' },
  delete: { ios: 'trash', android: 'delete' },
  priority: { ios: 'flag', android: 'flag' },
  label: { ios: 'tag', android: 'sell' },
  duplicate: { ios: 'plus.square.on.square', android: 'content_copy' },
  link: { ios: 'link', android: 'link' },
  repeat: { ios: 'repeat', android: 'repeat' },
  notes: { ios: 'text.alignleft', android: 'notes' },
  subtasks: { ios: 'checklist', android: 'checklist' },
  reminder: { ios: 'bell', android: 'alarm' },
  deadline: { ios: 'flag.checkered', android: 'flag_circle' },
  project: { ios: 'number', android: 'folder' },
  view: { ios: 'line.3.horizontal.decrease', android: 'filter_list' },
  note: { ios: 'doc.text', android: 'description' },
  logbook: { ios: 'clock.arrow.circlepath', android: 'history' },
  settings: { ios: 'gearshape', android: 'settings' },
  chevron: { ios: 'chevron.right', android: 'chevron_right' },
  close: { ios: 'xmark', android: 'close' },
  offline: { ios: 'icloud.slash', android: 'cloud_off' },
  lock: { ios: 'lock', android: 'lock' },
  web: { ios: 'safari', android: 'open_in_new' },
  attachment: { ios: 'paperclip', android: 'attach_file' },
  comment: { ios: 'bubble.left', android: 'chat_bubble' },
  more: { ios: 'ellipsis.circle', android: 'more_vert' },
  select: { ios: 'checkmark.circle', android: 'checklist_rtl' },
  time: { ios: 'clock', android: 'schedule' },
  drag: { ios: 'line.3.horizontal', android: 'drag_handle' },
} satisfies Record<string, Pair>

export type IconName = keyof typeof ICONS

export function iconPair(name: IconName): Pair {
  return ICONS[name] as Pair
}

export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color: string }) {
  // On Android a symbol is a font glyph, which the text size scales inside its fixed box:
  // the glyph is drawn at the box's size, as Material's icons keep theirs.
  const { fontScale } = useWindowDimensions()
  const glyph = Platform.OS === 'android' ? size / fontScale : size
  return <SymbolView accessible={false} name={ICONS[name] as Pair} size={glyph} style={{ width: size, height: size }} tintColor={color} />
}
