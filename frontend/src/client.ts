import {io, Socket} from "socket.io-client";
import {ref} from "vue";

export const currentSocket = ref<Socket | null>(null);
export const chatMessages = ref<string[]>([]);
export const battlemapBase64 = ref<string | null>(null);

export function connect(foundryId: string, character: string): Promise<void> {
  if (currentSocket.value && currentSocket.value.connected) {
    throw new Error("Already connected");
  }

  return new Promise((resolve, reject) => {
    const socket = io(import.meta.env.VITE_SERVER_URL as string);
    socket.once("connect", () => {
      socket.on("chat:messages", (messages: string[]) => {
        currentSocket.value = socket;
        chatMessages.value = messages;
        resolve();
      });
      socket.on("chat:message", (msg: string) => {
        chatMessages.value.push(msg);
      });
      socket.on("battlemap:send", (b64data: string) => {
        battlemapBase64.value = b64data;
      });

      socket.emit("hello", {
        type: "watcher",
        foundry: foundryId,
        character: character
      });
    });
    socket.once("connect_error", (err) => {
      reject(err);
    });
    socket.once("disconnect", () => {
      currentSocket.value = null;
    });
  });
}

export function requestBattlemap(): Promise<'SUCCESS'|'NOT_CONNECTED'|'NOT_ALLOWED'> {
  return new Promise(resolve => {
    if (!currentSocket.value || !currentSocket.value.connected) {
      resolve('NOT_CONNECTED');
      return;
    }

    currentSocket.value.emit("battlemap:request", (success: boolean) => {
      resolve(success ? 'SUCCESS' : 'NOT_ALLOWED');
    });
  });
}

export function sendChatMessage(message: string): Promise<'SUCCESS'|'NOT_CONNECTED'|'NOT_ALLOWED'> {
  return new Promise(resolve => {
    if (!currentSocket.value || !currentSocket.value.connected) {
      resolve('NOT_CONNECTED');
      return;
    }

    currentSocket.value.emit("chat:message", message, (success: boolean) => {
      resolve(success ? 'SUCCESS' : 'NOT_ALLOWED');
    });
  });
}