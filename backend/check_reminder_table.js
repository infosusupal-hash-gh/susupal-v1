const { PrismaClient } = require("@prisma/client");
const client = new PrismaClient();
async function main(){
  try {
    const res = await client.$queryRawUnsafe("SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name = 'reminder_logs'");
    console.log(JSON.stringify(res, null, 2));
  } catch(e) {
    console.error(e);
    process.exit(1);
  } finally {
    await client.$disconnect();
  }
}
main();
