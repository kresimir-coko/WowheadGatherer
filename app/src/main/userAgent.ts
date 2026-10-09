/** Electron's user agent without its own and the app's names, so Wowhead sees the Chrome it really is. */
export function browserUserAgent(electronAgent: string): string {
  return electronAgent
    .replace(/\(KHTML, like Gecko\).*?Chrome\//, '(KHTML, like Gecko) Chrome/')
    .replace(/\sElectron\/\S+/, '');
}
