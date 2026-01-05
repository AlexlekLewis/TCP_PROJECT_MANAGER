import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import Dashboard from './components/views/Dashboard';
import ProjectDetail from './components/views/ProjectDetail';
import TodayView from './components/views/TodayView';
import Login from './components/views/Login';
import BottomNav from './components/features/BottomNav';

const AppContent = () => {
  const { user } = useAuth();
  const [view, setView] = useState('dashboard');
  const [selectedProject, setSelectedProject] = useState(null);

  if (!user) return <Login />;

  return (
    <DataProvider>
      <div style={{ minHeight: '100vh' }}>
        {view === 'dashboard' && <Dashboard setView={setView} setSelectedProject={setSelectedProject} />}
        {view === 'project' && <ProjectDetail projectId={selectedProject} setView={setView} />}
        {view === 'today' && <TodayView setView={setView} setSelectedProject={setSelectedProject} />}
        <BottomNav currentView={view} setView={setView} />
      </div>
    </DataProvider>
  );
};

const App = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;
