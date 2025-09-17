import '@testing-library/jest-dom';

// Mock window.dispatchEvent for cash drawer notifications
Object.defineProperty(window, 'dispatchEvent', {
  value: jest.fn(),
  writable: true
});

// Mock console methods to reduce test noise
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};





