import { Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { RequireAuth, RequireRole } from '@/routes/guards';

import LoginPage from '@/pages/Login';
import DashboardPage from '@/pages/Dashboard';
import WeekCalendarPage from '@/pages/WeekCalendar';
import TimelinePage from '@/pages/Timeline';
import ProjectsPage from '@/pages/Projects';
import ProjectDetailPage from '@/pages/ProjectDetail';
import WorkersPage from '@/pages/Workers';
import ReportsPage from '@/pages/Reports';
import AdminPage from '@/pages/Admin';

// Voice / AI features are temporarily disabled.
// To re-enable, re-add the route below and the nav link in AppLayout:
//   import VoiceLogPage from '@/pages/VoiceLog';
//   <Route path="voice" element={<VoiceLogPage />} />

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="calendar" element={<WeekCalendarPage />} />
          <Route path="timeline" element={<TimelinePage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:id" element={<ProjectDetailPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route element={<RequireRole role="admin" />}>
            <Route path="workers" element={<WorkersPage />} />
            <Route path="admin" element={<AdminPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
