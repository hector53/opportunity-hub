import { syncGetOnBoard } from "../src/server/connectors/getonboard/sync";
import { sqlClient } from "../src/server/db/client";

syncGetOnBoard("manual")
  .then((r) => console.log(r.message, r.errors.length ? r.errors : ""))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => sqlClient.end());
