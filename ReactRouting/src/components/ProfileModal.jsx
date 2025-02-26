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

  const autoClubZones = async () => {
    try {
      setZonePairs([]);
      
      const zoneData = Object.keys(zones).map(zoneName => {
        const center = calculateZoneCenter(zoneName);
        return {
          zoneName,
          center,
          distanceToFacility: calculateDistance(center, facility)
        };
      });

      zoneData.sort((a, b) => b.distanceToFacility - a.distanceToFacility);

      const newPairs = [];
      const processedZones = new Set();

      for (let i = 0; i < zoneData.length; i++) {
        const zone1 = zoneData[i];
        if (processedZones.has(zone1.zoneName)) continue;

        let bestMatch = null;
        let bestScore = -1;

        for (let j = 0; j < zoneData.length; j++) {
          const zone2 = zoneData[j];
          if (zone2.zoneName === zone1.zoneName || processedZones.has(zone2.zoneName)) continue;

          const distance = calculateDistance(zone1.center, zone2.center);
          const directionScore = calculateDirectionScore(zone1.center, zone2.center, facility);
          const score = (1 / (distance + 0.001)) * directionScore;

          if (score > bestScore) {
            bestScore = score;
            bestMatch = zone2;
          }
        }

        if (bestMatch && bestScore > 0) {
          newPairs.push({
            zone1: zone1.zoneName,
            zone2: bestMatch.zoneName
          });

          processedZones.add(zone1.zoneName);
          processedZones.add(bestMatch.zoneName);
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