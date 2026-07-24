const { PrismaClient } = require("@prisma/client");
const client = new PrismaClient();
async function main(){
  try {
    await client.$executeRawUnsafe(`DROP TABLE IF EXISTS tmp_reminder_test`);
    await client.$executeRawUnsafe(`CREATE TABLE tmp_reminder_test (
      id varchar(191) NOT NULL,
      user_id varchar(191) NOT NULL,
      plan_id varchar(191) NULL,
      type varchar(50) NOT NULL,
      message text NOT NULL,
      delivery_status varchar(20) NOT NULL DEFAULT 'PENDING',
      sent_at datetime(3) NULL,
      metadata json NULL,
      created_at datetime(3) NOT NULL DEFAULT current_timestamp(3),
      PRIMARY KEY (id),
      KEY tmp_reminder_test_user_id_idx (user_id),
      KEY tmp_reminder_test_plan_id_idx (plan_id),
      CONSTRAINT tmp_reminder_test_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT tmp_reminder_test_plan_id_fk FOREIGN KEY (plan_id) REFERENCES savings_plans(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    console.log('OK');
  } catch(e) {
    console.error('ERROR', e.message);
  } finally {
    try { await client.$executeRawUnsafe('DROP TABLE IF EXISTS tmp_reminder_test'); } catch(_) {}
    await client.$disconnect();
  }
}
main();
