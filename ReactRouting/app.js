// Define global variables first
let currentPolylines = [];
let currentMarkers = [];
const facility = [28.402910, 76.998015];
let zones = {};
let selectedZone = null;
let zonePairingMatrix = {};
let highCapacityZones = new Set();

// Initialize map
const map = L.map('map').setView([28.7041, 77.1025], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// Define core functions first
async function clearPreviousRoutesWithAnimation() {
    // Fade out existing elements
    currentPolylines.forEach(polyline => {
        const element = polyline.getElement();
        if (element) element.classList.add('fade-out');
    });

    currentMarkers.forEach(marker => {
        const element = marker.getElement();
        if (element) element.classList.add('fade-out');
    });

    // Wait for fade animation
    await new Promise(resolve => setTimeout(resolve, 300));

    // Clear elements
    currentPolylines.forEach(polyline => map.removeLayer(polyline));
    currentMarkers.forEach(marker => map.removeLayer(marker));

    currentPolylines = [];
    currentMarkers = [];

    return Promise.resolve();
}

async function loadEmployeeData(employeeData, withClubbing) {
    const loadingOverlay = document.querySelector('.loading-overlay');
    loadingOverlay.classList.add('active');

    try {
        // Process employee data
        const processedEmployees = employeeData.map(emp => ({
            ...emp,
            location: [parseFloat(emp.geoY), parseFloat(emp.geoX)]
        }));

        // Group employees by zone
        const employeesByZone = {};
        processedEmployees.forEach(emp => {
            const zoneName = findZoneForEmployee(emp.location);
            if (zoneName) {
                emp.zoneName = zoneName;
                if (!employeesByZone[zoneName]) {
                    employeesByZone[zoneName] = [];
                }
                employeesByZone[zoneName].push(emp);
            }
        });

        // Create routes based on zone capacity and clubbing settings
        let allRoutes = [];
        const zoneNames = Object.keys(employeesByZone);

        if (withClubbing) {
            // Handle clubbed zones
            const processedZones = new Set();

            for (const zoneName of zoneNames) {
                if (processedZones.has(zoneName)) continue;

                const zoneEmployees = employeesByZone[zoneName] || [];
                const pairedZones = zonePairingMatrix[zoneName] || [];

                if (pairedZones.length > 0) {
                    for (const pairedZone of pairedZones) {
                        if (!processedZones.has(pairedZone)) {
                            const pairedEmployees = employeesByZone[pairedZone] || [];
                            const combinedEmployees = [...zoneEmployees, ...pairedEmployees];

                            if (combinedEmployees.length > 0) {
                                // If either zone is high capacity, use 12-seater
                                const maxCapacity = highCapacityZones.has(zoneName) ||
                                    highCapacityZones.has(pairedZone) ? 12 : 6;

                                // Split into routes based on capacity
                                const routes = await splitIntoRoutes(combinedEmployees, maxCapacity);
                                if (routes) {
                                    allRoutes.push(...routes);
                                }
                            }

                            processedZones.add(zoneName);
                            processedZones.add(pairedZone);
                        }
                    }
                }
            }

            // Handle remaining zones
            for (const zoneName of zoneNames) {
                if (!processedZones.has(zoneName)) {
                    const zoneEmployees = employeesByZone[zoneName] || [];
                    if (zoneEmployees.length > 0) {
                        const maxCapacity = highCapacityZones.has(zoneName) ? 12 : 6;
                        const routes = await splitIntoRoutes(zoneEmployees, maxCapacity);
                        if (routes) {
                            allRoutes.push(...routes);
                        }
                    }
                }
            }
        } else {
            // Handle zones without clubbing
            for (const zoneName of zoneNames) {
                const zoneEmployees = employeesByZone[zoneName] || [];
                if (zoneEmployees.length > 0) {
                    const maxCapacity = highCapacityZones.has(zoneName) ? 12 : 6;
                    const routes = await splitIntoRoutes(zoneEmployees, maxCapacity);
                    if (routes) {
                        allRoutes.push(...routes);
                    }
                }
            }
        }

        // Display routes in sidebar
        displayRoutesSidebar(allRoutes, processedEmployees.length, withClubbing);

    } catch (error) {
        console.error("Error processing employee data:", error);
    } finally {
        loadingOverlay.classList.remove('active');
    }
}

function loadCSVData(filePath) {
    const loadingOverlay = document.querySelector('.loading-overlay');
    loadingOverlay.classList.add('active');

    fetch(filePath)
        .then(response => response.text())
        .then(csvData => {
            Papa.parse(csvData, {
                header: true,
                skipEmptyLines: true,
                complete: function (results) {
                    console.log("CSV Data loaded:", results.data.length, "employees");
                    window.employeeData = results.data;

                    // Initial choice buttons
                    document.getElementById('withClubbing').onclick = async () => {
                        console.log("With clubbing clicked");
                        const loadingOverlay = document.querySelector('.loading-overlay');

                        // First update UI
                        document.getElementById('routingChoice').style.display = 'none';
                        document.querySelector('.mode-toggle-container').style.display = 'flex';
                        document.getElementById('summary').style.display = 'block';
                        document.getElementById('routingToggle').checked = true;

                        // Show loading before showing modal
                        loadingOverlay.classList.add('active');

                        // Small delay to ensure loading overlay is visible
                        await new Promise(resolve => setTimeout(resolve, 50));

                        showZonePairingModal(true);
                    };

                    document.getElementById('withoutClubbing').onclick = async () => {
                        console.log("Without clubbing clicked");
                        const loadingOverlay = document.querySelector('.loading-overlay');
                        loadingOverlay.classList.add('active');

                        // First update UI
                        document.getElementById('routingChoice').style.display = 'none';
                        document.querySelector('.mode-toggle-container').style.display = 'flex';
                        document.getElementById('summary').style.display = 'block';
                        document.getElementById('routingToggle').checked = false;

                        // Show modal for 12-seater selection
                        showZonePairingModal(false);
                    };

                    loadingOverlay.classList.remove('active');
                },
                error: function (error) {
                    console.error("Error parsing CSV:", error);
                    loadingOverlay.classList.remove('active');
                }
            });
        })
        .catch(error => {
            console.error("Error loading CSV:", error);
            loadingOverlay.classList.remove('active');
        });
}

function calculateZoneCentroid(employees) {
    const sumLat = employees.reduce((sum, emp) => sum + emp.location[0], 0);
    const sumLng = employees.reduce((sum, emp) => sum + emp.location[1], 0);
    return [
        sumLat / employees.length,
        sumLng / employees.length
    ];
}

// Helper function to check if a point is inside a polygon
function isPointInPolygon(point, polygon) {
    const [x, y] = point;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].lat, yi = polygon[i].lng;
        const xj = polygon[j].lat, yj = polygon[j].lng;

        const intersect = ((yi > y) !== (yj > y)) &&
            (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function displayRoutesSidebar(allRoutes, totalEmployees, withClubbing) {
    const sidebar = document.getElementById("sidebar");

    // Remove any existing toggle event listeners
    const existingToggle = document.getElementById('routingToggle');
    if (existingToggle) {
        existingToggle.removeEventListener('change', existingToggle.changeHandler);
    }

    sidebar.innerHTML = `
              <h2>Employee Routing</h2>
              <div class="mode-toggle-container">
                  <span class="mode-toggle-label">Enable Zone Clubbing</span>
                  <label class="toggle-switch">
                      <input type="checkbox" id="routingToggle" ${withClubbing ? 'checked' : ''}>
                      <span class="toggle-slider"></span>
                  </label>
              </div>
              <div id="summary">
                  <div id="selectedZoneDiv">
                      <p><strong>Selected Zone:</strong> <span id="selectedZone">None</span></p>
                  </div>
                  <div id="totalRoutesDiv">
                      <p><strong>Total Routes:</strong> <span id="totalRoutes">${allRoutes.length}</span></p>
                  </div>
                  <div id="totalEmployeesDiv">
                      <p><strong>Total Employees:</strong> <span id="totalEmployees">${totalEmployees}</span></p>
                  </div>
                  <div id="avgOccupancyDiv">
                      <p><strong>Avg Occupancy:</strong> <span id="avgOccupancy">${(totalEmployees / allRoutes.length).toFixed(1)}</span></p>
                  </div>
              </div>
          `;

    // Add route buttons
    allRoutes.forEach((route, index) => {
        const routeEmployees = route.employees || route;
        const zoneName = route.zoneName || routeEmployees[0].zoneName;
        const duration = route.duration || 0;

        // Calculate different duration components
        const baseDuration = duration / 1.4; // Remove traffic buffer to get base duration
        const trafficTime = baseDuration * 0.4;
        const pickupTime = routeEmployees.length * 180;

        const hours = Math.floor(duration / 3600);
        const minutes = Math.floor((duration % 3600) / 60);

        const zoneButton = document.createElement("button");
        zoneButton.classList.add("route-btn");

        const durationClass = duration > 2 * 3600 ? 'duration-warning' : '';

        zoneButton.innerHTML = `
                  <span class="route-number">Route ${index + 1}</span>
                  <span class="zone-info">Zone: ${zoneName}</span>
                  <span class="employee-count">Employees: ${routeEmployees.length}</span>
                  <span class="route-duration ${durationClass}">
                      Total Duration: ${hours}h ${minutes}m
                      <span class="duration-breakdown">
                          (Drive: ${Math.round(baseDuration / 60)}m + 
                          Traffic: ${Math.round(trafficTime / 60)}m + 
                          Pickups: ${Math.round(pickupTime / 60)}m)
                      </span>
                  </span>
              `;

        zoneButton.onclick = () => createRouteForZone(routeEmployees);
        sidebar.appendChild(zoneButton);
    });

    // Add new toggle event listener
    const newToggle = document.getElementById('routingToggle');
    if (newToggle) {
        newToggle.changeHandler = function (e) {
            e.preventDefault(); // Prevent default toggle behavior
            handleZoneClubbing(e);
        };
        newToggle.addEventListener('change', newToggle.changeHandler);
    }
}

// First, create two different icons for male and female employees
const maleEmployeeIcon = L.divIcon({
    className: 'employee-icon male',
    iconSize: [24, 24]
});

const femaleEmployeeIcon = L.divIcon({
    className: 'employee-icon female',
    iconSize: [24, 24]
});

// Update the createRouteForZone function's marker creation part
async function createRouteForZone(route) {
    const loadingOverlay = document.querySelector('.loading-overlay');
    loadingOverlay.classList.add('active');

    try {
        await clearPreviousRoutesWithAnimation();

        if (!route || !Array.isArray(route) || route.length === 0) {
            throw new Error("Invalid route data");
        }

        // Add facility marker
        const facilityMarker = L.marker(facility, {
            icon: facilityIcon
        })
            .bindPopup("<b>Facility</b><br>Final Destination")
            .addTo(map);
        currentMarkers.push(facilityMarker);

        // Add employee markers first
        route.forEach((emp, index) => {
            if (!emp.location || !Array.isArray(emp.location)) {
                console.error("Invalid employee location:", emp);
                return;
            }
            const marker = L.marker(emp.location, {
                icon: emp.gender === 'F' ? femaleEmployeeIcon : maleEmployeeIcon
            })
                .bindPopup(`
                      <b>Employee:</b> ${emp.empCode}<br>
                      <b>Gender:</b> ${emp.gender}<br>
                      <b>Stop:</b> ${index + 1}<br>
                      <b>Zone:</b> ${emp.zoneName}
                  `)
                .addTo(map);
            currentMarkers.push(marker);
        });

        // Create waypoints including facility
        const waypoints = [
            ...route.map(emp => emp.location),
            facility
        ];

        const waypointsString = waypoints
            .map(point => `${point[1]},${point[0]}`)
            .join(';');

        const url = `http://localhost:5000/route/v1/driving/${waypointsString}?overview=full&geometries=geojson&steps=true`;

        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();
        if (!data.routes || !data.routes[0]) {
            throw new Error("No route data received");
        }

        const duration = data.routes[0].duration;

        // Check duration limit
        const MAX_DURATION = 2.5 * 3600; // 2.5 hours in seconds
        if (duration > MAX_DURATION) {
            console.warn("Route duration exceeds 2.5 hours:", (duration / 3600).toFixed(2), "hours");
            loadingOverlay.classList.remove('active');
            return null;
        }

        // Create and add the route polyline
        const coordinates = data.routes[0].geometry.coordinates;
        const segmentCoords = coordinates.map(coord => [coord[1], coord[0]]);

        const polyline = L.polyline(segmentCoords, {
            color: '#2196F3', // Google Maps-like blue color
            weight: 4,
            opacity: 0.7,
            lineCap: 'round',
            lineJoin: 'round',
            smoothFactor: 1
        }).addTo(map);

        currentPolylines.push(polyline);

        // Fit map to show the entire route
        const bounds = L.latLngBounds([...route.map(emp => emp.location), facility]);
        map.fitBounds(bounds, { padding: [50, 50] });

        return {
            route: route,
            duration: duration
        };

    } catch (error) {
        console.error("Error creating route:", error);
        alert(`Error creating route: ${error.message}`);
    } finally {
        loadingOverlay.classList.remove('active');
    }
    return null;
}

function plotRouteAndMarkers(routeCoordinates, employees) {
    // Clear any existing routes and markers
    clearPreviousRoutes();

    // Create and add the route polyline
    const polyline = L.polyline(routeCoordinates, {
        color: '#3498db',
        weight: 4,
        opacity: 0.8,
        lineCap: 'round',
        lineJoin: 'round',
        smoothFactor: 1
    }).addTo(map);

    currentPolylines.push(polyline);

    // Fit map bounds to show the entire route
    map.fitBounds(polyline.getBounds(), { padding: [50, 50] });

    // Create facility icon if not already defined
    const facilityIcon = L.divIcon({
        className: 'facility-icon',
        iconSize: [32, 32]
    });

    // Create employee icon if not already defined
    const employeeIcon = L.divIcon({
        className: 'employee-icon',
        iconSize: [24, 24]
    });

    // Add facility marker
    const facilityMarker = L.marker(facility, {
        icon: facilityIcon
    })
        .addTo(map)
        .bindPopup("<b>Facility</b><br>Final Destination");

    currentMarkers.push(facilityMarker);

    // Add employee markers with pickup order
    employees.forEach((employee, index) => {
        const empMarker = L.marker(employee.location, {
            icon: employeeIcon
        })
            .addTo(map)
            .bindPopup(`
                  <b>Employee:</b> ${employee.empCode}<br>
                  <b>Pickup Order:</b> ${index + 1}<br>
                  <b>Zone:</b> ${employee.zoneName}
              `);

        currentMarkers.push(empMarker);
    });
}

function clearPreviousRoutes() {
    // Remove existing polylines
    currentPolylines.forEach(polyline => {
        if (polyline && map.hasLayer(polyline)) {
            map.removeLayer(polyline);
        }
    });
    currentPolylines = [];

    // Remove existing markers
    currentMarkers.forEach(marker => {
        if (marker && map.hasLayer(marker)) {
            map.removeLayer(marker);
        }
    });
    currentMarkers = [];
}

function showZoneName(zoneName) {
    const selectedZoneElement = document.getElementById("selectedZone");
    if (selectedZoneElement) {
        selectedZoneElement.textContent = zoneName;
    }
}

function decodePolyline(str, precision = 5) {
    var index = 0,
        lat = 0,
        lng = 0,
        coordinates = [],
        shift = 0,
        result = 0,
        byte = null,
        latitude_change,
        longitude_change,
        factor = Math.pow(10, precision);

    // Coordinates have variable length when encoded, so just keep
    // track of whether we've hit the end of the string. In each
    // loop iteration, a single coordinate is decoded.
    while (index < str.length) {
        // Reset shift, result, and byte
        byte = null;
        shift = 0;
        result = 0;

        do {
            byte = str.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);

        latitude_change = ((result & 1) ? ~(result >> 1) : (result >> 1));

        shift = result = 0;

        do {
            byte = str.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);

        longitude_change = ((result & 1) ? ~(result >> 1) : (result >> 1));

        lat += latitude_change;
        lng += longitude_change;

        coordinates.push([lat / factor, lng / factor]);
    }

    return coordinates;
}

const facilityIcon = L.icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/854/854866.png', // Facility icon
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
});

const employeeIcon = L.icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/149/149060.png', // Employee icon
    iconSize: [32, 32], // Moderate size
    iconAnchor: [16, 32], // Center-bottom anchor
    popupAnchor: [0, -32] // Popup above the icon
});

// Load zones from GeoJSON file
fetch('delhi_ncr_zones.json')
    .then(response => response.json())
    .then(geoJsonData => {
        console.log("Loading zones:", geoJsonData.features.length);
        geoJsonData.features.forEach(feature => {
            if (feature.geometry.type === "Polygon") {
                const zoneCoordinates = feature.geometry.coordinates[0].map(coord => [coord[1], coord[0]]);
                const polygonLayer = L.polygon(zoneCoordinates, {
                    color: 'white',
                    weight: 2,
                    dashArray: '4 4',
                    fillColor: feature.properties.fill || getRandomColor(),
                    fillOpacity: 0.3
                }).addTo(map);

                polygonLayer.zoneName = feature.properties.Name;
                zones[feature.properties.Name] = {
                    polygon: polygonLayer,
                    bounds: polygonLayer.getBounds()
                };

                polygonLayer.on('click', () => {
                    selectedZone = feature.properties.Name;
                    showZoneName(feature.properties.Name);
                });
            }
        });
        console.log("Zones loaded:", Object.keys(zones).length);
        loadCSVData("NCR_emp_data.csv");
    })
    .catch(error => console.error("Error loading zones:", error));

function handleZoneClubbing(e) {
    const isChecked = e.target.checked;
    const loadingOverlay = document.querySelector('.loading-overlay');
    loadingOverlay.classList.add('active');

    showZonePairingModal(isChecked);
}

function showZonePairingModal(isClubbing) {
    console.log("Opening zone pairing modal");
    const modal = document.getElementById('zonePairingModal');
    const availableZonesDiv = document.getElementById('availableZones');
    const zonePairsDiv = document.getElementById('zonePairs');
    const loadingOverlay = document.querySelector('.loading-overlay');
    const zonePairsSection = document.querySelector('.zone-pairs');
    const modalTitle = modal.querySelector('h2');
    const autoClubBtn = document.getElementById('autoClubbing');

    // Update modal title and visibility based on mode
    modalTitle.textContent = isClubbing ? 'Select Zones to Club Together' : 'Select Zones for 12-Seater Cabs';
    zonePairsSection.style.display = isClubbing ? 'flex' : 'none';
    autoClubBtn.style.display = isClubbing ? 'block' : 'none';

    // Create zone items
    const zoneItems = Object.keys(zones).map(zone => {
        const div = document.createElement('div');
        div.className = 'zone-item';
        if (highCapacityZones.has(zone)) {
            div.classList.add('high-capacity');
        }
        div.textContent = zone;

        // Add click handler for all modes
        div.addEventListener('click', () => {
            div.classList.toggle('high-capacity');
            if (div.classList.contains('high-capacity')) {
                highCapacityZones.add(zone);
            } else {
                highCapacityZones.delete(zone);
            }
        });

        return div;
    });

    // Clear and append zone items
    availableZonesDiv.innerHTML = '';
    zoneItems.forEach(item => availableZonesDiv.appendChild(item));

    if (isClubbing) {
        zonePairsDiv.innerHTML = '';
        addNewPair();
    }

    // Remove loading overlay and show modal
    loadingOverlay.classList.remove('active');
    modal.style.display = 'block';
}

function addNewPair() {
    const zonePairsDiv = document.getElementById('zonePairs');
    const pairDiv = document.createElement('div');
    pairDiv.className = 'zone-pair';

    const zoneOptions = Object.keys(zones)
        .map(zone => `<option value="${zone}">${zone}</option>`)
        .join('');

    pairDiv.innerHTML = `
              <select class="zone-select zone1">
                  <option value="">Select Zone</option>
                  ${zoneOptions}
              </select>
              <select class="zone-select zone2">
                  <option value="">Select Zone</option>
                  ${zoneOptions}
              </select>
              <button class="remove-pair">×</button>
          `;

    zonePairsDiv.appendChild(pairDiv);
}

function initializeModalHandlers() {
    const modal = document.getElementById('zonePairingModal');
    const addPairBtn = document.getElementById('addPairBtn');
    const saveBtn = document.getElementById('saveZonePairs');
    const cancelBtn = document.getElementById('cancelZonePairs');
    const loadingOverlay = document.querySelector('.loading-overlay');

    addPairBtn.onclick = addNewPair;

    saveBtn.onclick = async () => {
        zonePairingMatrix = {};
        const isClubbing = document.getElementById('routingToggle').checked;

        if (isClubbing) {
            const pairs = document.querySelectorAll('.zone-pair');
            pairs.forEach(pair => {
                const zone1 = pair.querySelector('.zone1').value;
                const zone2 = pair.querySelector('.zone2').value;

                if (zone1 && zone2 && zone1 !== zone2) {
                    // Always allow clubbing for zone pairs, regardless of capacity
                    if (!zonePairingMatrix[zone1]) zonePairingMatrix[zone1] = [];
                    if (!zonePairingMatrix[zone2]) zonePairingMatrix[zone2] = [];

                    zonePairingMatrix[zone1].push(zone2);
                    zonePairingMatrix[zone2].push(zone1);
                }
            });
        }

        // Save high capacity zones
        localStorage.setItem('highCapacityZones', JSON.stringify([...highCapacityZones]));

        modal.style.display = 'none';
        await loadEmployeeData(window.employeeData, isClubbing);
    };

    cancelBtn.onclick = async () => {
        modal.style.display = 'none';
        document.getElementById('routingToggle').checked = false;

        // Show loading and process data
        loadingOverlay.classList.add('active');
        await loadEmployeeData(window.employeeData, false);
    };

    // Remove pair button handler
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-pair')) {
            e.target.parentElement.remove();
        }
    });

    const autoClubBtn = document.getElementById('autoClubbing');
    autoClubBtn.onclick = autoClubZones;

    const modalClose = document.querySelector('.modal-close');
    if (modalClose) {
        modalClose.onclick = () => {
            const modal = document.getElementById('zonePairingModal');
            modal.style.display = 'none';
            document.getElementById('routingToggle').checked = false;
        };
    }
}

// Initialize modal handlers when the page loads
document.addEventListener('DOMContentLoaded', () => {
    initializeModalHandlers();

    // Add click outside modal to close
    const modal = document.getElementById('zonePairingModal');
    window.onclick = function (event) {
        if (event.target === modal) {
            modal.style.display = 'none';
            document.getElementById('routingToggle').checked = false;
        }
    };
});

// Add this function to handle auto clubbing
async function autoClubZones() {
    const loadingOverlay = document.querySelector('.loading-overlay');
    loadingOverlay.classList.add('active');

    try {
        // Get all zones and their employees
        const zoneEmployees = {};
        for (const zoneName in zones) {
            const employees = window.employeeData.filter(emp => {
                const lat = parseFloat(emp.geoY);
                const lon = parseFloat(emp.geoX);
                return isPointInPolygon([lat, lon], zones[zoneName].polygon.getLatLngs()[0]);
            }).map(emp => ({
                empCode: emp.empCode,
                location: [parseFloat(emp.geoY), parseFloat(emp.geoX)],
                zoneName: zoneName
            }));
            if (employees.length > 0) {
                zoneEmployees[zoneName] = employees;
            }
        }

        // Calculate zone centroids and their direction to facility
        const zoneMetrics = {};
        for (const zoneName in zoneEmployees) {
            const centroid = calculateZoneCentroid(zoneEmployees[zoneName]);
            const directionToFacility = calculateDirectionVector(centroid, facility);
            const distanceToFacility = calculateDistance(centroid, facility);

            zoneMetrics[zoneName] = {
                centroid,
                directionToFacility,
                distanceToFacility,
                employeeCount: zoneEmployees[zoneName].length
            };
        }

        // Find potential zone pairs based on direction and proximity
        zonePairingMatrix = {};
        const processedZones = new Set();

        for (const zoneName in zoneMetrics) {
            if (processedZones.has(zoneName)) continue;

            const currentZone = zoneMetrics[zoneName];
            const potentialPairs = [];

            // Find compatible zones
            for (const otherZoneName in zoneMetrics) {
                if (zoneName === otherZoneName || processedZones.has(otherZoneName)) continue;

                const otherZone = zoneMetrics[otherZoneName];

                // Calculate compatibility score based on:
                // 1. Similar direction to facility
                // 2. Proximity to each other
                // 3. Combined employee count (aim for optimal vehicle capacity)
                const directionSimilarity = calculateDirectionSimilarity(
                    currentZone.directionToFacility,
                    otherZone.directionToFacility
                );

                const zonesToZoneDistance = calculateDistance(
                    currentZone.centroid,
                    otherZone.centroid
                );

                const combinedEmployees = currentZone.employeeCount + otherZone.employeeCount;
                const capacityScore = Math.min(1, 6 / combinedEmployees); // Optimal capacity is 6

                const compatibilityScore = (
                    directionSimilarity * 0.4 +  // 40% weight to direction
                    (1 - zonesToZoneDistance / currentZone.distanceToFacility) * 0.3 + // 30% weight to proximity
                    capacityScore * 0.3  // 30% weight to capacity optimization
                );

                if (compatibilityScore > 0.6) { // Threshold for compatibility
                    potentialPairs.push({
                        zoneName: otherZoneName,
                        score: compatibilityScore
                    });
                }
            }

            // Select the best pair if any
            if (potentialPairs.length > 0) {
                potentialPairs.sort((a, b) => b.score - a.score);
                const bestPair = potentialPairs[0].zoneName;

                if (!zonePairingMatrix[zoneName]) zonePairingMatrix[zoneName] = [];
                if (!zonePairingMatrix[bestPair]) zonePairingMatrix[bestPair] = [];

                zonePairingMatrix[zoneName].push(bestPair);
                zonePairingMatrix[bestPair].push(zoneName);

                processedZones.add(zoneName);
                processedZones.add(bestPair);
            }
        }

        // Close modal and process routes
        const modal = document.getElementById('zonePairingModal');
        modal.style.display = 'none';
        document.getElementById('routingToggle').checked = true;

        await loadEmployeeData(window.employeeData, true);

    } catch (error) {
        console.error("Error in auto clubbing:", error);
    } finally {
        loadingOverlay.classList.remove('active');
    }
}

// Helper functions for auto clubbing
function calculateDirectionVector(point1, point2) {
    return [
        point2[0] - point1[0],
        point2[1] - point1[1]
    ];
}

function calculateDistance(point1, point2) {
    return Math.sqrt(
        Math.pow(point2[0] - point1[0], 2) +
        Math.pow(point2[1] - point1[1], 2)
    );
}

function calculateDirectionSimilarity(dir1, dir2) {
    const mag1 = Math.sqrt(dir1[0] * dir1[0] + dir1[1] * dir1[1]);
    const mag2 = Math.sqrt(dir2[0] * dir2[0] + dir2[1] * dir2[1]);
    const dotProduct = dir1[0] * dir2[0] + dir1[1] * dir2[1];

    if (mag1 === 0 || mag2 === 0) return 0;
    return (dotProduct / (mag1 * mag2) + 1) / 2; // Normalized to 0-1
}

function createZoneItem(zoneName) {
    const item = document.createElement('div');
    item.className = 'zone-item';
    item.textContent = zoneName;

    // Add click handler for capacity toggle
    item.addEventListener('click', (e) => {
        if (document.querySelector('.zone-capacity-checkbox').checked) {
            item.classList.toggle('high-capacity');
            if (item.classList.contains('high-capacity')) {
                highCapacityZones.add(zoneName);
            } else {
                highCapacityZones.delete(zoneName);
            }
        }
    });

    // If zone is already high capacity, add the class
    if (highCapacityZones.has(zoneName)) {
        item.classList.add('high-capacity');
    }

    return item;
}

// Load saved high capacity zones on initialization
document.addEventListener('DOMContentLoaded', () => {
    const savedHighCapacityZones = JSON.parse(localStorage.getItem('highCapacityZones') || '[]');
    highCapacityZones = new Set(savedHighCapacityZones);
});

// Helper function to split employees into routes based on capacity and optimize path
async function splitIntoRoutes(employees, maxCapacity) {
    const routes = [];
    let remainingEmployees = [...employees];

    while (remainingEmployees.length > 0) {
        let currentRoute = [];
        let currentEmployees = [...remainingEmployees];

        // Start with the farthest employee from facility
        currentEmployees.sort((a, b) =>
            calculateDistance(b.location, facility) - calculateDistance(a.location, facility)
        );

        let currentEmployee = currentEmployees[0];
        currentRoute.push(currentEmployee);
        remainingEmployees = remainingEmployees.filter(emp => emp !== currentEmployee);
        currentEmployees = currentEmployees.filter(emp => emp !== currentEmployee);

        while (currentRoute.length < maxCapacity && currentEmployees.length > 0) {
            const lastPickup = currentRoute[currentRoute.length - 1].location;
            const directionToFacility = calculateDirectionVector(lastPickup, facility);

            const scoredEmployees = currentEmployees.map(emp => {
                const distance = calculateDistance(lastPickup, emp.location);
                const direction = calculateDirectionVector(lastPickup, emp.location);
                const directionScore = calculateDirectionSimilarity(direction, directionToFacility);
                const score = distance * (2 - directionScore);
                return { emp, score };
            });

            scoredEmployees.sort((a, b) => a.score - b.score);
            const nextEmployee = scoredEmployees[0].emp;

            // Check if adding this employee would exceed duration limit
            const testRoute = [...currentRoute, nextEmployee];
            const duration = await checkRouteDuration(testRoute);

            if (duration && duration <= 2.5 * 3600) { // 2.5 hours in seconds
                currentRoute.push(nextEmployee);
                remainingEmployees = remainingEmployees.filter(emp => emp !== nextEmployee);
                currentEmployees = currentEmployees.filter(emp => emp !== nextEmployee);
            } else {
                break; // Stop adding employees to this route
            }
        }

        if (currentRoute.length > 0) {
            const duration = await checkRouteDuration(currentRoute);
            routes.push({
                employees: currentRoute,
                zoneName: currentRoute[0].zoneName,
                duration: duration
            });
        }
    }

    return routes;
}

// Update checkRouteDuration function
async function checkRouteDuration(route) {
    const waypoints = [
        ...route.map(emp => emp.location),
        facility
    ];

    const waypointsString = waypoints
        .map(point => `${point[1]},${point[0]}`)
        .join(';');

    const url = `http://localhost:5000/route/v1/driving/${waypointsString}?overview=false`;
    //  const url = `http://13.203.3.173:5000/route/v1/driving/${waypointsString}?overview=false`;


    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();

        // Base duration from OSRM
        let baseDuration = data.routes[0].duration;

        // Add traffic buffer (40% of base duration)
        const trafficBuffer = baseDuration * 0.5;

        // Add pickup time for each employee (3 minutes = 180 seconds per employee)
        const pickupTime = route.length * 180;

        // Calculate total duration
        const totalDuration = baseDuration + trafficBuffer + pickupTime;

        return totalDuration;
    } catch (error) {
        console.error("Error checking route duration:", error);
        return null;
    }
}

// Add this function after the global variables
function findZoneForEmployee(location) {
    const [lat, lon] = location;

    for (const zoneName in zones) {
        const zonePolygon = zones[zoneName].polygon;
        if (isPointInPolygon([lat, lon], zonePolygon.getLatLngs()[0])) {
            return zoneName;
        }
    }
    return null;
}
