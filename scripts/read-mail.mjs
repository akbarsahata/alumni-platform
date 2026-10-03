import { readFile } from "node:fs/promises";
const email = process.argv[2];
if (!email) throw new Error("Usage: npm run mail -- synthetic@example.test");
const vars = Object.fromEntries((await readFile(".dev.vars", "utf8")).split("\n").filter(line => line.includes("=")).map(line => {
  const index = line.indexOf("=");
  return [line.slice(0, index), line.slice(index + 1)];
}));
const url = new URL("/__local/mail", vars.BETTER_AUTH_URL);
if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error("Mailbox is local only");
url.searchParams.set("email", email);
const response = await fetch(url, { headers: { Authorization: `Bearer ${vars.LOCAL_MAIL_KEY}` } });
if (!response.ok) throw new Error(`Mailbox unavailable (${response.status})`);
const mail = await response.json();
console.log(mail ? `${mail.subject}\n${mail.text}` : "No captured message for this address.");
