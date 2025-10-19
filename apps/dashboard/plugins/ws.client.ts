export default defineNuxtPlugin(() => {
  let ws: WebSocket | null = null;
  let reconnectTimeout: number | null = null;
  const listeners = new Set<(event: MessageEvent) => void>();
  
  // Get daemon URL from runtime config and convert to WebSocket URL
  const config = useRuntimeConfig()
  const daemonUrl = config.public.daemonUrl || 'http://127.0.0.1:3434'
  const wsUrl = daemonUrl.replace(/^http/, 'ws') + '/ws'

  function connect() {
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
      return;
    }

    ws = new WebSocket(wsUrl);

    ws.addEventListener("message", (event) => {
      listeners.forEach(listener => listener(event));
    });

    ws.addEventListener("close", () => {
      // Auto-reconnect after 2 seconds
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      reconnectTimeout = window.setTimeout(() => {
        connect();
      }, 2000);
    });

    ws.addEventListener("error", () => {
      // Will trigger close event, which handles reconnection
    });
  }

  // Initial connection
  connect();

  return {
    provide: {
      ws: {
        get readyState() {
          return ws?.readyState ?? WebSocket.CLOSED;
        },
        addEventListener(type: string, listener: any) {
          if (type === "message") {
            listeners.add(listener);
          } else if (ws) {
            ws.addEventListener(type, listener);
          }
        },
        removeEventListener(type: string, listener: any) {
          if (type === "message") {
            listeners.delete(listener);
          } else if (ws) {
            ws.removeEventListener(type, listener);
          }
        }
      }
    }
  };
});
