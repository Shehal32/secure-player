const { spawn } = require('child_process');
const path = require('path');

const domain = 'unlikeable-unhectically-jasiah.ngrok-free.dev';
const ngrokExe = path.resolve(__dirname, 'ngrok.exe');

console.log('======================================================');
console.log('🚀 Launching official ngrok tunnel...');
console.log(`🔗 Public Domain: https://${domain}`);
console.log('💻 Forwarding: http://localhost:3000');
console.log('======================================================\n');

const child = spawn(
  ngrokExe,
  ['http', '3000', `--domain=${domain}`],
  {
    stdio: 'inherit',
    windowsHide: false,
  }
);

child.on('error', (err) => {
  console.error('Failed to run ngrok.exe:', err.message);
});

child.on('exit', (code) => {
  console.log(`ngrok exited with code ${code}`);
});
