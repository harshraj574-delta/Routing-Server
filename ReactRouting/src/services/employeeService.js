import Papa from 'papaparse';

export const employeeService = {
  getEmployeeData: async () => {
    try {
      const response = await fetch('http://localhost:5001/api/employees', {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch employee data');
      }
      
      const employees = await response.json();
      console.log('Received employees:', employees.length);
      return employees;
    } catch (error) {
      console.error('Error loading employee data:', error);
      throw error;
    }
  }
};