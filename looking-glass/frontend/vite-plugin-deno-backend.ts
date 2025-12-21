// Vite plugin to start Deno backend during development
import { Plugin } from 'vite';
import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export default function denoBackendPlugin(): Plugin {
  let denoProcess: ChildProcess | null = null;

  return {
    name: 'vite-plugin-deno-backend',

    configureServer() {
      // Start Deno backend when Vite dev server starts
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const backendPath = path.resolve(__dirname, '../backend');

      console.log('\n🦕 Starting Deno backend...\n');

      denoProcess = spawn('deno', ['task', 'dev'], {
        cwd: backendPath,
        stdio: 'inherit', // Show Deno output in the terminal
        shell: true,
      });

      denoProcess.on('error', (error) => {
        console.error('Failed to start Deno backend:', error);
      });

      // Wait a moment for backend to start
      return new Promise((resolve) => {
        setTimeout(() => {
          console.log('✅ Deno backend started on http://localhost:3000\n');
          resolve();
        }, 1000);
      });
    },

    buildStart() {
      console.log('Vite dev server starting with Deno backend...');
    },

    closeBundle() {
      // Kill Deno process when Vite closes
      if (denoProcess) {
        console.log('\n🛑 Stopping Deno backend...');
        denoProcess.kill();
        denoProcess = null;
      }
    },
  };
}
