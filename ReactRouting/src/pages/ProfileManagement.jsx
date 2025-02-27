import React from 'react';
import ProfileList from '../components/ProfileList';
import LoadingOverlay from '../components/LoadingOverlay';
import ProfileModal from '../components/ProfileModal';
import { profileService } from '../services/api';
import { loadZoneData } from '../utils/dataLoader';
import './ProfileManagement.css';
const { useState, useEffect } = React;

function ProfileManagement() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [zones, setZones] = useState({});

  useEffect(() => {
    const loadZones = async () => {
      try {
        setIsLoading(true);
        const zoneData = await loadZoneData();
        setZones(zoneData.features.reduce((acc, zone) => {
          acc[zone.properties.Name] = {
            polygon: zone.geometry.coordinates[0]
          };
          return acc;
        }, {}));
      } catch (err) {
        setError('Failed to load zones');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    loadZones();
  }, []);

  const handleCreateProfile = async (profileData) => {
    try {
      setIsLoading(true);
      const createdProfile = await profileService.create(profileData);
      setShowProfileModal(false);
      // Force reload profiles to get the updated list with new profile
      const profileList = document.querySelector('.profile-list');
      if (profileList) {
        profileList.dispatchEvent(new Event('reload'));
      }
    } catch (err) {
      setError('Failed to create profile');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="profile-management-page">
      {isLoading && <LoadingOverlay />}
      {error && <div className="error-message">{error}</div>}
      
      <div className="profile-management-content">
        <h1>Profile Management</h1>
        <button 
          className="create-profile-btn" 
          onClick={() => setShowProfileModal(true)}
        >
          Create New Profile
        </button>
        <ProfileList />

        {showProfileModal && (
          <ProfileModal
            onClose={() => setShowProfileModal(false)}
            onSave={handleCreateProfile}
            zones={zones}
          />
        )}
      </div>
    </div>
  );
}

export default ProfileManagement;