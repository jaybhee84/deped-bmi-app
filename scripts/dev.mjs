import { createServer } from 'vite'
import electron from 'electron'
import { spawn } from 'node:child_process'

const server = await createServer()
await server.listen()
server.printUrls()

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
env.ELECTRON_DEV_URL = server.resolvedUrls.local[0]

const child = spawn(electron, ['.'], { env, stdio: 'inherit' })
let closing = false
async function close(code = 0) {
  if (closing) return
  closing = true
  child.kill()
  await server.close()
  process.exit(code)
}
child.on('error', (error) => {
  console.error('Unable to launch Electron:', error)
  void close(1)
})
child.on('exit', (code) => void close(code ?? 0))
process.on('SIGINT', () => void close())
process.on('SIGTERM', () => void close())
