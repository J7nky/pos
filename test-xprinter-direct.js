const { exec } = require('child_process');
const fs = require('fs');

// Create a simple test file
const testContent = `
================================
    RECEIPT PRINTER TEST
================================

Date: ${new Date().toLocaleString()}
Printer: Xprinter XP-80
Status: Testing direct printing

This is a test receipt to verify
that the Xprinter XP-80 is working
correctly.

================================
        END OF TEST
================================
`;

// Write test file
fs.writeFileSync('test-receipt.txt', testContent);

console.log('🧪 Testing Xprinter XP-80 with direct Windows command...');

// Try direct Windows print command
exec('notepad /p test-receipt.txt', (error, stdout, stderr) => {
  if (error) {
    console.error('❌ Notepad print failed:', error.message);
    
    // Try alternative method
    console.log('🔄 Trying alternative print method...');
    exec('type test-receipt.txt | more', (error2, stdout2, stderr2) => {
      if (error2) {
        console.error('❌ Alternative method failed:', error2.message);
      } else {
        console.log('✅ Alternative method output:', stdout2);
      }
    });
  } else {
    console.log('✅ Notepad print command executed');
  }
});

// Clean up after 5 seconds
setTimeout(() => {
  try {
    fs.unlinkSync('test-receipt.txt');
    console.log('🧹 Cleaned up test file');
  } catch (e) {
    console.log('⚠️ Could not clean up test file');
  }
}, 5000);
