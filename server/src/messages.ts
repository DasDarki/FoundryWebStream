export interface HelloMessage {
  type: "foundry"|"watcher";
  character?: string;
  foundry?: string;
}