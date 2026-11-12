// A note's Markdown, read (native-app-everyday 5.1): headings, paragraphs, lists and task
// lists, quotes, code blocks, rules, and bold, italic, code and links inside a line, in
// the platform's text. A table is not drawn here: it says so, and is edited on the web
// (the spec's "Table in a note"); editing the rest as text leaves it as it is.
import { Fragment, type ReactNode } from 'react'
import { Linking, StyleSheet, Text, View } from 'react-native'
import { t } from './i18n'
import { useColors, type, type Colors } from './theme'

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'para'; text: string }
  | { kind: 'item'; text: string; ordered: string | null; checked: boolean | null; depth: number }
  | { kind: 'quote'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'rule' }
  | { kind: 'table' }

/** The blocks of a Markdown text, line by line (enough for reading, not a CommonMark parser). */
export function blocksOf(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, '\n').split('\n')
  const out: Block[] = []
  let para: string[] = []
  const flush = () => { if (para.length) out.push({ kind: 'para', text: para.join(' ') }); para = [] }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*```/.test(line)) {
      flush()
      const code: string[] = []
      while (++i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i])
      out.push({ kind: 'code', text: code.join('\n') })
      continue
    }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
      flush()
      while (i + 1 < lines.length && /^\s*\|/.test(lines[i + 1])) i++
      out.push({ kind: 'table' })
      continue
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line)
    const item = /^(\s*)([-*+]|\d+[.)])\s+(\[( |x|X)\]\s+)?(.*)$/.exec(line)
    if (!line.trim()) flush()
    else if (h) { flush(); out.push({ kind: 'heading', level: h[1].length, text: h[2] }) }
    else if (/^\s*(?:-\s*){3,}$|^\s*(?:\*\s*){3,}$|^\s*(?:_\s*){3,}$/.test(line)) { flush(); out.push({ kind: 'rule' }) }
    else if (item) {
      flush()
      out.push({ kind: 'item', text: item[5], ordered: /\d/.test(item[2]) ? item[2] : null, checked: item[3] ? item[4] !== ' ' : null, depth: Math.floor(item[1].length / 2) })
    } else if (/^\s*>\s?/.test(line)) { flush(); out.push({ kind: 'quote', text: line.replace(/^\s*>\s?/, '') }) }
    else para.push(line.trim())
  }
  flush()
  return out
}

/** Bold, italic, code and links inside a line. */
function inline(text: string, c: Colors): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|`[^`]+`|\[[^\]]+\]\([^)]+\))/g
  let at = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(text))) {
    if (m.index > at) out.push(text.slice(at, m.index))
    const s = m[0]
    if (s.startsWith('**') || s.startsWith('__')) out.push(<Text key={k++} style={styles.bold}>{s.slice(2, -2)}</Text>)
    else if (s.startsWith('`')) out.push(<Text key={k++} style={[styles.mono, { backgroundColor: c.field }]}>{s.slice(1, -1)}</Text>)
    else if (s.startsWith('[')) {
      const link = /\[([^\]]+)\]\(([^)]+)\)/.exec(s)!
      const href = link[2]
      out.push(<Text accessibilityRole="link" key={k++} onPress={/^https?:/.test(href) ? () => { void Linking.openURL(href) } : undefined} style={{ color: c.accent }}>{link[1]}</Text>)
    } else out.push(<Text key={k++} style={styles.italic}>{s.slice(1, -1)}</Text>)
    at = m.index + s.length
  }
  if (at < text.length) out.push(text.slice(at))
  return out
}

export function Markdown({ text }: { text: string }) {
  const c = useColors()
  return (
    <View style={styles.doc}>
      {blocksOf(text).map((b, i) => {
        switch (b.kind) {
          case 'heading':
            return <Text accessibilityRole="header" key={i} style={[styles.heading, { color: c.text, fontSize: b.level === 1 ? type.title : type.headline }]}>{inline(b.text, c)}</Text>
          case 'para':
            return <Text key={i} style={[styles.body, { color: c.text }]}>{inline(b.text, c)}</Text>
          case 'item':
            return (
              <View key={i} style={[styles.item, { paddingLeft: b.depth * 18 }]}>
                <Text style={[styles.body, { color: b.checked ? c.accent : c.muted }]}>{b.checked === null ? (b.ordered ?? '•') : b.checked ? '☑' : '☐'}</Text>
                <Text style={[styles.body, styles.flex, { color: b.checked ? c.muted : c.text }]}>{inline(b.text, c)}</Text>
              </View>
            )
          case 'quote':
            return <Text key={i} style={[styles.body, styles.quote, { color: c.muted, borderLeftColor: c.separator }]}>{inline(b.text, c)}</Text>
          case 'code':
            return <Text key={i} style={[styles.mono, styles.code, { color: c.text, backgroundColor: c.field }]}>{b.text}</Text>
          case 'rule':
            return <View key={i} style={[styles.rule, { backgroundColor: c.separator }]} />
          case 'table':
            return <Text key={i} style={[styles.body, { color: c.muted }]}>{t('A table: edit it on the web.')}</Text>
          default:
            return <Fragment key={i} />
        }
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  doc: { gap: 10 },
  heading: { fontWeight: '700', marginTop: 6 },
  body: { fontSize: type.body, lineHeight: type.body * 1.4 },
  flex: { flex: 1 },
  item: { flexDirection: 'row', gap: 8 },
  quote: { borderLeftWidth: 3, paddingLeft: 10 },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  mono: { fontFamily: 'monospace', fontSize: type.subhead },
  code: { borderRadius: 8, padding: 10 },
  rule: { height: StyleSheet.hairlineWidth, marginVertical: 6 },
})
