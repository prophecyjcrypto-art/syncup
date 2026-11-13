/** Login-free results preview. Local `vite` dev and Vercel preview builds only. */
export function devResultsAllowed(dev: boolean, vercelEnv: string | undefined): boolean {
  return dev === true || vercelEnv === 'preview'
}

export function isDevResultsPath(pathname: string): boolean {
  const path = pathname.split('?')[0].replace(/\/+$/, '') || '/'
  return path === '/dev/results'
}
