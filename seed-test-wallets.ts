import sequelize from './src/config/database';
import { Wallet } from './src/models';

async function seedTestWallets() {
  try {
    await sequelize.authenticate();
    console.log('✓ Database connected');

    // Create test wallets
    const wallets = await Wallet.bulkCreate([
      {
        id: '11111111-1111-1111-1111-111111111112',
        userId: 'alice',
        balance: '1000.0000',
        version: 0,
      },
      {
        id: '22222222-2222-2222-2222-222222222222',
        userId: 'bob',
        balance: '500.0000',
        version: 0,
      },
    ]);

    console.log('✓ Test wallets created:');
    wallets.forEach(wallet => {
      console.log(`  - ${wallet.userId}: $${wallet.balance}`);
    });

    await sequelize.close();
  } catch (error) {
    console.error('✗ Error seeding wallets:', error);
    process.exit(1);
  }
}

seedTestWallets();
