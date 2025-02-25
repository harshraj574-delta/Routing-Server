import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import ProfileManagement from './pages/ProfileManagement';
import RouteGeneration from './pages/RouteGeneration';
import RouteVisualization from './pages/RouteVisualization';
import './App.css';

function App() {
  return (
    <Router>
      <div className="app">
        <nav className="app-nav">
          <Link to="/">Profile Management</Link>
          <Link to="/generate">Generate Routes</Link>
        </nav>

        <Routes>
          <Route path="/" element={<ProfileManagement />} />
          <Route path="/generate" element={<RouteGeneration />} />
          <Route path="/routes/:profileId" element={<RouteVisualization />} />
        </Routes>
      </div>
    </Router>
  );
}


export default App;
