/** True while the sync server is downloading for a phone. The window download waits. */
let running = false

export function setServerJobRunning(value: boolean): void {
  running = value
}

export function isServerJobRunning(): boolean {
  return running
}
