import { defineConfig } from 'tsup';
import packageJson from './package.json' with { type: 'json' };


export default defineConfig({
  entry: {
    'index': 'src/index.ts',
  },

  format: ['esm'],
  dts: true,
  clean: true,

  define: {
    __VERSION__: JSON.stringify(packageJson.version),
  },
});
