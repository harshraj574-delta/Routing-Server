import Papa from 'papaparse';
const API_BASE_URL = 'http://localhost:5001/api';

export const employeeService = {
  getEmployeeData: async (shift) => {
    const response = await fetch(`${API_BASE_URL}/employees${shift ? `?shift=${shift}` : ''}`);
    if (!response.ok) throw new Error('Failed to fetch employee data');
    return response.json();
  }
};