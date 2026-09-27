import { createConnection } from "net";

export default (config) => {
  if(typeof config["fallback-address"] === "undefined") {
    return;
  }

  const client = createConnection({ port: 1115, host: config["fallback-address"] }, () => {
    // listener
    console.log("Connected to failover server");
    client.write("Failover\r\n");
  });

  client.on("data", (data) => {
    console.log(`Received data from failover server: ${data.toString()}`);
  });

  client.on("end", () => {
    console.log("Disconnected from failover server");
  });
};
