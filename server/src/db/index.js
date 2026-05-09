import { createMemoryRepository } from "./memoryRepository.js";
import { createMongoRepository } from "./mongoRepository.js";
import { createMySqlRepository } from "./mysqlRepository.js";

export function createDatabase() {
  const provider = (process.env.DB_PROVIDER || "memory").toLowerCase();

  if (provider === "mysql") {
    return createMySqlRepository();
  }

  if (provider === "mongodb" || provider === "mongo") {
    return createMongoRepository();
  }

  return createMemoryRepository();
}
