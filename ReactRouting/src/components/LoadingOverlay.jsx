import React from 'react';
import './LoadingOverlay.css';

function LoadingOverlay() {
  return (
    <div className="loading-overlay active">
      <div className="loading-spinner"></div>
      <div className="loading-text">Optimizing Routes...</div>
    </div>
  );
}

export default LoadingOverlay; 