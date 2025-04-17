import React from 'react';

function LoadingOverlay() {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex flex-col items-center justify-center">
      <div className="relative w-32 h-16">
        <div className="absolute animate-bounce w-full h-full flex items-center justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="#00D1FF"
            viewBox="0 0 24 24"
            className="w-16 h-16"
          >
            <path d="M3 13l1.5-4.5A3 3 0 017.3 7h9.4a3 3 0 012.8 1.5L21 13v5a1 1 0 01-1 1h-1a2 2 0 01-4 0H8a2 2 0 01-4 0H3a1 1 0 01-1-1v-5zM7.5 17a1.5 1.5 0 103 0 1.5 1.5 0 00-3 0zm9 0a1.5 1.5 0 103 0 1.5 1.5 0 00-3 0z" />
          </svg>
        </div>
      </div>
      <p className="text-white mt-6 text-lg font-medium animate-pulse">Optimizing Routes...</p>
    </div>
  );
}

export default LoadingOverlay;
