const API_BASE_URL = 'http://localhost:5001/api';

export const profileService = {
  create: async (profileData) => {
    const response = await fetch(`${API_BASE_URL}/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profileData)
    });
    if (!response.ok) throw new Error('Failed to create profile');
    return response.json();
  },

  getAll: async () => {
    const response = await fetch(`${API_BASE_URL}/profiles`);
    if (!response.ok) throw new Error('Failed to fetch profiles');
    return response.json();
  },

  getById: async (id) => {
    const response = await fetch(`${API_BASE_URL}/profiles/${id}`);
    if (!response.ok) throw new Error('Failed to fetch profile');
    return response.json();
  },

  update: async (id, profileData) => {
    const response = await fetch(`${API_BASE_URL}/profiles/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profileData)
    });
    if (!response.ok) throw new Error('Failed to update profile');
    return response.json();
  },

  delete: async (id) => {
    const response = await fetch(`${API_BASE_URL}/profiles/${id}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error('Failed to delete profile');
    if (response.status === 204) return null;
    return response.json();
  }
};

export const facilityService = {
  getAll: async () => {
    const response = await fetch(`${API_BASE_URL}/facilities`);
    if (!response.ok) throw new Error('Failed to fetch facilities');
    return response.json();
  },

  getById: async (id) => {
    const response = await fetch(`${API_BASE_URL}/facilities/${id}`);
    if (!response.ok) throw new Error('Failed to fetch facility');
    return response.json();
  },

  create: async (facilityData) => {
    const response = await fetch(`${API_BASE_URL}/facilities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(facilityData)
    });
    if (!response.ok) throw new Error('Failed to create facility');
    return response.json();
  },

  update: async (id, facilityData) => {
    const response = await fetch(`${API_BASE_URL}/facilities/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(facilityData)
    });
    if (!response.ok) throw new Error('Failed to update facility');
    return response.json();
  },

  delete: async (id) => {
    const response = await fetch(`${API_BASE_URL}/facilities/${id}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error('Failed to delete facility');
    return response.json();
  }
};

export const employeeService = {
  getEmployeeData: async (shift) => {
    try {
      const response = await fetch(`${API_BASE_URL}/employees?shift=${shift}`);
      if (!response.ok) throw new Error('Failed to fetch employee data');
      return response.json();
    } catch (error) {
      console.error('Error fetching employee data:', error);
      throw error;
    }
  }
};

export const routeService = {
  create: async (routeData) => {
    try {
      const response = await fetch(`${API_BASE_URL}/routes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(routeData),
      });
      if (!response.ok) throw new Error('Failed to create route');
      return response.json();
    } catch (error) {
      console.error('Error creating route:', error);
      throw error;
    }
  },

  getAllRoutes: async () => {
    try {
      console.log('Making API request to:', `${API_BASE_URL}/routes/test`);
      
      // First, test if route routes are registered at all
      try {
        const testResponse = await fetch(`${API_BASE_URL}/routes/test`);
        console.log('Test endpoint response:', await testResponse.text());
      } catch (e) {
        console.error('Test endpoint failed:', e);
      }
      
      // Now try the actual routes endpoint
      console.log('Making API request to:', `${API_BASE_URL}/routes`);
      const response = await fetch(`${API_BASE_URL}/routes`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      console.log('API response status:', response.status);
      
      // If the main endpoint fails, try the direct route
      if (!response.ok) {
        console.log('Main endpoint failed, trying direct endpoint');
        const directResponse = await fetch(`${API_BASE_URL}/directroutes`);
        
        if (directResponse.ok) {
          const data = await directResponse.json();
          console.log('Direct routes API response data:', data);
          return data;
        } else {
          console.error('Direct endpoint also failed:', directResponse.status);
          const errorText = await directResponse.text();
          throw new Error(`Direct routes endpoint failed: ${directResponse.status} ${errorText}`);
        }
      }
      
      const data = await response.json();
      console.log('API response data:', data);
      return data;
    } catch (error) {
      console.error('Error fetching routes:', error);
      throw error;
    }
  },

  getByDateAndShift: async (date, shift) => {
    const response = await fetch(`${API_BASE_URL}/routes/by-date-shift?date=${date}&shift=${shift}`);
    if (!response.ok) throw new Error('Failed to fetch routes');
    return response.json();
  },

  getById: async (id) => {
    try {
      console.log(`Fetching route with ID: ${id}`);
      const response = await fetch(`${API_BASE_URL}/routes/${id}`);

      if (!response.ok) {
        console.error(`API error: ${response.status} ${response.statusText}`);
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('Raw route data fetched:', JSON.stringify(data).slice(0, 500) + '...');

      // Process the data to ensure properly structured JSON
      if (data) {
        // Parse JSON fields if they are strings
        if (typeof data.routeData === 'string') {
          try {
            data.routeData = JSON.parse(data.routeData);
            console.log('Parsed routeData from string, count:', data.routeData.length);
          } catch (e) {
            console.warn('Failed to parse routeData JSON', e);
            data.routeData = [];
          }
        }

        // Ensure routeData is an array
        if (!data.routeData) {
          data.routeData = [];
        } else if (!Array.isArray(data.routeData)) {
          data.routeData = [data.routeData];
        }

        // Ensure each route in routeData has proper geometry
        data.routeData = data.routeData.map((route, index) => {
          // Parse geometry if it's a string
          if (typeof route.geometry === 'string') {
            try {
              route.geometry = JSON.parse(route.geometry);
              console.log(`Parsed geometry for route ${index}, coordinates:`, 
                route.geometry.coordinates ? route.geometry.coordinates.length : 'none');
            } catch (e) {
              console.warn(`Failed to parse route geometry for route ${index}:`, e);
              route.geometry = null;
            }
          }
          
          // Parse employee data if it's a string
          if (typeof route.employees === 'string') {
            try {
              route.employees = JSON.parse(route.employees);
              console.log(`Parsed employees for route ${index}, count:`, route.employees.length);
            } catch (e) {
              console.warn(`Failed to parse employee data for route ${index}:`, e);
              route.employees = [];
            }
          }
          
          return route;
        });
        
        console.log('Processed route data:', 
          data.routeData.map(r => ({
            id: r.id,
            hasGeometry: !!r.geometry,
            employeeCount: r.employees ? r.employees.length : 0
          }))
        );
      }

      return data;
    } catch (error) {
      console.error('Error fetching route by ID:', error);
      throw error;
    }
  },

  getByProfile: async (profileId) => {
    const response = await fetch(`${API_BASE_URL}/routes/profile/${profileId}`);
    if (!response.ok) throw new Error('Failed to fetch routes');
    return response.json();
  }
};