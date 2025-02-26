const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Route = sequelize.define('Route', {
    profileId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Profiles',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    shift: {
      type: DataTypes.STRING,
      allowNull: false
    },
    routeData: {
      type: DataTypes.JSON,
      allowNull: false
    },
    totalEmployees: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    totalRoutes: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    averageOccupancy: {
      type: DataTypes.FLOAT,
      allowNull: false
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false
    }
  }, {
    timestamps: true
  });

  return Route;
};