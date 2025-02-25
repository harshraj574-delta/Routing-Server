import Papa from 'papaparse';

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
    const response = await fetch('/NCR_emp_data.csv');
    const zoneResponse = await fetch('/delhi_ncr_zones.json');

    if (!response.ok || !zoneResponse.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const [csvText, zoneData] = await Promise.all([
      response.text(),
      zoneResponse.json()
    ]);

    return new Promise((resolve, reject) => {
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.errors.length > 0) {
            console.error('CSV parsing errors:', results.errors);
          }
          const employees = results.data
            .filter(emp => 
              emp.empCode && 
              emp.geoX && 
              emp.geoY && 
              !isNaN(parseFloat(emp.geoX)) && 
              !isNaN(parseFloat(emp.geoY))
            )
            .map(emp => {
              const longitude = parseFloat(emp.geoX);
              const latitude = parseFloat(emp.geoY);
              
              // Use [longitude, latitude] format for zone assignment
              const location = [longitude, latitude];
              const zone = assignZoneToEmployee(location, zoneData);
              
              return {
                id: emp.empCode,
                name: emp.name || emp.empCode,
                location: { lat: latitude, lng: longitude }, // Store as object format for Leaflet
                address: emp.address || '',
                zone: zone
              };
            })
            .filter(emp => emp.zone !== null);
          
          console.log(`Loaded ${employees.length} employees with valid zones`);
          resolve(employees);
        },
        error: (error) => {
          console.error('CSV parsing error:', error);
          reject(new Error(`Failed to parse CSV: ${error.message}`));
        }
      });
    });
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