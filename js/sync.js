const CHANNEL_NAME = "crossroads-clinic-sync";

let channel = null;
try {
  channel = new BroadcastChannel(CHANNEL_NAME);
} catch {}

export function notifyClinicUpdate() {
  try {
    channel?.postMessage({ type: "clinic-updated", at: Date.now() });
  } catch {}
}

export function onClinicUpdate(callback) {
  const handler = (e) => {
    if (e.data?.type === "clinic-updated") callback();
  };
  channel?.addEventListener("message", handler);
  window.addEventListener("storage", (e) => {
    if (e.key?.startsWith("crossroads-demo-state")) callback();
  });
  return () => {
    channel?.removeEventListener("message", handler);
  };
}

export function startPolling(callback, ms = 3000) {
  const id = setInterval(callback, ms);
  return () => clearInterval(id);
}