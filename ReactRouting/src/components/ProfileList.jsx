import React, { useState, useEffect } from 'react';
import { profileService } from '../services/api';
import { employeeService } from '../services/employeeService';
import './ProfileList.css';

const ProfileList = ({ onProfileSelect }) => {
  const [profiles, setProfiles] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newProfile, setNewProfile] = useState({
    name: '',
    zoneClubbing: false,
    highCapacityZones: [],
    zonePairingMatrix: {},
    isAutoClubbing: false
  });

  useEffect(() => {
    loadProfiles();
  }, []);

  const loadEmployeeData = async (shift) => {
    try {
      setLoading(true);
      const data = await employeeService.getEmployeeData(shift);
      setEmployees(data);
      setError(null);
    } catch (err) {
      setError('Failed to load employee data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadProfiles = async () => {
    try {
      setLoading(true);
      const data = await profileService.getAll();
      setProfiles(data);
      setError(null);
    } catch (err) {
      setError('Failed to load profiles');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProfile = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      await profileService.create(newProfile);
      setShowCreateForm(false);
      setNewProfile({
        name: '',
        zoneClubbing: false,
        highCapacityZones: [],
        zonePairingMatrix: {},
        isAutoClubbing: false
      });
      await loadProfiles();
    } catch (err) {
      setError('Failed to create profile');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProfile = async (id) => {
    if (!window.confirm('Are you sure you want to delete this profile? This will also delete all associated routes.')) return;
    try {
      setLoading(true);
      await profileService.delete(id);
      await loadProfiles();
    } catch (err) {
      setError('Failed to delete profile');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
  
  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 p-6">
  {profiles.map(profile => (
    <div
      key={profile.id}
      className="bg-gray-800 text-white border border-gray-700 rounded-2xl shadow-xl transition-all duration-300 ease-in-out hover:shadow-2xl hover:scale-[1.02] hover:border-blue-500 hover:bg-gray-850"
    >
      <div className="p-6">
        <h3 className="text-2xl font-bold mb-4 tracking-wide">{profile.name}</h3>
        
        <div className="text-gray-300 mb-5 text-sm">
          <p>
            Zone Clubbing:{" "}
            <span className={profile.zoneClubbing ? "text-green-400 font-medium" : "text-red-400 font-medium"}>
              {profile.zoneClubbing ? "Enabled" : "Disabled"}
            </span>
          </p>
          {/* <p>Auto Clubbing: {profile.isAutoClubbing ? 'Enabled' : 'Disabled'}</p> */}
        </div>

        <div className="flex flex-wrap gap-3">
          {onProfileSelect && (
            <button
              onClick={() => onProfileSelect(profile)}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-4 focus:outline-none focus:ring-blue-300 shadow"
            >
              Select
            </button>
          )}
          <button
            onClick={() => handleDeleteProfile(profile.id)}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 focus:ring-4 focus:outline-none focus:ring-red-300 shadow"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  ))}
</div>
        
  );
};

export default ProfileList;