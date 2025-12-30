import type {Socket} from "socket.io";
import type {FoundryClient} from "@/clients/foundry.ts";

export class WatcherClient {

  public static readonly all = new Map<string, WatcherClient>();

  constructor(
    public readonly socket: Socket,
    public readonly foundry: FoundryClient,
    public readonly character: string
  ) {
  }

  public initialize(): void {
    this.socket.on("battlemap:request", (ack: (success: boolean) => void) => {
      const result = this.foundry.requestBattlemap(this);
      ack(result);
    });
    this.socket.on("chat:message", (message: string, ack: (success: boolean) => void) => {
      const result = this.foundry.sendChatMessage(this, message);
      ack(result);
    });

    this.socket.emit("chat:messages", this.foundry.chatMessages); // this is basically the ack for connect
  }
}