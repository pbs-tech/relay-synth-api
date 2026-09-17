#!/usr/bin/env node
/**
 * Bundles each Lambda handler into its own directory under dist/.
 *
 * Terraform's archive_file zips these directories, so one function's bundle can
 * change without invalidating the others' deployment packages.
 */
import { build } from 'esbuild';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HANDLERS = ['tutorials', 'users', 'leaderboard'];

await rm(resolve(root, 'dist'), { recursive: true, force: true });

await Promise.all(
  HANDLERS.map(async (name) => {
    const outdir = resolve(root, 'dist', name);
    await mkdir(outdir, { recursive: true });

    await build({
      entryPoints: [resolve(root, 'src/handlers', `${name}.ts`)],
      outfile: resolve(outdir, 'index.js'),
      bundle: true,
      platform: 'node',
      target: 'node22',
      // CJS avoids ESM/CJS interop shims around the AWS SDK. The package.json
      // written below opts this directory out of the repo-level "type": "module".
      format: 'cjs',
      minify: true,
      sourcemap: true,
      // The SDK is bundled rather than taken from the runtime, so a Lambda
      // runtime upgrade can never silently change the SDK version underneath us.
      legalComments: 'none',
      logLevel: 'info',
    });

    await writeFile(
      resolve(outdir, 'package.json'),
      `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`,
    );
  }),
);

console.log(`Built ${HANDLERS.length} Lambda bundles into dist/`);
