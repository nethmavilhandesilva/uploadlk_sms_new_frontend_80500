// src/components/Dashboard/Dashboard.jsx
import React from 'react';
import { Link } from 'react-router-dom';
import Layout from "../Layout/Layout";

const Dashboard = () => {
  return (
    <Layout>
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Welcome to the Dashboard</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Link 
            to="/sales" 
            className="bg-blue-500 hover:bg-blue-600 text-white p-6 rounded-lg shadow-lg transition-colors"
          >
            <h2 className="text-xl font-semibold mb-2">Sales Entry</h2>
            <p>Manage sales entries and print bills</p>
          </Link>
          
          {/* Add other dashboard cards as needed */}
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;