import { Server as Engine } from "@socket.io/bun-engine";
import { Server } from "socket.io";
import type {HelloMessage} from "@/messages.ts";
import {FoundryClient} from "@/clients/foundry.ts";
import {WatcherClient} from "@/clients/watcher.ts";

const io = new Server({
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  }
});

const engine = new Engine({
  path: "/socket.io/",
});

io.bind(engine);

io.on("connection", (socket) => {
  socket.once("hello", (msg: HelloMessage) => {
    if (msg.type === "foundry") {
      const client = new FoundryClient(socket);
      FoundryClient.all.set(socket.id, client);

      client.initialize();

      console.log("[IO] Foundry connected:", socket.id);
    } else if (msg.type === "watcher" && msg.character && msg.foundry) {
      const foundry = FoundryClient.all.get(msg.foundry);
      if (!foundry) {
        socket.disconnect(true);
        return;
      }

      const client = new WatcherClient(socket, foundry, msg.character);
      WatcherClient.all.set(socket.id, client);
      foundry.watchers.push(client);

      client.initialize();

      console.log("[IO] Watcher connected:", socket.id, "for foundry:", msg.foundry);
    } else {
      socket.disconnect(true);

      console.log("[IO] Unknown client type, disconnected:", socket.id);
    }
  });

  socket.on("disconnect", () => {
    console.log("[IO] Socket disconnected:", socket.id);

    const foundry = FoundryClient.all.get(socket.id);
    if (foundry) {
      FoundryClient.all.delete(socket.id);

      for (const watcher of foundry.watchers) {
        WatcherClient.all.delete(watcher.socket.id);
        watcher.socket.disconnect(true);
      }

      console.log("[IO] Disconnected foundry and its watchers:", socket.id);
      return;
    }

    const watcher = WatcherClient.all.get(socket.id);
    if (watcher) {
      WatcherClient.all.delete(socket.id);

      const index = watcher.foundry.watchers.indexOf(watcher);
      if (index !== -1) {
        watcher.foundry.watchers.splice(index, 1);
      }

      console.log("[IO] Disconnected watcher:", socket.id);
    }
  });
});

const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
console.log(`Server started at ${port}`);
io.listen(port);