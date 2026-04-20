import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { downloadFile } from '../../../../packages/dmworkbase/src/Utils/download'

// Track anchors created by download functions
let clickedAnchors: HTMLAnchorElement[] = []
let originalCreateElement: typeof document.createElement

beforeEach(() => {
    clickedAnchors = []
    originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string, options?: any) => {
        const el = originalCreateElement(tag, options)
        if (tag === 'a') {
            vi.spyOn(el as HTMLAnchorElement, 'click').mockImplementation(() => {})
            clickedAnchors.push(el as HTMLAnchorElement)
        }
        return el
    })
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('downloadFile', () => {
    describe('same-origin anchor download', () => {
        it('should create anchor with download attribute for same-origin URLs', async () => {
            await downloadFile(`${window.location.origin}/files/doc.pdf`, 'doc.pdf')

            expect(clickedAnchors).toHaveLength(1)
            expect(clickedAnchors[0].href).toBe(`${window.location.origin}/files/doc.pdf`)
            expect(clickedAnchors[0].download).toBe('doc.pdf')
            expect(clickedAnchors[0].target).toBe('')
            expect(clickedAnchors[0].rel).toBe('')
        })

        it('should not set target="_blank" for same-origin URLs', async () => {
            await downloadFile(`${window.location.origin}/file.txt`, 'file.txt')

            expect(clickedAnchors).toHaveLength(1)
            expect(clickedAnchors[0].target).toBe('')
        })

        it('should not fetch for same-origin URLs', async () => {
            const fetchSpy = vi.spyOn(globalThis, 'fetch')

            await downloadFile(`${window.location.origin}/files/doc.pdf`, 'doc.pdf')

            expect(fetchSpy).not.toHaveBeenCalled()
        })
    })

    describe('cross-origin anchor download', () => {
        it('should set target="_blank" and rel="noopener" for cross-origin URLs', async () => {
            await downloadFile('https://cdn.example.com/abc123_file.pdf', 'file.pdf')

            expect(clickedAnchors).toHaveLength(1)
            expect(clickedAnchors[0].href).toBe('https://cdn.example.com/abc123_file.pdf')
            expect(clickedAnchors[0].download).toBe('file.pdf')
            expect(clickedAnchors[0].target).toBe('_blank')
            expect(clickedAnchors[0].rel).toBe('noopener')
        })

        it('should not fetch for cross-origin URLs', async () => {
            const fetchSpy = vi.spyOn(globalThis, 'fetch')

            await downloadFile('https://cdn.example.com/file.txt', 'file.txt')

            expect(fetchSpy).not.toHaveBeenCalled()
        })
    })

    describe('URL resolution', () => {
        it('should resolve /path relative URLs as same-origin', async () => {
            await downloadFile('/api/file/123', 'doc.pdf')

            expect(clickedAnchors).toHaveLength(1)
            expect(clickedAnchors[0].href).toBe(`${window.location.origin}/api/file/123`)
            expect(clickedAnchors[0].download).toBe('doc.pdf')
            expect(clickedAnchors[0].target).toBe('')
        })

        it('should resolve ./path relative URLs as same-origin', async () => {
            await downloadFile('./files/doc.pdf', 'doc.pdf')

            expect(clickedAnchors).toHaveLength(1)
            expect(clickedAnchors[0].download).toBe('doc.pdf')
            expect(clickedAnchors[0].target).toBe('')
        })

        it('should resolve ../path relative URLs as same-origin', async () => {
            await downloadFile('../files/doc.pdf', 'doc.pdf')

            expect(clickedAnchors).toHaveLength(1)
            expect(clickedAnchors[0].download).toBe('doc.pdf')
            expect(clickedAnchors[0].target).toBe('')
        })

        it('should resolve bare path relative URLs as same-origin', async () => {
            await downloadFile('api/file/123', 'doc.pdf')

            expect(clickedAnchors).toHaveLength(1)
            expect(clickedAnchors[0].download).toBe('doc.pdf')
            expect(clickedAnchors[0].target).toBe('')
        })
    })

    describe('isSafeUrl check', () => {
        it('should not create anchor for javascript: URLs', async () => {
            await downloadFile('javascript:alert(1)', 'evil.txt')

            expect(clickedAnchors).toHaveLength(0)
        })

        it('should not act on empty URL', async () => {
            await downloadFile('', 'file.txt')

            expect(clickedAnchors).toHaveLength(0)
        })

        it('should not act on invalid URL', async () => {
            // URL constructor with a bad scheme + no base should throw
            await downloadFile('not://[invalid', 'file.txt')

            expect(clickedAnchors).toHaveLength(0)
        })
    })
})
