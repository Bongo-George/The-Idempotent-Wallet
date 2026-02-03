import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface WalletAttributes {
  id: string;
  userId: string;
  balance: string; // DECIMAL stored as string to avoid float precision issues
  version: number; // Optimistic locking support
  createdAt?: Date;
  updatedAt?: Date;
}

interface WalletCreationAttributes extends Optional<WalletAttributes, 'id' | 'version'> {}

class Wallet extends Model<WalletAttributes, WalletCreationAttributes> implements WalletAttributes {
  public id!: string;
  public userId!: string;
  public balance!: string;
  public version!: number;
  
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Wallet.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true,
      },
    },
    // CRITICAL: Use DECIMAL(19,4) not FLOAT/REAL for money
    // This prevents floating-point precision errors
    // Example: 0.1 + 0.2 = 0.30000000000000004 in float
    balance: {
      type: DataTypes.DECIMAL(19, 4),
      allowNull: false,
      defaultValue: '0.0000',
      validate: {
        isDecimal: true,
        min: 0, // No negative balances allowed at DB level
      },
    },
    // Version field for optimistic locking
    // Incremented on each update to detect concurrent modifications
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    tableName: 'wallets',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['userId'],
      },
    ],
  }
);

export default Wallet;