import {Socket} from "socket.io";
import type {WatcherClient} from "@/clients/watcher.ts";

export class FoundryClient {

  public static readonly all = new Map<string, FoundryClient>();

  public readonly watchers: WatcherClient[] = [];
  public readonly chatMessages: string[] = [];

  private allowBattlemap: boolean = false;
  private allowViewChat: boolean = false;
  private allowSendChat: boolean = false;

  constructor(
    private readonly socket: Socket
  ) {
  }

  public initialize(): void {
    this.socket.on("settings:setBattlemap", (allowed: boolean) => {
      this.allowBattlemap = allowed;
    });
    this.socket.on("settings:setViewChat", (allowed: boolean) => {
      this.allowViewChat = allowed;
    });
    this.socket.on("settings:setSendChat", (allowed: boolean) => {
      this.allowSendChat = allowed;
    });

    this.socket.on("chat:message", (msg: string) => {
      if (!this.allowViewChat) {
        return;
      }

      this.chatMessages.push(msg);

      for (const watcher of this.watchers) {
        watcher.socket.emit("chat:message", msg);
      }
    });

    this.socket.on("battlemap:send", (watcherId, b64data: string) => {
      if (!this.allowBattlemap) {
        return;
      }

      const watcher = this.watchers.find(w => w.socket.id === watcherId);
      if (!watcher) {
        return;
      }

      watcher.socket.emit("battlemap:send", b64data);
    });
  }

  public requestBattlemap(watcher: WatcherClient): boolean {
    if (!this.allowBattlemap) {
      return false;
    }

    this.socket.emit("battlemap:request", watcher.socket.id, watcher.character);
    return true;
  }

  public sendChatMessage(watcher: WatcherClient, message: string): boolean {
    if (!this.allowSendChat) {
      return false;
    }

    this.socket.emit("chat:message", watcher.socket.id, watcher.character, message);
    return true;
  }
}