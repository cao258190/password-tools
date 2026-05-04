import { prisma } from "./db.js";
import { env } from "./env.js";
import { createApp } from "./app.js";
import { bootstrapSystem } from "./services/bootstrap.js";

await bootstrapSystem();

const app = createApp();
const server = app.listen(env.port, () => {
  console.log(`API server listening on http://localhost:${env.port}`);
});

function shutdown() {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
