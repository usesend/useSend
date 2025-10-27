import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.info("Seed placeholder: no-op for now.");
}

main()
  .catch((error) => {
    console.error("Failed to seed test database:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
