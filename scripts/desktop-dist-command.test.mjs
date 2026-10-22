import {expect,it} from 'vitest';
import {desktopPnpmCommand} from './desktop-dist-command.mjs';

it.each(['pnpm.js','pnpm.cjs','pnpm.mjs'])('uses Node for a JavaScript pnpm entry point: %s',file=>{
  const cli=`C:/path with spaces/${file}`,node='C:/Node/node.exe';
  expect(desktopPnpmCommand({cli,node,platform:'win32'})).toEqual({executable:node,prefix:[cli]});
});
it('launches standalone pnpm.exe directly and preserves the entire path',()=>{
  const cli='C:\\package-manager store\\pnpm.exe';
  expect(desktopPnpmCommand({cli,node:'C:/Node/node.exe',platform:'win32'})).toEqual({executable:cli,prefix:[]});
});
it('launches Unix binaries directly and retains the PATH fallback',()=>{
  expect(desktopPnpmCommand({cli:'/usr/local/bin/pnpm',node:'/usr/bin/node',platform:'linux'})).toEqual({executable:'/usr/local/bin/pnpm',prefix:[]});
  expect(desktopPnpmCommand({node:'/usr/bin/node',platform:'linux'})).toEqual({executable:'pnpm',prefix:[]});
});
it('does not invoke Windows batch wrappers through an implicit shell',()=>{
  for(const cli of [undefined,'C:/path/pnpm.cmd','C:/path/pnpm.bat'])expect(()=>desktopPnpmCommand({cli,node:'node.exe',platform:'win32'})).toThrow('pnpm desktop:dist');
});
