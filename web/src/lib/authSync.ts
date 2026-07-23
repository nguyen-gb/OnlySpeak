export type AuthSyncEvent = "identity-changed" | "logged-out" | "session-expired";

const CHANNEL_NAME = "onlyspeak-auth";
let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || !("BroadcastChannel" in window)) {
    return null;
  }
  channel ??= new BroadcastChannel(CHANNEL_NAME);
  return channel;
}

export function broadcastAuthEvent(event: AuthSyncEvent): void {
  getChannel()?.postMessage({ event });
}

export function subscribeToAuthEvents(
  listener: (event: AuthSyncEvent) => void
): () => void {
  const authChannel = getChannel();
  if (!authChannel) return () => undefined;

  const handleMessage = (message: MessageEvent<unknown>) => {
    const payload = message.data;
    if (
      typeof payload === "object" &&
      payload !== null &&
      "event" in payload &&
      ["identity-changed", "logged-out", "session-expired"].includes(
        String(payload.event)
      )
    ) {
      listener(payload.event as AuthSyncEvent);
    }
  };
  authChannel.addEventListener("message", handleMessage);
  return () => authChannel.removeEventListener("message", handleMessage);
}
