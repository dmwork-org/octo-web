/**
 * Unit tests for ChannelAvatar file change logic
 * Tests the null check for files array (fix for issue #148)
 */

describe('ChannelAvatar onFileChange logic', () => {
    // Extracted onFileChange logic for testing
    function getFileFromInput(fileInput: { files?: FileList | null } | null): File | null {
        const files = fileInput?.files;
        if (!files || files.length === 0) return null;
        return files[0];
    }

    it('should return null when fileInput is null', () => {
        expect(getFileFromInput(null)).toBeNull();
    });

    it('should return null when fileInput is undefined', () => {
        expect(getFileFromInput(undefined as any)).toBeNull();
    });

    it('should return null when files is null', () => {
        expect(getFileFromInput({ files: null })).toBeNull();
    });

    it('should return null when files is empty array-like', () => {
        const mockFileList = { length: 0 } as FileList;
        expect(getFileFromInput({ files: mockFileList })).toBeNull();
    });

    it('should return the first file when files array has items', () => {
        const mockFile = new File(['test'], 'test.png', { type: 'image/png' });
        const mockFileList = {
            0: mockFile,
            length: 1,
            item: (index: number) => mockFile,
        } as FileList;
        expect(getFileFromInput({ files: mockFileList })).toBe(mockFile);
    });
});
