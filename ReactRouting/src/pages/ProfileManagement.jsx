import React from 'react';
import ProfileList from '../components/ProfileList';
import LoadingOverlay from '../components/LoadingOverlay';
const { useState } = React;

function ProfileManagement() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  return (
    <div className="profile-management-page">
      {isLoading && <LoadingOverlay />}
      {error && <div className="error-message">{error}</div>}
      
      <div className="profile-management-content">
        <h1>Profile Management</h1>
        <ProfileList />
      </div>
    </div>
  );
}

export default ProfileManagement;