// Deletes the local datastore so the next server start reseeds the demo (npm run db:reset).
import { rmSync } from "node:fs";
const dir = process.env.FABRIK_DATA_DIR || ".data";
rmSync(`${dir}/fabrik-db.json`, { force: true });
console.log(`Removed ${dir}/fabrik-db.json — restart the server to reseed Smith Family Farms.`);
