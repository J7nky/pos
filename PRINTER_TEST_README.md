# Printer Test Functionality

This document explains how to use the printer test functionality that has been implemented in the POS system.

## Overview

The printer test functionality allows you to:
- Detect available printers on your system
- Test printer connectivity
- Print test documents to verify printer functionality
- Get printer status information

## Components Added

### 1. PrinterTestService (`src/services/printerTestService.ts`)
A service class that handles all printer-related operations:
- `getAvailablePrinters()` - Detects and returns available printers
- `printTestDocument(printerName?)` - Prints a test document
- `testPrinterConnectivity(printerName)` - Tests if a printer is available
- `getPrinterStatus(printerName)` - Gets printer status information

### 2. PrinterTestModal (`src/components/PrinterTestModal.tsx`)
A React modal component that provides a user interface for:
- Selecting printers from a dropdown
- Triggering print tests
- Testing printer connectivity
- Viewing test results

### 3. Electron Integration
Updated Electron main process (`electron/main.ts`) and preload script (`electron/preload.ts`) to:
- Expose printer APIs to the renderer process
- Handle printer detection and printing operations
- Manage print job submission

## How to Use

### Method 1: Through the POS Application
1. Start the application: `npm run dev`
2. Navigate to the Home page
3. Click on the "Test Printer" card in the Fast Actions section
4. Select a printer from the dropdown
5. Click "Print Test Document" or "Test Connectivity"

### Method 2: Standalone Test
1. Run the standalone test: `node test-printer-standalone.js`
2. This will open a dedicated window for printer testing
3. Click "Detect Printers" to find available printers
4. Click "Print Test Document" to test printing

## Test Document Content

The test document includes:
- Header with "PRINTER TEST DOCUMENT"
- Timestamp and unique test ID
- List of features being tested
- Confirmation message if printing is successful

## Supported Platforms

- **Windows**: Full printer detection and printing support
- **macOS**: Full printer detection and printing support  
- **Linux**: Basic printer detection and printing support
- **Browser**: Limited functionality (opens print dialog)

## Troubleshooting

### No Printers Detected
- Ensure your printer is connected and powered on
- Check that printer drivers are installed
- Try refreshing the printer list
- On Windows, check Device Manager for printer status

### Print Job Fails
- Verify the selected printer is online and ready
- Check printer paper and ink/toner levels
- Ensure the printer is not in an error state
- Try selecting a different printer

### Browser Mode Limitations
- Browser mode only opens the system print dialog
- No direct printer detection in browser mode
- Limited to default printer selection

## API Reference

### PrinterTestService Methods

```typescript
// Get available printers
const printers = await printerService.getAvailablePrinters();

// Print test document
const result = await printerService.printTestDocument('printer-name');

// Test printer connectivity
const connectivity = await printerService.testPrinterConnectivity('printer-name');

// Get printer status
const status = await printerService.getPrinterStatus('printer-name');
```

### PrinterInfo Interface

```typescript
interface PrinterInfo {
  name: string;           // System printer name
  displayName: string;    // Human-readable name
  description?: string;   // Optional description
  isDefault: boolean;     // Whether this is the default printer
}
```

### PrintTestResult Interface

```typescript
interface PrintTestResult {
  success: boolean;       // Whether the operation succeeded
  message: string;        // Result message
  printerName?: string;   // Name of printer used
  error?: string;         // Error message if failed
}
```

## Development Notes

- The printer functionality uses Electron's built-in printer APIs
- Print jobs are handled through Electron's webContents.print() method
- The system supports both silent and interactive printing modes
- Error handling includes both network and hardware-related issues

## Future Enhancements

Potential improvements for the printer test functionality:
- Print preview before printing
- Custom test document content
- Batch printer testing
- Printer performance metrics
- Print job queue monitoring
- Advanced printer settings configuration

