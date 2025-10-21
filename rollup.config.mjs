import path from 'node:path';
import { fileURLToPath } from 'node:url';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import replace from '@rollup/plugin-replace';
import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import { terser } from '@rollup/plugin-terser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const buildTarget = process.env.BUILD ?? 'all';
const isProduction = process.env.NODE_ENV === 'production';

const tsconfig = path.resolve(__dirname, 'tsconfig.json');

const basePlugins = ({ browser }) => [
  replace({
    preventAssignment: true,
    values: {
      __BUILD_TARGET__: JSON.stringify(browser ? 'browser' : 'node'),
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'development')
    }
  }),
  nodeResolve({
    browser,
    preferBuiltins: !browser
  }),
  commonjs(),
  json(),
  typescript({
    tsconfig,
    sourceMap: true,
    inlineSources: true
  }),
  ...(isProduction
    ? [
        terser({
          format: {
            comments: false
          },
          compress: {
            passes: 2,
            drop_console: false
          }
        })
      ]
    : [])
];

const browserConfig = {
  input: 'src/index.ts',
  treeshake: {
    moduleSideEffects: false
  },
  output: [
    {
      file: 'browser/dist/index.js',
      format: 'es',
      sourcemap: true
    },
    {
      file: 'browser/dist/index.cjs',
      format: 'cjs',
      sourcemap: true,
      exports: 'named'
    }
  ],
  plugins: basePlugins({ browser: true })
};

const nodeConfig = {
  input: 'src/index.ts',
  treeshake: {
    moduleSideEffects: false
  },
  output: [
    {
      file: 'node/dist/index.js',
      format: 'es',
      sourcemap: true
    },
    {
      file: 'node/dist/index.cjs',
      format: 'cjs',
      sourcemap: true,
      exports: 'named'
    }
  ],
  external: [
    'fs',
    'path',
    'node:fs',
    'node:path',
    'crypto',
    'node:crypto',
    'stream',
    'node:stream',
    'http',
    'https',
    'node:http',
    'node:https',
    'url',
    'node:url'
  ],
  plugins: basePlugins({ browser: false })
};

const configs = [];
if (buildTarget === 'all' || buildTarget === 'browser') {
  configs.push(browserConfig);
}
if (buildTarget === 'all' || buildTarget === 'node') {
  configs.push(nodeConfig);
}

export default configs;
