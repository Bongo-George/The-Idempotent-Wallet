'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('transaction_logs', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      fromWalletId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'wallets',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      toWalletId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'wallets',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      amount: {
        type: Sequelize.DECIMAL(19, 4),
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM('PENDING', 'SUCCESS', 'FAILED'),
        allowNull: false,
        defaultValue: 'PENDING',
      },
      idempotencyKey: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      errorMessage: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    await queryInterface.addIndex('transaction_logs', ['idempotencyKey'], {
      unique: true,
      name: 'transaction_logs_idempotencyKey_unique',
    });

    await queryInterface.addIndex('transaction_logs', ['fromWalletId'], {
      name: 'transaction_logs_fromWalletId_idx',
    });

    await queryInterface.addIndex('transaction_logs', ['toWalletId'], {
      name: 'transaction_logs_toWalletId_idx',
    });

    await queryInterface.addIndex('transaction_logs', ['status'], {
      name: 'transaction_logs_status_idx',
    });

    await queryInterface.addIndex('transaction_logs', ['createdAt'], {
      name: 'transaction_logs_createdAt_idx',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('transaction_logs');
  },
};