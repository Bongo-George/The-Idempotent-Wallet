import Wallet from './Wallet';
import TransactionLog from './TransactionLog';

// Define associations
Wallet.hasMany(TransactionLog, {
  foreignKey: 'fromWalletId',
  as: 'sentTransactions',
});

Wallet.hasMany(TransactionLog, {
  foreignKey: 'toWalletId',
  as: 'receivedTransactions',
});

TransactionLog.belongsTo(Wallet, {
  foreignKey: 'fromWalletId',
  as: 'fromWallet',
});

TransactionLog.belongsTo(Wallet, {
  foreignKey: 'toWalletId',
  as: 'toWallet',
});

export { Wallet, TransactionLog };