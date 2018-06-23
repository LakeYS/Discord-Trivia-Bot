const net = require("net");

const server = net.createServer((socket) => {
  console.log("Incoming connection from " + socket.address().address);
  socket.write("Hello world\n");
}).on("error", (err) => {
  throw err;
});

server.listen(1115, () => {
  console.log("Failover server running: ", server.address());
});
