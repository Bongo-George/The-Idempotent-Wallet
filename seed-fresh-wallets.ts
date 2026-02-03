import sequelize from './src/config/database';
import { Wallet } from './src/models';

async function seedFreshWallets() {
  try {
    await sequelize.authenticate();
    console.log('✓ Database connected');

    // Clear existing wallets first
    await Wallet.destroy({ where: {}, force: true });
    console.log('✓ Cleared existing wallets');

    // Create fresh test wallets for a new test cycle
    const wallets = await Wallet.bulkCreate([
      {
        id: 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1f1',
        userId: 'user-fresh-1',
        balance: '5000.0000',
        version: 0,
      },
      {
        id: 'f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f2f2f2',
        userId: 'user-fresh-2',
        balance: '3000.0000',
        version: 0,
      },
      {
        id: 'f3f3f3f3-f3f3-f3f3-f3f3-f3f3f3f3f3f3',
        userId: 'user-fresh-3',
        balance: '7500.0000',
        version: 0,
      },
      {
        id: 'f4f4f4f4-f4f4-f4f4-f4f4-f4f4f4f4f4f4',
        userId: 'user-fresh-4',
        balance: '2500.0000',
        version: 0,
      },
      {
        id: 'f5f5f5f5-f5f5-f5f5-f5f5-f5f5f5f5f5f5',
        userId: 'user-fresh-5',
        balance: '10000.0000',
        version: 0,
      },
    ]);

    console.log('✓ Fresh test wallets created:');
    console.log('');
    wallets.forEach(wallet => {
      console.log(`  - ${wallet.userId} (ID: ${wallet.id}): $${wallet.balance}`);
    });

    console.log('');
    console.log('📝 Use these wallet IDs for Postman testing:');
    wallets.forEach(wallet => {
      console.log(`   "fromWalletId": "${wallet.id}" // ${wallet.userId}`);
    });

    await sequelize.close();
  } catch (error) {
    console.error('✗ Error seeding wallets:', error);
    process.exit(1);
  }
}

seedFreshWallets();
