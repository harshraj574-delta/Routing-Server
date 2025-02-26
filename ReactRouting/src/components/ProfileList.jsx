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
    loadEmployeeData();
  }, []);

  const loadEmployeeData = async () => {
    try {
      setLoading(true);
      const data = await employeeService.getEmployeeData();
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
    <div className="profile-list">
      <h2>Routing Profiles</h2>
      <div className="profiles-grid">
        {profiles.map(profile => (
          <div key={profile.id} className="profile-card">
            <h3>{profile.name}</h3>
            <div className="profile-details">
              <p>Zone Clubbing: {profile.zoneClubbing ? 'Enabled' : 'Disabled'}</p>
              <p>Auto Clubbing: {profile.isAutoClubbing ? 'Enabled' : 'Disabled'}</p>
            </div>
            <div className="profile-actions">
              {onProfileSelect && (
                <button onClick={() => onProfileSelect(profile)}>Select</button>
              )}
              <button onClick={() => handleDeleteProfile(profile.id)} className="delete-btn">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProfileList;