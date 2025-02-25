import React, { useState } from 'react';
import { isPointInPolygon } from '../utils/routeUtils';
import './ZonePairingModal.css';

const facility = [28.402910, 76.998015];

function ZonePairingModal({ 
  zones, 
  isClubbing, 
  highCapacityZones,
  employeeData,
  onClose, 
  onSave 
}) {
  const [selectedZones, setSelectedZones] = useState(new Set(highCapacityZones));
  const [zonePairs, setZonePairs] = useState([]);

  const handleZoneClick = (zoneName) => {
    const newSelectedZones = new Set(selectedZones);
    if (newSelectedZones.has(zoneName)) {
      newSelectedZones.delete(zoneName);
    } else {
      newSelectedZones.add(zoneName);
    }
    setSelectedZones(newSelectedZones);
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
  };

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

  const autoClubZones = async () => {
    try {
      // Clear existing pairs
      setZonePairs([]);
      
      // Get all zones and their centers
      const zoneData = Object.keys(zones).map(zoneName => {
        const center = calculateZoneCenter(zoneName);
        return {
          zoneName,
          center,
          distanceToFacility: calculateDistance(center, facility)
        };
      });

      // Sort zones by distance from facility
      zoneData.sort((a, b) => b.distanceToFacility - a.distanceToFacility);

      const newPairs = [];
      const processedZones = new Set();
      const matrix = {};

      // Find optimal pairs based on proximity and direction
      for (let i = 0; i < zoneData.length; i++) {
        const zone1 = zoneData[i];
        if (processedZones.has(zone1.zoneName)) continue;

        let bestMatch = null;
        let bestScore = -1;

        // Find best match for this zone
        for (let j = 0; j < zoneData.length; j++) {
          const zone2 = zoneData[j];
          if (zone2.zoneName === zone1.zoneName || processedZones.has(zone2.zoneName)) continue;

          // Calculate score based on proximity and direction towards facility
          const distance = calculateDistance(zone1.center, zone2.center);
          const directionScore = calculateDirectionScore(zone1.center, zone2.center, facility);
          
          // Score formula: prioritize closer zones that are in the direction of facility
          const score = (1 / (distance + 0.001)) * directionScore;

          if (score > bestScore) {
            bestScore = score;
            bestMatch = zone2;
          }
        }

        if (bestMatch && bestScore > 0) {
          // Create the pair
          newPairs.push({
            zone1: zone1.zoneName,
            zone2: bestMatch.zoneName
          });

          // Add to matrix
          if (!matrix[zone1.zoneName]) matrix[zone1.zoneName] = [];
          if (!matrix[bestMatch.zoneName]) matrix[bestMatch.zoneName] = [];
          
          matrix[zone1.zoneName].push(bestMatch.zoneName);
          matrix[bestMatch.zoneName].push(zone1.zoneName);

          // Mark as processed
          processedZones.add(zone1.zoneName);
          processedZones.add(bestMatch.zoneName);
        }
      }

      console.log("Auto-clubbed pairs:", newPairs);
      console.log("Zone pairing matrix:", matrix);
      
      // Update state with new pairs
      setZonePairs(newPairs);
      
      // Save and apply changes - use existing selectedZones
      await onSave(matrix, selectedZones);
      
    } catch (error) {
      console.error("Error in auto clubbing:", error);
      alert("Error while auto-clubbing zones. Please try again.");
    }
  };

  const handleSave = () => {
    const matrix = {};
    if (isClubbing && zonePairs.length > 0) {
      zonePairs.forEach(pair => {
        if (pair.zone1 && pair.zone2) {
          // Initialize arrays if they don't exist
          if (!matrix[pair.zone1]) matrix[pair.zone1] = [];
          if (!matrix[pair.zone2]) matrix[pair.zone2] = [];
          
          // Add bidirectional pairing
          if (!matrix[pair.zone1].includes(pair.zone2)) {
            matrix[pair.zone1].push(pair.zone2);
          }
          if (!matrix[pair.zone2].includes(pair.zone1)) {
            matrix[pair.zone2].push(pair.zone1);
          }
        }
      });
    }
    
    console.log('Zone pairing matrix:', matrix);
    console.log('Selected high capacity zones:', Array.from(selectedZones));
    onSave(matrix, selectedZones);
  };

  return (
    <div className="modal">
      <div className="modal-content">
        <button className="modal-close" onClick={onClose}>×</button>
        <h2>
          {isClubbing 
            ? 'Select Zones to Club Together and Assign 12-Seater Cabs' 
            : 'Select Zones for 12-Seater Cabs'}
        </h2>
        
        <div className="zone-selection">
          <div className="zone-list">
            <h3>Available Zones</h3>
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

          {isClubbing && (
            <div className="zone-pairs">
              <h3>Zone Pairs for Clubbing</h3>
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

        <div className="modal-buttons">
          <div className="manual-buttons">
            <button className="save-btn" onClick={handleSave}>
              Save & Apply
            </button>
            <button className="cancel-btn" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ZonePairingModal; 