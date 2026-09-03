import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { resolve } from "node:path";

import { createRequestHandler } from "./http.js";
import { SessionManager } from "./session.js";

const staticRoot = resolve(process.cwd(), "dist");
const sessionToken = randomBytes(32).toString("base64url");
const csrfToken = randomBytes(32).toString("base64url");
const manager = new SessionManager();
let host = "";

const server = createServer(createRequestHandler({ staticRoot, sessionToken, csrfToken, expectedHost: () => host, manager }));
server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Unable to determine local address");
  host = `127.0.0.1:${address.port}`;
  process.stdout.write(`KOHON Gate A is ready:\nhttp://${host}/#token=${sessionToken}\n`);
});

function shutdown(): void {
  manager.erase();
  server.close(() => process.exit(0));
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

