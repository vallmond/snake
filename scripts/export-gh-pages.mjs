#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const projectRoot = resolve(new URL('.', import.meta.url).pathname, '..');

const runBuild = () => {
  const result = spawnSync('npm', ['run', 'build'], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    console.error('\n⚠️  Build failed, aborting export.');
    process.exit(result.status ?? 1);
  }
};

const copyRecursive = (from, to) => {
  const entries = readdirSync(from, { withFileTypes: true });
  entries.forEach((entry) => {
    const sourcePath = join(from, entry.name);
    const targetPath = join(to, entry.name);
    if (entry.isDirectory()) {
      mkdirSync(targetPath, { recursive: true });
      copyRecursive(sourcePath, targetPath);
    } else if (entry.isSymbolicLink()) {
      const linkTarget = statSync(sourcePath);
      if (linkTarget.isDirectory()) {
        mkdirSync(targetPath, { recursive: true });
        copyRecursive(sourcePath, targetPath);
      } else {
        copyFileSync(sourcePath, targetPath);
      }
    } else {
      copyFileSync(sourcePath, targetPath);
    }
  });
};

const exportDocs = () => {
  const distDir = resolve(projectRoot, 'dist');
  if (!existsSync(distDir)) {
    console.error('Build output not found at dist/. Did the build step succeed?');
    process.exit(1);
  }

  const docsDir = resolve(projectRoot, 'docs');
  rmSync(docsDir, { recursive: true, force: true });
  mkdirSync(docsDir, { recursive: true });

  copyRecursive(distDir, docsDir);
  writeFileSync(join(docsDir, '.nojekyll'), '');
  console.log('✅ Exported static build to docs/ for GitHub Pages.');
};

runBuild();
exportDocs();
