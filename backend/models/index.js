const { sequelize } = require('../config/database');
const ProfileModel = require('./Profile');
const RouteModel = require('./Route');

const Profile = ProfileModel(sequelize);
const Route = RouteModel(sequelize);

// Define associations
Profile.hasMany(Route);
Route.belongsTo(Profile);

sequelize.sync()
  .then(() => {
    console.log('Database synced successfully');
  })
  .catch(err => {
    console.error('Error syncing database:', err);
  });

module.exports = {
  Profile,
  Route
};