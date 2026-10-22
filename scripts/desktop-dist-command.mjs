/** Keep standalone pnpm binaries out of Node's JavaScript loader. */
export function desktopPnpmCommand({cli,node,platform}) {
  if (cli) {
    if (/\.[cm]?js$/iu.test(cli)) return {executable:node,prefix:[cli]};
    if (platform === 'win32' && /\.(cmd|bat)$/iu.test(cli)) {
      throw new Error('Windowsでは pnpm desktop:dist から実行し、npm_execpathにpnpmの実行ファイルを渡してください。');
    }
    return {executable:cli,prefix:[]};
  }
  if (platform === 'win32') throw new Error('Windowsでは pnpm desktop:dist から実行してください。');
  return {executable:'pnpm',prefix:[]};
}
