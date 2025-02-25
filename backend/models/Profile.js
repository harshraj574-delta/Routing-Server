const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Profile = sequelize.define('Profile', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    zoneClubbing: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    highCapacityZones: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: []
    },
    zonePairingMatrix: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {}
    },
    isAutoClubbing: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false
    }
  });

  return Profile;
};