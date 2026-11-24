import { useEffect } from 'react'

export default function useLiveRefresh(enabled, refresh) {
  useEffect(() => {
    if (!enabled) return
    const token = localStorage.getItem('token')
    if (!token) return
    const controller = new AbortController()
    let timer
    let stopped = false
    let refreshing = false
    let pending = false

    async function load() {
      if (refreshing) {
        pending = true
        return
      }
      refreshing = true
      try {
        do {
          pending = false
          await refresh(controller.signal)
        } while (pending && !stopped)
      } finally {
        refreshing = false
      }
    }

    async function connect() {
      try {
        const response = await fetch('/api/events', {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        })
        if (response.status === 401) return
        if (!response.ok || !response.body) throw new Error('Live events unavailable')
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
        let buffer = ''
        while (!stopped) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += value
          const events = buffer.split('\n\n')
          buffer = events.pop()
          if (events.some(event => event === 'data: refresh')) void load()
        }
      } catch {
        // A reconnect reloads the data after missed events.
      }
      if (!stopped) timer = window.setTimeout(connect, 3000)
    }

    void load()
    void connect()
    return () => {
      stopped = true
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [enabled, refresh])
}
