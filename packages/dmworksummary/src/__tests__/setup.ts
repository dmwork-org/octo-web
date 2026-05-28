import '@testing-library/jest-dom';

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  value: () => ({
    clearRect: () => {},
    drawImage: () => {},
    fillRect: () => {},
    fillStyle: '',
    getImageData: () => ({ data: [] }),
    measureText: () => ({ width: 0 }),
    putImageData: () => {},
    strokeRect: () => {},
  }),
});
