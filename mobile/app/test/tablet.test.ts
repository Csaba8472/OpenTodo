/** @jest-environment node */
import { nextTaskId, tabletWidth } from '../src/nav/tabletState'

describe('iPad selection', () => {
  it('uses the phone layout in a compact window', () => {
    expect(tabletWidth('ios', true, 600)).toBe(false)
    expect(tabletWidth('ios', true, 1024)).toBe(true)
    expect(tabletWidth('ios', false, 1024)).toBe(false)
    expect(tabletWidth('android', true, 1024)).toBe(false)
  })
  it('moves through only the current list and clamps at either end', () => {
    const ids = ['first', 'middle', 'last']
    expect(nextTaskId(ids, null, 1)).toBe('first')
    expect(nextTaskId(ids, 'gone', -1)).toBe('last')
    expect(nextTaskId(ids, 'middle', -1)).toBe('first')
    expect(nextTaskId(ids, 'first', -1)).toBe('first')
    expect(nextTaskId(ids, 'last', 1)).toBe('last')
    expect(nextTaskId([], 'first', 1)).toBe(null)
  })
})
