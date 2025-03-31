import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import ProfileManagement from './pages/ProfileManagement';
import RouteGeneration from './pages/RouteGeneration';
import RouteVisualization from './pages/RouteVisualization';
import GeneratedRoutes from './pages/GeneratedRoutes';
import './App.css';

// Navigation component that only shows on certain routes
const Navigation = () => {
  const location = useLocation();
  
  // Don't show navigation on route visualization page
  if (location.pathname.includes('/routes/')) {
    return null;
  }

  return (
    <nav className="app-nav">
      <Link to="/">Profile Management</Link>
      <Link to="/generate">Generate Routes</Link>
      <Link to="/generated-routes">View Generated Routes</Link>
    </nav>
  );
};

function App() {
  return (
    <Router>
      <div className="app">
        <Navigation />

        <Routes>
          <Route path="/" element={<ProfileManagement />} />
          <Route path="/generate" element={<RouteGeneration />} />
          <Route path="/routes/:id" element={<RouteVisualization />} />
          <Route path="/generated-routes" element={<GeneratedRoutes />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
