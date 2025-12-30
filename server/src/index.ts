import { Server as Engine } from "@socket.io/bun-engine";
import { Server } from "socket.io";

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

});

const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
console.log(`Server started at ${port}`);
io.listen(port);