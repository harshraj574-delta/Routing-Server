const { Employee } = require('../models');

const employeeController = {
  async getAllEmployees(req, res) {
    try {
      const employees = await Employee.findAll({
        raw: true,
        attributes: ['empCode', 'address', 'geoX', 'geoY', 'gender', 'shift']
      });
      
      // Log raw data to verify shift is present
      console.log('First employee raw data:', employees[0]);
      
      const transformedEmployees = employees.map(emp => {
        // Ensure shift is a number and exists
        const shiftTime = emp.shift !== null && emp.shift !== undefined ? parseInt(emp.shift) : null;
        
        const transformed = {
          id: emp.empCode,
          name: emp.empCode,
          location: {
            lat: parseFloat(emp.geoY),
            lng: parseFloat(emp.geoX)
          },
          address: emp.address || '',
          gender: emp.gender || 'unknown',
          shiftTime: shiftTime, // Include the numeric shift time
          zone: emp.zone || ''
        };
        return transformed;
      });

      // Log transformed data to verify shift is included
      console.log('First employee transformed:', transformedEmployees[0]);

      res.json(transformedEmployees);
    } catch (error) {
      console.error('Error in getAllEmployees:', error);
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = employeeController; 