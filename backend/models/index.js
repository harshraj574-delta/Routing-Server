const { sequelize } = require('../config/database');
const ProfileModel = require('./Profile');
const RouteModel = require('./Route');

const Profile = ProfileModel(sequelize);
const Route = RouteModel(sequelize);

// Define associations with cascade delete
Profile.hasMany(Route, { onDelete: 'CASCADE' });
Route.belongsTo(Profile);

sequelize.sync({ force: true })
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