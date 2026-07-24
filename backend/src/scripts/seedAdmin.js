  require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
  const bcrypt = require('bcryptjs');
  const prisma = require('../prisma/client');

  async function seedAdmin() {
    console.log('🌱 Seeding admin account...');

    const email = 'saviourbravo@gmail.com';
    const password = 'Great gamer23';
    const phone = '0550154253';
    const name = 'Saviour Bravo';

    const hash = await bcrypt.hash(password, 12);

    const existing = await prisma.admin.findUnique({ where: { email } });
    if (existing) {
      console.log(`✅ Admin already exists: ${email}`);
      await prisma.$disconnect();
      return;
    }

    const admin = await prisma.admin.create({
      data: {
        email,
        password_hash: hash,
        phone,
        name,
        role: 'SUPER_ADMIN',
        is_active: true,
        otp_enabled: true,
      },
    });

    // Seed default platform settings
    const settingsExist = await prisma.platformSettings.findFirst();
    if (!settingsExist) {
      await prisma.platformSettings.create({ data: {} });
      console.log('✅ Platform settings created');
    }

    console.log(`✅ Super admin created: ${admin.email} (role: ${admin.role})`);
    console.log(`📧 Email: ${email}`);
    console.log(`🔑 Password: ${password}`);
    console.log(`📱 Phone: ${phone}`);
    await prisma.$disconnect();
  }

  seedAdmin().catch(async (e) => {
    console.error('❌ Seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });