const { PrismaClient } = require("@prisma/client");
const client = new PrismaClient();
async function main(){
  try {
    const dbs = await client.$queryRawUnsafe("SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'prisma_migrate_shadow_db_%'");
    console.log(JSON.stringify({dbs}, null,2));
  } catch(e) {
    console.error(e);
    process.exit(1);
  } finally {
    await client.$disconnect();
  }
}
main();
