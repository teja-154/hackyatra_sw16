import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import socket from '../../api/socket.js';
import { AlertCircle, LogOut, CheckCircle2, Clock, AlertTriangle, ChevronRight } from 'lucide-react';

const urgencyColors = {
  critical: 'bg-red-500 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-yellow-500 text-white',
  low: 'bg-blue-500 text-white'
};

const statusMap = {
  reported: { label: 'New', badge: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  acknowledged: { label: 'Acknowledged', badge: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' },
  assigned: { label: 'Team Assigned', badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  in_progress: { label: 'In Progress', badge: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
};

export default function Queue() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dept, setDept] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('coc_token');
    const deptStr = localStorage.getItem('coc_dept');
    
    if (!token || !deptStr) {
      navigate('/dept/login');
      return;
    }

    const deptData = JSON.parse(deptStr);
    setDept(deptData);

    const fetchQueue = async () => {
      try {
        const data = await api.get(`/incidents?department=${deptData.id}`);
        // Filter out resolved
        setIncidents(data.filter(i => i.status !== 'resolved_verified' && i.status !== 'disputed'));
        setLoading(false);
      } catch (err) {
        if (err.status === 401) {
          localStorage.removeItem('coc_token');
          navigate('/dept/login');
        } else {
          setError(err.message);
          setLoading(false);
        }
      }
    };

    fetchQueue();

    // Socket
    socket.emit('join:department', deptData.id);

    const handleUpdate = (updatedIncident) => {
      setIncidents(prev => {
        if (updatedIncident.status === 'resolved_verified') {
          return prev.filter(i => i._id !== updatedIncident._id);
        }
        const idx = prev.findIndex(i => i._id === updatedIncident._id);
        if (idx === -1) {
          // If it's a new incident for this dept, add it and sort
          const newArr = [...prev, updatedIncident];
          return newArr.sort((a, b) => b.priorityScore - a.priorityScore);
        }
        const newArr = [...prev];
        newArr[idx] = updatedIncident;
        return newArr.sort((a, b) => b.priorityScore - a.priorityScore);
      });
    };

    socket.on('incident:new', handleUpdate);
    socket.on('incident:updated', handleUpdate);

    return () => {
      socket.off('incident:new', handleUpdate);
      socket.off('incident:updated', handleUpdate);
    };
  }, [navigate]);

  const handleLogout = () => {
    api.post('/auth/logout').catch(() => {});
    localStorage.removeItem('coc_token');
    localStorage.removeItem('coc_dept');
    navigate('/dept/login');
  };

  if (loading) return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white"><div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full"></div></div>;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 p-4 md:p-6 pb-20">
      <div className="max-w-4xl mx-auto">
        <header className="flex justify-between items-center mb-8 bg-slate-800 p-4 rounded-xl border border-slate-700">
          <div>
            <h1 className="text-xl font-bold text-white">{dept?.name}</h1>
            <p className="text-sm text-slate-400">Incident Queue</p>
          </div>
          <button onClick={handleLogout} className="text-slate-400 hover:text-white p-2 bg-slate-700 rounded-lg">
            <LogOut className="w-5 h-5" />
          </button>
        </header>

        {error && (
          <div className="bg-red-900/50 text-red-200 p-4 rounded-xl flex items-start gap-3 mb-6 border border-red-500/30">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          {incidents.map((incident) => {
            const isBreached = incident.slaBreached;
            
            return (
              <div 
                key={incident._id} 
                onClick={() => navigate(`/dept/incident/${incident._id}`)}
                className={`bg-slate-800 rounded-xl border p-5 cursor-pointer hover:bg-slate-750 transition-all ${isBreached ? 'border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.1)]' : 'border-slate-700'}`}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-bold uppercase tracking-wider px-2 py-1 rounded ${urgencyColors[incident.urgency]}`}>
                      {incident.urgency}
                    </span>
                    <span className="font-semibold text-white capitalize">{incident.category}</span>
                    {isBreached && (
                      <span className="flex items-center gap-1 text-xs font-medium text-red-400 bg-red-400/10 px-2 py-1 rounded border border-red-400/20">
                        <AlertTriangle className="w-3 h-3" /> SLA Breach
                      </span>
                    )}
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded border ${statusMap[incident.status]?.badge || 'bg-slate-700 text-slate-300 border-slate-600'}`}>
                    {statusMap[incident.status]?.label || incident.status}
                  </span>
                </div>

                <p className="text-sm text-slate-400 mb-4">{incident.ward}</p>

                <div className="flex justify-between items-center border-t border-slate-700/50 pt-4">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <Clock className="w-4 h-4" />
                      {new Date(incident.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    {incident.occurrenceCount > 1 && (
                      <div className="flex items-center gap-1 text-xs text-orange-400 font-medium">
                        <CheckCircle2 className="w-4 h-4" />
                        x{incident.occurrenceCount} Merged
                      </div>
                    )}
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-500" />
                </div>
              </div>
            );
          })}

          {incidents.length === 0 && (
            <div className="text-center p-12 bg-slate-800 rounded-xl border border-slate-700">
              <CheckCircle2 className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-1">Queue is Empty</h3>
              <p className="text-slate-400 text-sm">All caught up! No active incidents for your department.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
