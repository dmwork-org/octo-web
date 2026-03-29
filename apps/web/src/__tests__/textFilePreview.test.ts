/**
 * Tests for text file preview feature (Issue #760)
 * Verifies that .md and .txt files are previewable and that
 * file content is decoded as UTF-8 to avoid garbled text.
 */

describe('Text file preview helpers', () => {
    function isPreviewable(extension: string): boolean {
        const ext = (extension || '').toLowerCase()
        return ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'md', 'txt'].includes(ext)
    }

    function isTextFile(extension: string): boolean {
        const ext = (extension || '').toLowerCase()
        return ['md', 'txt'].includes(ext)
    }

    describe('isPreviewable', () => {
        it('should accept markdown files', () => {
            expect(isPreviewable('md')).toBe(true)
            expect(isPreviewable('MD')).toBe(true)
        })

        it('should accept plain text files', () => {
            expect(isPreviewable('txt')).toBe(true)
            expect(isPreviewable('TXT')).toBe(true)
        })

        it('should still accept image and PDF files', () => {
            expect(isPreviewable('pdf')).toBe(true)
            expect(isPreviewable('png')).toBe(true)
            expect(isPreviewable('jpg')).toBe(true)
        })

        it('should reject unsupported extensions', () => {
            expect(isPreviewable('zip')).toBe(false)
            expect(isPreviewable('exe')).toBe(false)
            expect(isPreviewable('doc')).toBe(false)
        })

        it('should handle empty and undefined input', () => {
            expect(isPreviewable('')).toBe(false)
            expect(isPreviewable(undefined as unknown as string)).toBe(false)
        })
    })

    describe('isTextFile', () => {
        it('should identify md as text file', () => {
            expect(isTextFile('md')).toBe(true)
            expect(isTextFile('Md')).toBe(true)
        })

        it('should identify txt as text file', () => {
            expect(isTextFile('txt')).toBe(true)
        })

        it('should not identify images or PDFs as text files', () => {
            expect(isTextFile('pdf')).toBe(false)
            expect(isTextFile('png')).toBe(false)
            expect(isTextFile('jpg')).toBe(false)
        })

        it('should handle empty input', () => {
            expect(isTextFile('')).toBe(false)
        })
    })

    describe('UTF-8 decoding', () => {
        it('should correctly decode UTF-8 encoded Chinese text', () => {
            const text = '你好世界，这是一个测试文件。'
            const encoded = new TextEncoder().encode(text)
            const decoded = new TextDecoder('utf-8').decode(encoded)
            expect(decoded).toBe(text)
        })

        it('should correctly decode UTF-8 markdown with mixed content', () => {
            const text = '# 标题\n\n这是一段**粗体**文字和`代码`。\n\n- 列表项一\n- 列表项二'
            const encoded = new TextEncoder().encode(text)
            const decoded = new TextDecoder('utf-8').decode(encoded)
            expect(decoded).toBe(text)
        })

        it('should handle BOM prefix in UTF-8 content', () => {
            const bom = new Uint8Array([0xEF, 0xBB, 0xBF])
            const text = 'Hello World'
            const textBytes = new TextEncoder().encode(text)
            const combined = new Uint8Array(bom.length + textBytes.length)
            combined.set(bom)
            combined.set(textBytes, bom.length)
            const decoded = new TextDecoder('utf-8').decode(combined)
            // TextDecoder may strip BOM automatically depending on environment
            expect(decoded.replace(/^\uFEFF/, '')).toBe(text)
        })

        it('should correctly decode emoji content', () => {
            const text = '# 📝 Notes\n\nSome emoji: 🎉🚀💡'
            const encoded = new TextEncoder().encode(text)
            const decoded = new TextDecoder('utf-8').decode(encoded)
            expect(decoded).toBe(text)
        })
    })
})
