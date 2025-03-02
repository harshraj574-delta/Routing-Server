import Papa from 'papaparse';
import { employeeService } from '../services/employeeService';

export const assignZoneToEmployee = (employeeLocation, zones) => {
  for (const feature of zones.features) {
    const coordinates = feature.geometry.coordinates[0];
    if (isPointInPolygon(employeeLocation, coordinates)) {
      return feature.properties.Name;
    }
  }
  return null;
};

const isPointInPolygon = (point, polygon) => {
  let inside = false;
  const x = point[0];
  const y = point[1];
  
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    
    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  
  return inside;
};

export const loadEmployeeData = async () => {
  try {
    console.log('Starting to load employee data...');
    const [employees, zoneData] = await Promise.all([
      employeeService.getEmployeeData(),
      fetch('/delhi_ncr_zones.json').then(res => res.json())
    ]);

    console.log('Received employees:', employees);
    console.log('Received zone data:', zoneData);

    // Process employees and assign zones
    const processedEmployees = employees.map(emp => {
      const location = [emp.location.lng, emp.location.lat];
      const zone = assignZoneToEmployee(location, zoneData);
      
      return {
        ...emp,
        zone
      };
    }).filter(emp => emp.zone !== null);

    console.log('Processed employees:', processedEmployees);
    return processedEmployees;

  } catch (error) {
    console.error('Employee data loading error:', error);
    throw new Error(`Failed to load employee data: ${error.message}`);
  }
};

export const loadZoneData = async () => {
  try {
    const response = await fetch('/delhi_ncr_zones.json');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    console.log(`Loaded ${data.features.length} zones from JSON`);
    return data;
  } catch (error) {
    console.error('Zone data loading error:', error);
    throw new Error(`Failed to load zone data: ${error.message}`);
  }
};