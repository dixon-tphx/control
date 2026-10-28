import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({ plugins: [react(), {
  name: 'sigma-build-info',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({
      app: 'SIGMA', version, commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
      builtAt: new Date().toISOString(),
    }) });
  },
}] });
