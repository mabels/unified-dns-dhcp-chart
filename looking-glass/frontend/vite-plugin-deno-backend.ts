// Vite plugin to start Node.js backend during development
import { Plugin } from 'vite';
import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export default function nodeBackendPlugin(): Plugin {
  let backendProcess: ChildProcess | null = null;

  return {
    name: 'vite-plugin-node-backend',

    configureServer() {
      // Start Node.js backend when Vite dev server starts
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const backendPath = path.resolve(__dirname, '../backend');

      console.log('\n🟢 Starting Node.js backend...\n');

      backendProcess = spawn('npm', ['run', 'dev'], {
        cwd: backendPath,
        stdio: 'inherit', // Show backend output in the terminal
        shell: true,
      });

      backendProcess.on('error', (error) => {
        console.error('Failed to start Node.js backend:', error);
      });

      // Wait a moment for backend to start
      return new Promise((resolve) => {
        setTimeout(() => {
          console.log('✅ Node.js backend started on http://localhost:3000\n');
          resolve();
        }, 2000); // Increased timeout for npm
      });
    },

    buildStart() {
      console.log('Vite dev server starting with Node.js backend...');
    },

    closeBundle() {
      // Kill backend process when Vite closes
      if (backendProcess) {
        console.log('\n🛑 Stopping Node.js backend...');
        backendProcess.kill();
        backendProcess = null;
      }
    },
  };
}
