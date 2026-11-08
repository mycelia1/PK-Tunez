import { Bonjour, type Service } from 'bonjour-service'

let bonjour: Bonjour | null = null
let service: Service | null = null

/** Tell phones on the same network that PK-Tunez is here. */
export function advertise(port: number): void {
  stopAdvertise()
  try {
    bonjour = new Bonjour()
    service = bonjour.publish({
      name: 'PK-Tunez',
      type: 'pktunez',
      port,
      txt: { path: '/api/v1' }
    })
  } catch {
    stopAdvertise()
  }
}

export function stopAdvertise(): void {
  try {
    service?.stop()
  } catch {
    // Already unpublished.
  }
  try {
    bonjour?.destroy()
  } catch {
    // Already destroyed.
  }
  service = null
  bonjour = null
}
