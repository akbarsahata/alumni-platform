import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
const secret = () => randomBytes(32).toString("hex");
try {
  await writeFile(
    ".dev.vars",
    `BETTER_AUTH_SECRET=${secret()}\nBETTER_AUTH_URL=http://localhost:5173\nLOCAL_MAIL_KEY=${secret()}\n`,
    { flag: "wx", mode: 0o600 }
  );
  console.log("Created private local .dev.vars. Run npm run db:migrate next.");
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  console.log("Existing .dev.vars preserved.");
}
