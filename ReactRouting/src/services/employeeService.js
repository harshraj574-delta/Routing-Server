import Papa from 'papaparse';

export const employeeService = {
  getEmployeeData: async () => {
    try {
      const response = await fetch('/NCR_emp_data.csv');
      if (!response.ok) throw new Error('Failed to fetch employee data');
      
      const csvText = await response.text();
      const results = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true
      });

      if (results.errors.length > 0) {
        throw new Error('Failed to parse employee data');
      }

      return results.data;
    } catch (error) {
      console.error('Error loading employee data:', error);
      throw error;
    }
  }
};