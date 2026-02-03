import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';
import { TransactionStatus } from '../types';

interface TransactionLogAttributes {
  id: string;
  fromWalletId: string;
  toWalletId: string;
  amount: string;
  status: TransactionStatus;
  idempotencyKey: string;
  errorMessage?: string | null;
  metadata?: object | null;
  createdAt?: Date;
  updatedAt?: Date;
}

interface TransactionLogCreationAttributes
  extends Optional<TransactionLogAttributes, 'id' | 'status' | 'errorMessage' | 'metadata'> {}

class TransactionLog extends Model<TransactionLogAttributes, TransactionLogCreationAttributes>
  implements TransactionLogAttributes {
  public id!: string;
  public fromWalletId!: string;
  public toWalletId!: string;
  public amount!: string;
  public status!: TransactionStatus;
  public idempotencyKey!: string;
  public errorMessage!: string | null;
  public metadata!: object | null;
  
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

TransactionLog.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    fromWalletId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'wallets',
        key: 'id',
      },
    },
    toWalletId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'wallets',
        key: 'id',
      },
    },
    amount: {
      type: DataTypes.DECIMAL(19, 4),
      allowNull: false,
      validate: {
        isDecimal: true,
        min: 0.0001, // Minimum transfer amount
      },
    },
    // Status tracks the lifecycle of each transfer attempt
    // PENDING -> SUCCESS or FAILED
    status: {
      type: DataTypes.ENUM(...Object.values(TransactionStatus)),
      allowNull: false,
      defaultValue: TransactionStatus.PENDING,
    },
    // CRITICAL: Unique constraint on idempotency key
    // Prevents duplicate processing of the same request
    idempotencyKey: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true,
        len: [1, 255],
      },
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    // Metadata for storing additional context (timestamps, IP, etc.)
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'transaction_logs',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['idempotencyKey'],
      },
      {
        fields: ['fromWalletId'],
      },
      {
        fields: ['toWalletId'],
      },
      {
        fields: ['status'],
      },
      {
        fields: ['createdAt'],
      },
    ],
  }
);

export default TransactionLog;