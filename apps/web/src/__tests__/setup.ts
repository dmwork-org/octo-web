import '@testing-library/jest-dom'

// ResizeObserver polyfill for jsdom (Semi UI components trigger this)
if (typeof ResizeObserver === 'undefined') {
    global.ResizeObserver = class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    }
}
