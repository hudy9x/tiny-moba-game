/** Small transport boundary. Gameplay never trusts client-provided health or positions. */
export class GameConnection {
  constructor(onState, onStatus) {
    this.onState = onState;
    this.onStatus = onStatus;
    this.room = new URLSearchParams(location.search).get("room") || "greenwood";
    this.id = null;
    this.closed = false;
    this.connect();
  }

  connect() {
    this.onStatus("Connecting…");
    const url = new URL(
      import.meta.env.VITE_SOCKET_URL ||
        `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`,
    );
    url.searchParams.set("room", this.room);
    const socket = (this.socket = new WebSocket(url));
    this.handshakeTimer = setTimeout(() => {
      this.onStatus("Server unavailable · retrying…");
      socket.close();
    }, 5000);
    socket.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      if (message.type === "welcome") {
        clearTimeout(this.handshakeTimer);
        this.id = message.id;
        this.onStatus(`Room: ${message.room}`);
      }
      if (message.type === "state") this.onState(message);
    };
    socket.onerror = () =>
      this.onStatus("Server unavailable. Start npm run dev.");
    socket.onclose = (event) => {
      clearTimeout(this.handshakeTimer);
      this.id = null;
      this.onStatus(
        event.code === 1008 ? event.reason : "Disconnected · reconnecting…",
      );
      if (!this.closed && event.code !== 1008)
        this.retry = setTimeout(() => this.connect(), 2000);
    };
  }

  send(message) {
    if (this.id && this.socket.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify(message));
  }

  dispose() {
    this.closed = true;
    clearTimeout(this.retry);
    clearTimeout(this.handshakeTimer);
    this.socket.close();
  }
}
