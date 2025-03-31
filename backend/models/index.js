const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

// Import models individually 
const Profile = require('./Profile');
const Route = require('./Route');
// Import other models
const EmployeeModel = require('./Employee');
const FacilityModel = require('./Facility');

const Employee = EmployeeModel(sequelize);
const Facility = FacilityModel(sequelize);

// Set up associations after all models are defined
Profile.hasMany(Route, { foreignKey: 'ProfileId' });
Route.belongsTo(Profile, { foreignKey: 'ProfileId' });

sequelize.sync({ force: false })
  .then(() => {
    console.log('Database synced successfully');
  })
  .catch(err => {
    console.error('Error syncing database:', err);
  });

// Export all models together
module.exports = {
  sequelize,
  Profile,
  Route,
  Employee,
  Facility
  // Include other models here
};