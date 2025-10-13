export default defineNuxtPlugin(() => {
  const url = "ws://127.0.0.1:3434/ws";
  const ws = new WebSocket(url);
  return { provide: { ws } };
});

