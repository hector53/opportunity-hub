import { hashPassword } from "../src/server/auth/session";

const pw = process.argv[2];
if (!pw || pw.length < 10) {
  console.error("Usage: npm run auth:hash -- '<password of 10+ chars>'");
  process.exit(1);
}
console.log(hashPassword(pw));
