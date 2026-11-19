import { build } from 'esbuild';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalEnv, publicConfig } from './config.mjs';

export async function buildSite() {
  const root = fileURLToPath(new URL('..', import.meta.url));
  process.chdir(root);
  loadLocalEnv();
  const config = publicConfig();
  const output = resolve(root,'dist');
  if (output !== resolve(join(root,'dist')) || output === resolve(root)) throw new Error('잘못된 출력 경로');
  await rm(output,{recursive:true,force:true});
  await mkdir(join(output,'assets'),{recursive:true});
  await build({entryPoints:['src/main.js'],bundle:true,outdir:join(output,'assets'),
    entryNames:'app',minify:true,format:'esm',target:['es2022'],
    define:{'import.meta.env':JSON.stringify(config)},logLevel:'info'});
  const html = (await readFile('index.html','utf8'))
    .replace('src="/src/main.js"','src="/assets/app.js"')
    .replace('</head>','<link rel="stylesheet" href="/assets/app.css" /></head>');
  await writeFile(join(output,'index.html'),html);
  console.log('조회 웹 빌드 완료');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildSite();
