import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

/* ── Pages (stubs for Phase 1, implemented in Phase 4-6) ── */
import ReportForm   from './pages/citizen/ReportForm.jsx';
import StatusLookup from './pages/citizen/StatusLookup.jsx';
import Login        from './pages/department/Login.jsx';
import Queue        from './pages/department/Queue.jsx';
import IncidentDetail from './pages/department/IncidentDetail.jsx';
import Dashboard    from './pages/coc/Dashboard.jsx';
import Analytics    from './pages/coc/Analytics.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Citizen */}
        <Route path="/"            element={<ReportForm />} />
        <Route path="/report"      element={<ReportForm />} />
        <Route path="/track"       element={<StatusLookup />} />

        {/* Department */}
        <Route path="/dept/login"  element={<Login />} />
        <Route path="/dept/queue"  element={<Queue />} />
        <Route path="/dept/incident/:id" element={<IncidentDetail />} />

        {/* COC Dashboard */}
        <Route path="/coc"         element={<Dashboard />} />
        <Route path="/coc/analytics" element={<Analytics />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
