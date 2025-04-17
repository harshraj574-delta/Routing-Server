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
    <nav className="bg-white border-gray-200 dark:bg-gray-900">
  <div className="max-w-screen-xl flex flex-wrap items-center justify-between mx-auto p-4">
    <a href="/" className="flex items-center space-x-3 rtl:space-x-reverse">
      <img src="https://flowbite.com/docs/images/logo.svg" className="h-8" alt="Logo" />
      <span className="self-center text-2xl font-semibold whitespace-nowrap dark:text-white">RouteGen</span>
    </a>
    <div className="flex items-center md:order-2 space-x-1 md:space-x-0 rtl:space-x-reverse">
      <button type="button" data-dropdown-toggle="language-dropdown-menu" className="inline-flex items-center font-medium justify-center px-4 py-2 text-sm text-gray-900 dark:text-white rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 dark:hover:text-white">
        <svg className="w-5 h-5 rounded-full me-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3900 3900">
          <path fill="#b22234" d="M0 0h7410v3900H0z" />
          <path d="M0 450h7410m0 600H0m0 600h7410m0 600H0m0 600h7410m0 600H0" stroke="#fff" strokeWidth="300" />
          <path fill="#3c3b6e" d="M0 0h2964v2100H0z" />
        </svg>
        English (US)
      </button>
      {/* Dropdown */}
      <div className="z-50 hidden my-4 text-base list-none bg-white divide-y divide-gray-100 rounded-lg shadow-sm dark:bg-gray-700" id="language-dropdown-menu">
        <ul className="py-2 font-medium" role="none">
          <li>
            <a href="#" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-600 dark:hover:text-white" role="menuitem">
              <div className="inline-flex items-center">
                <svg aria-hidden="true" className="h-3.5 w-3.5 rounded-full me-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
                  <g fillRule="evenodd">
                    <g strokeWidth="1pt">
                      <path fill="#bd3d44" d="M0 0h247v10H0zm0 20h247v10H0zm0 20h247v10H0zm0 20h247v10H0zm0 20h247v10H0zm0 20h247v10H0zm0 20h247v10H0z" transform="scale(3.9385)" />
                      <path fill="#fff" d="M0 10h247v10H0zm0 20h247v10H0zm0 20h247v10H0zm0 20h247v10H0zm0 20h247v10H0zm0 20h247v10H0z" transform="scale(3.9385)" />
                    </g>
                    <path fill="#192f5d" d="M0 0h98.8v70H0z" transform="scale(3.9385)" />
                  </g>
                </svg>
                English (US)
              </div>
            </a>
          </li>
        </ul>
      </div>
    </div>
    <div className="items-center justify-between hidden w-full md:flex md:w-auto md:order-1" id="navbar-user">
      <ul className="flex flex-col font-medium p-4 md:p-0 mt-4 border border-gray-100 rounded-lg bg-gray-50 md:flex-row md:space-x-8 md:mt-0 md:border-0 md:bg-white dark:bg-gray-800 md:dark:bg-gray-900 dark:border-gray-700">
        <li>
          <Link to="/" className="block py-2 px-3 text-gray-900 rounded hover:bg-gray-100 md:hover:bg-transparent md:hover:text-blue-700 md:p-0 dark:text-white md:dark:hover:text-blue-500 dark:hover:bg-gray-700 dark:hover:text-white md:dark:hover:bg-transparent">Profile Management</Link>
        </li>
        <li>
          <Link to="/generate" className="block py-2 px-3 text-gray-900 rounded hover:bg-gray-100 md:hover:bg-transparent md:hover:text-blue-700 md:p-0 dark:text-white md:dark:hover:text-blue-500 dark:hover:bg-gray-700 dark:hover:text-white md:dark:hover:bg-transparent">Generate Routes</Link>
        </li>
        <li>
          <Link to="/generated-routes" className="block py-2 px-3 text-gray-900 rounded hover:bg-gray-100 md:hover:bg-transparent md:hover:text-blue-700 md:p-0 dark:text-white md:dark:hover:text-blue-500 dark:hover:bg-gray-700 dark:hover:text-white md:dark:hover:bg-transparent">View Generated Routes</Link>
        </li>
      </ul>
    </div>
  </div>
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
