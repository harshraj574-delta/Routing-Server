import React, { useState } from "react";
import "./ProfileModal.css";
import { X, Plus, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";

const facility = [28.40291, 76.998015];

const ProfileModal = ({ onClose, onSave, zones }) => {
  const [formData, setFormData] = useState({
    name: "",
    zoneClubbing: false,
    highCapacityZones: [],
    zonePairingMatrix: {},
    shiftTime: "8am-8pm", // Default shift time
  });
  const [selectedZones, setSelectedZones] = useState(new Set());
  const [zonePairs, setZonePairs] = useState([]);
  const [expandedSections, setExpandedSections] = useState({
    zones: true,
    zonePairs: true
  });

  // Existing calculation functions
  const calculateDistance = (point1, point2) => {
    return Math.sqrt(
      Math.pow(point2[0] - point1[0], 2) + Math.pow(point2[1] - point1[1], 2)
    );
  };

  const calculateZoneCenter = (zoneName) => {
    const polygon = zones[zoneName].polygon;
    let sumLat = 0,
      sumLon = 0;
    const points = polygon.length;

    polygon.forEach((coord) => {
      sumLat += coord[1]; // Latitude
      sumLon += coord[0]; // Longitude
    });

    return [sumLat / points, sumLon / points];
  };

  const calculateDirectionScore = (point1, point2, target) => {
    const vectorToTarget = [target[0] - point1[0], target[1] - point1[1]];
    const vectorToPoint2 = [point2[0] - point1[0], point2[1] - point1[1]];

    const dotProduct =
      vectorToTarget[0] * vectorToPoint2[0] +
      vectorToTarget[1] * vectorToPoint2[1];
    const magnitudeProduct = Math.sqrt(
      (vectorToTarget[0] ** 2 + vectorToTarget[1] ** 2) *
        (vectorToPoint2[0] ** 2 + vectorToPoint2[1] ** 2)
    );

    if (magnitudeProduct === 0) return 0;
    return (dotProduct / magnitudeProduct + 1) / 2;
  };

  const shiftOptions = ["8am-8pm", "8pm-8am"];

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
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
    setFormData((prev) => ({
      ...prev,
      highCapacityZones: Array.from(newSelectedZones),
    }));
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const addNewPair = () => {
    setZonePairs([...zonePairs, { zone1: "", zone2: "" }]);
  };

  const removePair = (index) => {
    setZonePairs(zonePairs.filter((_, i) => i !== index));
  };

  const updatePair = (index, field, value) => {
    const newPairs = [...zonePairs];
    newPairs[index][field] = value;
    setZonePairs(newPairs);
  };

  // Existing methods for handling zone pairing
  const updateZonePairingMatrix = (pairs) => {
    const matrix = {};
    if (formData.zoneClubbing && pairs.length > 0) {
      pairs.forEach((pair) => {
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
    // Store the matrix in state but don't update formData until save
  };

  const calculateDirectionVector = (point1, point2) => {
    return [point2[0] - point1[0], point2[1] - point1[1]];
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
      const zoneData = Object.keys(zones).map((zoneName) => {
        const center = calculateZoneCenter(zoneName);
        return {
          zoneName,
          center,
          distanceToFacility: calculateDistance(center, facility),
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
        remainingZones = remainingZones.filter((z) => z !== currentZone);
        currentZones = currentZones.filter((z) => z !== currentZone);

        while (currentRoute.length < maxCapacity && currentZones.length > 0) {
          const lastZone = currentRoute[currentRoute.length - 1];
          const directionToFacility = calculateDirectionVector(
            lastZone.center,
            facility
          );

          // Score remaining zones based on proximity and direction
          const scoredZones = currentZones.map((zone) => {
            const distance = calculateDistance(lastZone.center, zone.center);
            const direction = calculateDirectionVector(
              lastZone.center,
              zone.center
            );
            const directionScore = calculateDirectionSimilarity(
              direction,
              directionToFacility
            );

            // Calculate route duration for the potential combination
            const routeDuration = estimateRouteDuration(
              lastZone.center,
              zone.center
            );
            const durationScore =
              routeDuration <= maxRouteDuration
                ? 1 - routeDuration / maxRouteDuration
                : -1;

            // Comprehensive scoring
            const proximityScore = 1 / (distance + 0.001);
            const score =
              directionScore * 0.4 + // 40% weight to direction alignment
              proximityScore * 0.3 + // 30% weight to proximity
              durationScore * 0.3; // 30% weight to duration feasibility

            return { zone, score };
          });

          // Sort zones by score (best matches first)
          scoredZones.sort((a, b) => b.score - a.score);

          // Select the best matching zone if it meets duration criteria
          const bestMatch = scoredZones[0];
          if (bestMatch && bestMatch.score > 0) {
            const routeDuration = estimateRouteDuration(
              lastZone.center,
              bestMatch.zone.center
            );
            if (routeDuration <= maxRouteDuration) {
              currentRoute.push(bestMatch.zone);
              remainingZones = remainingZones.filter(
                (z) => z !== bestMatch.zone
              );
              currentZones = currentZones.filter((z) => z !== bestMatch.zone);
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
              zone2: currentRoute[i + 1].zoneName,
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
    const matrix = {};
    if (formData.zoneClubbing && zonePairs.length > 0) {
      zonePairs.forEach((pair) => {
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

    onSave({
      ...formData,
      zonePairingMatrix: matrix,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-3xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 bg-gray-800 rounded-t-2xl">
          <div className="flex items-baseline space-x-3">
            <span className="text-3xl md:text-4xl font-extrabold text-white">
              Create New
            </span>
            <span className="bg-blue-100 text-blue-800 text-sm md:text-lg font-semibold px-2.5 py-0.5 rounded-sm dark:bg-blue-200 dark:text-blue-900">
              Profile
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-300 hover:text-white transition duration-200 focus:outline-none ml-4"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="overflow-y-auto p-6 flex-grow">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Basic Profile Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="name"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Profile Name
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>

              <div>
                <label
                  htmlFor="shiftTime"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Shift Time
                </label>
                <select
                  id="shiftTime"
                  name="shiftTime"
                  value={formData.shiftTime}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                >
                  {shiftOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Zone Clubbing Toggle */}
            <div className="flex items-center justify-between border p-3 rounded-md bg-gray-50 dark:bg-gray-700/50">
              <label
                htmlFor="zoneClubbing"
                className="flex items-center cursor-pointer"
              >
                {/* Toggle Switch */}
                <div className="relative">
                  <input
                    type="checkbox"
                    id="zoneClubbing"
                    name="zoneClubbing"
                    checked={formData.zoneClubbing}
                    onChange={handleInputChange}
                    className="sr-only"
                  />
                  <div
                    className={`block w-14 h-8 rounded-full transition-colors duration-300 ${
                      formData.zoneClubbing
                        ? "bg-blue-600"
                        : "bg-gray-300 dark:bg-gray-600"
                    }`}
                  ></div>
                  <div
                    className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform duration-300 ${
                      formData.zoneClubbing ? "translate-x-6" : ""
                    }`}
                  ></div>
                </div>
                {/* Label Text */}
                <span className="ml-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Enable Zone Clubbing
                </span>
              </label>
              {formData.zoneClubbing && (
                <button
                  type="button"
                  className="flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
                  onClick={(e) => {
                    e.preventDefault();
                    autoClubZones();
                  }}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Auto Club Zones
                </button>
              )}
            </div>

            {zones && (
              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                    Zone Configuration
                  </h3>
                </div>

                {/* Zone Selection Section - Collapsible */}
                <div className="mb-4 border rounded-md dark:border-gray-700">
                  <button 
                    type="button"
                    className="w-full flex justify-between items-center p-3 text-left bg-gray-50 dark:bg-gray-700 rounded-t-md"
                    onClick={() => toggleSection('zones')}
                  >
                    <h4 className="text-md font-medium text-gray-800 dark:text-gray-200">
                      Available Zones
                    </h4>
                    {expandedSections.zones ? 
                      <ChevronUp className="w-5 h-5 text-gray-500" /> : 
                      <ChevronDown className="w-5 h-5 text-gray-500" />
                    }
                  </button>
                  
                  {expandedSections.zones && (
                    <div className="p-3">
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                        Click on zones to toggle 12-seater cab assignment
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {Object.keys(zones).map((zoneName) => (
                          <div
                            key={zoneName}
                            className={`px-3 py-2 rounded-md text-center cursor-pointer transition-colors text-sm font-medium ${
                              selectedZones.has(zoneName)
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-2 border-blue-500"
                                : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600"
                            }`}
                            onClick={() => handleZoneClick(zoneName)}
                          >
                            {zoneName}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Zone Pairing Section - Collapsible, only shown when zone clubbing is enabled */}
                {formData.zoneClubbing && (
                  <div className="border rounded-md dark:border-gray-700">
                    <button 
                      type="button"
                      className="w-full flex justify-between items-center p-3 text-left bg-gray-50 dark:bg-gray-700 rounded-t-md"
                      onClick={() => toggleSection('zonePairs')}
                    >
                      <h4 className="text-md font-medium text-gray-800 dark:text-gray-200">
                        Zone Pairs for Clubbing
                      </h4>
                      {expandedSections.zonePairs ? 
                        <ChevronUp className="w-5 h-5 text-gray-500" /> : 
                        <ChevronDown className="w-5 h-5 text-gray-500" />
                      }
                    </button>
                    
                    {expandedSections.zonePairs && (
                      <div className="p-3">
                        <div className="space-y-3">
                          {zonePairs.map((pair, index) => (
                            <div
                              key={index}
                              className="flex items-center space-x-2"
                            >
                              <select
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                                value={pair.zone1}
                                onChange={(e) =>
                                  updatePair(index, "zone1", e.target.value)
                                }
                              >
                                <option value="">Select Zone</option>
                                {Object.keys(zones).map((zone) => (
                                  <option key={zone} value={zone}>
                                    {zone}
                                  </option>
                                ))}
                              </select>
                              <select
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                                value={pair.zone2}
                                onChange={(e) =>
                                  updatePair(index, "zone2", e.target.value)
                                }
                              >
                                <option value="">Select Zone</option>
                                {Object.keys(zones).map((zone) => (
                                  <option key={zone} value={zone}>
                                    {zone}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                className="p-2 text-gray-500 hover:text-red-500 focus:outline-none"
                                onClick={() => removePair(index)}
                              >
                                <X className="w-5 h-5" />
                              </button>
                            </div>
                          ))}
                        </div>

                        <button
                          type="button"
                          className="flex items-center justify-center w-full px-4 py-2 mt-3 text-sm font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors dark:bg-gray-700 dark:text-blue-400 dark:hover:bg-gray-600"
                          onClick={(e) => {
                            e.preventDefault();
                            addNewPair();
                          }}
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Add New Pair
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </form>
        </div>

        <div className="flex justify-end space-x-3 p-6 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 sticky bottom-0">
          <button
            type="button"
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-600"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            Save Profile
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfileModal;