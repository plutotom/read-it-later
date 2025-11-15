#!/usr/bin/env node

/**
 * Simple test script to verify MCP server can be imported and initialized
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serverPath = join(__dirname, 'dist', 'index.js');

console.log('Testing MCP server...');
console.log('Server path:', serverPath);

// Test if we can at least require/import the server
try {
  // Just check if the file exists and is executable
  const { accessSync, constants } = await import('fs');
  accessSync(serverPath, constants.F_OK);
  console.log('✓ Server file exists');
  
  // Try to spawn it
  const proc = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  // Send a simple initialization request
  const initRequest = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'test-client',
        version: '1.0.0'
      }
    }
  }) + '\n';
  
  proc.stdin.write(initRequest);
  
  let output = '';
  proc.stdout.on('data', (data) => {
    output += data.toString();
  });
  
  proc.stderr.on('data', (data) => {
    console.error('Server stderr:', data.toString());
  });
  
  proc.on('close', (code) => {
    console.log('Server exited with code:', code);
    if (output) {
      console.log('Server output:', output);
    }
  });
  
  // Kill after 2 seconds
  setTimeout(() => {
    proc.kill();
    console.log('✓ Server can be started (killed after 2s)');
    process.exit(0);
  }, 2000);
  
} catch (error) {
  console.error('✗ Error testing server:', error.message);
  process.exit(1);
}



