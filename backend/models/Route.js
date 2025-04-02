const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Route = sequelize.define('Route', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  uuid: {
    type: DataTypes.STRING,
    unique: true
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  shift: {
    type: DataTypes.STRING,
    allowNull: false
  },
  tripType: {
    type: DataTypes.STRING,
    allowNull: true
  },
  facilityId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  facility: {
    type: DataTypes.JSON,
    allowNull: true
  },
  profile: {
    type: DataTypes.JSON,
    allowNull: true
  },
  employeeData: {
    type: DataTypes.JSON,
    allowNull: true
  },
  routeData: {
    type: DataTypes.JSON,
    allowNull: true
  },
  totalEmployees: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  totalRoutes: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  averageOccupancy: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  ProfileId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  roadPolyline: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Encoded road-following polyline from OSRM'
  },
  roadPathDetails: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Details about the road path such as distance and duration'
  },
  geometry: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Basic waypoints geometry'
  },
  roadGeometry: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Complete road-following route geometry'
  },
  routeDetails: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Additional route details like distance, duration'
  }
}, {
  tableName: 'routes'
});

module.exports = Route;