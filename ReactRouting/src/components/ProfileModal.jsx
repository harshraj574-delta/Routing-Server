import React, { useState } from 'react';
import './ProfileModal.css';

const facility = [28.402910, 76.998015];

const ProfileModal = ({ onClose, onSave, zones }) => {
  const [formData, setFormData] = useState({
    name: '',
    zoneClubbing: false,
    highCapacityZones: [],
    zonePairingMatrix: {},
    shiftTime: '8am-8pm' // Default shift time
  });
  const [selectedZones, setSelectedZones] = useState(new Set());
  const [zonePairs, setZonePairs] = useState([]);

  const calculateDistance = (point1, point2) => {
    return Math.sqrt(
      Math.pow(point2[0] - point1[0], 2) +
      Math.pow(point2[1] - point1[1], 2)
    );
  };

  const calculateZoneCenter = (zoneName) => {
    const polygon = zones[zoneName].polygon;
    let sumLat = 0, sumLon = 0;
    const points = polygon.length;
    
    polygon.forEach(coord => {
      sumLat += coord[1];  // Latitude
      sumLon += coord[0];  // Longitude
    });

    return [sumLat / points, sumLon / points];
  };

  const calculateDirectionScore = (point1, point2, target) => {
    const vectorToTarget = [
      target[0] - point1[0],
      target[1] - point1[1]
    ];
    const vectorToPoint2 = [
      point2[0] - point1[0],
      point2[1] - point1[1]
    ];

    const dotProduct = vectorToTarget[0] * vectorToPoint2[0] + 
                      vectorToTarget[1] * vectorToPoint2[1];
    const magnitudeProduct = Math.sqrt(
      (vectorToTarget[0] ** 2 + vectorToTarget[1] ** 2) *
      (vectorToPoint2[0] ** 2 + vectorToPoint2[1] ** 2)
    );

    if (magnitudeProduct === 0) return 0;
    return (dotProduct / magnitudeProduct + 1) / 2;
  };

  const shiftOptions = [
    '8am-8pm',
    '8pm-8am'
  ];

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleZoneClick = (zoneName) => {
    const newSelectedZones = new Set(selectedZones);
    if (newSelectedZones.has(zoneName)) {
      newSelectedZones.delete(zoneName);
    } else {
      newSelectedZones.add(zoneName);
    }
    setSelectedZones(newSelectedZones);
    setFormData(prev => ({
      ...prev,
      highCapacityZones: Array.from(newSelectedZones)
    }));
  };

  const addNewPair = () => {
    setZonePairs([...zonePairs, { zone1: '', zone2: '' }]);
  };

  const removePair = (index) => {
    setZonePairs(zonePairs.filter((_, i) => i !== index));
  };

  const updatePair = (index, field, value) => {
    const newPairs = [...zonePairs];
    newPairs[index][field] = value;
    setZonePairs(newPairs);
    updateZonePairingMatrix(newPairs);
  };

  const updateZonePairingMatrix = (pairs) => {
    const matrix = {};
    if (formData.zoneClubbing && pairs.length > 0) {
      pairs.forEach(pair => {
        if (pair.zone1 && pair.zone2) {
          if (!matrix[pair.zone1]) matrix[pair.zone1] = [];
          if (!matrix[pair.zone2]) matrix[pair.zone2] = [];
          
          if (!matrix[pair.zone1].includes(pair.zone2)) {
            matrix[pair.zone1].push(pair.zone2);
          }
          if (!matrix[pair.zone2].includes(pair.zone1)) {
            matrix[pair.zone2].push(pair.zone1);
          }
        }
      });
    }
    setFormData(prev => ({
      ...prev,
      zonePairingMatrix: matrix
    }));
  };

  const calculateDirectionVector = (point1, point2) => {
    return [
      point2[0] - point1[0],
      point2[1] - point1[1]
    ];
  };

  const calculateDirectionSimilarity = (dir1, dir2) => {
    const mag1 = Math.sqrt(dir1[0] * dir1[0] + dir1[1] * dir1[1]);
    const mag2 = Math.sqrt(dir2[0] * dir2[0] + dir2[1] * dir2[1]);
    const dotProduct = dir1[0] * dir2[0] + dir1[1] * dir2[1];

    if (mag1 === 0 || mag2 === 0) return 0;
    return (dotProduct / (mag1 * mag2) + 1) / 2; // Normalized to 0-1
  };

  const estimateRouteDuration = (zone1Center, zone2Center) => {
    // Assuming average speed of 40 km/h and converting coordinates to approximate kilometers
    const distanceKm = calculateDistance(zone1Center, zone2Center) * 111; // Rough conversion to km
    const averageSpeed = 40; // km/h
    return (distanceKm / averageSpeed) * 60; // Convert to minutes
  };

  const autoClubZones = async () => {
    try {
      setZonePairs([]);
      
      const maxRouteDuration = 120; // Maximum route duration in minutes
      const maxCapacity = 2; // Maximum zones that can be clubbed together
      
      // Get all zones and their centers
      const zoneData = Object.keys(zones).map(zoneName => {
        const center = calculateZoneCenter(zoneName);
        return {
          zoneName,
          center,
          distanceToFacility: calculateDistance(center, facility)
        };
      });

      // Sort zones by distance from facility (farthest first)
      zoneData.sort((a, b) => b.distanceToFacility - a.distanceToFacility);

      const newPairs = [];
      const processedZones = new Set();
      let remainingZones = [...zoneData];

      while (remainingZones.length > 0) {
        let currentRoute = [];
        let currentZones = [...remainingZones];

        // Start with the farthest zone from facility
        let currentZone = currentZones[0];
        currentRoute.push(currentZone);
        remainingZones = remainingZones.filter(z => z !== currentZone);
        currentZones = currentZones.filter(z => z !== currentZone);

        while (currentRoute.length < maxCapacity && currentZones.length > 0) {
          const lastZone = currentRoute[currentRoute.length - 1];
          const directionToFacility = calculateDirectionVector(lastZone.center, facility);

          // Score remaining zones based on proximity and direction
          const scoredZones = currentZones.map(zone => {
            const distance = calculateDistance(lastZone.center, zone.center);
            const direction = calculateDirectionVector(lastZone.center, zone.center);
            const directionScore = calculateDirectionSimilarity(direction, directionToFacility);
            
            // Calculate route duration for the potential combination
            const routeDuration = estimateRouteDuration(lastZone.center, zone.center);
            const durationScore = routeDuration <= maxRouteDuration ? (1 - routeDuration / maxRouteDuration) : -1;

            // Comprehensive scoring
            const proximityScore = 1 / (distance + 0.001);
            const score = (
              directionScore * 0.4 + // 40% weight to direction alignment
              proximityScore * 0.3 + // 30% weight to proximity
              durationScore * 0.3    // 30% weight to duration feasibility
            );

            return { zone, score };
          });

          // Sort zones by score (best matches first)
          scoredZones.sort((a, b) => b.score - a.score);

          // Select the best matching zone if it meets duration criteria
          const bestMatch = scoredZones[0];
          if (bestMatch && bestMatch.score > 0) {
            const routeDuration = estimateRouteDuration(lastZone.center, bestMatch.zone.center);
            if (routeDuration <= maxRouteDuration) {
              currentRoute.push(bestMatch.zone);
              remainingZones = remainingZones.filter(z => z !== bestMatch.zone);
              currentZones = currentZones.filter(z => z !== bestMatch.zone);
            } else {
              break; // Stop adding zones to this route if duration limit exceeded
            }
          } else {
            break; // No suitable matches found
          }
        }

        // Create pairs from the current route
        if (currentRoute.length > 1) {
          for (let i = 0; i < currentRoute.length - 1; i++) {
            newPairs.push({
              zone1: currentRoute[i].zoneName,
              zone2: currentRoute[i + 1].zoneName
            });
          }
        }
      }

      setZonePairs(newPairs);
      updateZonePairingMatrix(newPairs);
    } catch (error) {
      console.error("Error in auto clubbing:", error);
      alert("Error while auto-clubbing zones. Please try again.");
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="profile-modal">
      <div className="profile-modal-content">
        <h2>Create New Profile</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name">Profile Name</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="shiftTime">Shift Time</label>
            <select
              id="shiftTime"
              name="shiftTime"
              value={formData.shiftTime}
              onChange={handleInputChange}
              required
            >
              {shiftOptions.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                name="zoneClubbing"
                checked={formData.zoneClubbing}
                onChange={handleInputChange}
              />
              Enable Zone Clubbing
            </label>
          </div>

          {zones && (
            <div className="zone-configuration">
              <h3>Zone Configuration</h3>
              <div className="zone-list">
                <h4>Available Zones</h4>
                <div className="zone-capacity-toggle">
                  <p>Click on zones to toggle 12-seater cab assignment</p>
                </div>
                <div className="zones-container">
                  {Object.keys(zones).map(zoneName => (
                    <div
                      key={zoneName}
                      className={`zone-item ${selectedZones.has(zoneName) ? 'high-capacity' : ''}`}
                      onClick={() => handleZoneClick(zoneName)}
                    >
                      {zoneName}
                    </div>
                  ))}
                </div>
              </div>

              {formData.zoneClubbing && (
                <div className="zone-pairs">
                  <h4>Zone Pairs for Clubbing</h4>
                  <div className="auto-club-section">
                    <button 
                      className="auto-club-btn"
                      onClick={autoClubZones}
                    >
                      Auto Club Selected Zones
                    </button>
                    <p className="auto-club-info">
                      This will automatically pair selected zones based on proximity
                    </p>
                  </div>
                  <div className="pairs-container">
                    {zonePairs.map((pair, index) => (
                      <div key={index} className="zone-pair">
                        <select
                          className="zone-select"
                          value={pair.zone1}
                          onChange={(e) => updatePair(index, 'zone1', e.target.value)}
                        >
                          <option value="">Select Zone</option>
                          {Object.keys(zones).map(zone => (
                            <option key={zone} value={zone}>{zone}</option>
                          ))}
                        </select>
                        <select
                          className="zone-select"
                          value={pair.zone2}
                          onChange={(e) => updatePair(index, 'zone2', e.target.value)}
                        >
                          <option value="">Select Zone</option>
                          {Object.keys(zones).map(zone => (
                            <option key={zone} value={zone}>{zone}</option>
                          ))}
                        </select>
                        <button 
                          className="remove-pair"
                          onClick={() => removePair(index)}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  <button className="add-pair-btn" onClick={addNewPair}>
                    Add New Pair
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="modal-actions">
            <button type="submit" className="save-btn">Save Profile</button>
            <button type="button" className="cancel-btn" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProfileModal;