import React, { useState } from 'react';
import { Search, MapPin, AlertCircle, Loader2, CheckCircle2, Clock, Camera, FileVideo } from 'lucide-react';
import { api } from '../../api/client.js';

// Simple date formatter to avoid extra dependency just for this
const formatDate = (dateString) => {
  const d = new Date(dateString);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const STATUS_MAP = {
  reported:          { label: 'Reported', color: 'text-blue-600', bg: 'bg-blue-100', icon: Clock },
  acknowledged:      { label: 'Acknowledged', color: 'text-indigo-600', bg: 'bg-indigo-100', icon: CheckCircle2 },
  assigned:          { label: 'Assigned to Team', color: 'text-purple-600', bg: 'bg-purple-100', icon: MapPin },
  in_progress:       { label: 'Work in Progress', color: 'text-orange-600', bg: 'bg-orange-100', icon: Loader2 },
  resolved_verified: { label: 'Resolved', color: 'text-green-600', bg: 'bg-green-100', icon: CheckCircle2 },
  disputed:          { label: 'Disputed', color: 'text-red-600', bg: 'bg-red-100', icon: AlertCircle },
};

export default function StatusLookup() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [incident, setIncident] = useState(null);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setIncident(null);

    try {
      const data = await api.get(`/status/${encodeURIComponent(query.trim())}`);
      setIncident(data);
    } catch (err) {
      setError(err.message || 'Could not find a complaint with that ID or phone number.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center p-4 py-8">
      <div className="w-full max-w-md mb-6">
        <a href="/" className="text-brand-600 hover:underline font-medium text-sm flex items-center gap-1 mb-4">
          ← Back to Report
        </a>
        <h1 className="text-2xl font-bold text-slate-800 mb-1">Track Status</h1>
        <p className="text-slate-500 mb-6">Enter your Tracking ID or Phone Number</p>

        <form onSubmit={handleSearch} className="relative mb-6">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. 64b9a1f..."
            className="w-full border-2 border-slate-200 rounded-xl pl-4 pr-12 py-3 focus:outline-none focus:border-brand-500 text-slate-800"
          />
          <button 
            type="submit"
            disabled={loading}
            className="absolute right-2 top-2 p-1.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
          </button>
        </form>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl flex items-start gap-3 border border-red-100">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}
      </div>

      {incident && (
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="p-6 border-b border-slate-100 bg-slate-50/50">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-sm text-slate-500 mb-1">Incident Category</p>
                <h2 className="text-xl font-bold text-slate-800 capitalize">{incident.category || 'General'}</h2>
              </div>
              <div className={`px-3 py-1 rounded-full text-sm font-medium capitalize border ${incident.urgency === 'critical' ? 'bg-red-50 text-red-700 border-red-200' : incident.urgency === 'high' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-yellow-50 text-yellow-700 border-yellow-200'}`}>
                {incident.urgency} Priority
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-slate-500">Department</p>
                <p className="font-medium text-slate-800">{incident.department}</p>
              </div>
              <div>
                <p className="text-slate-500">Ward</p>
                <p className="font-medium text-slate-800">{incident.ward}</p>
              </div>
              {incident.assignedTeam && (
                <div className="col-span-2">
                  <p className="text-slate-500">Field Team</p>
                  <p className="font-medium text-slate-800">{incident.assignedTeam}</p>
                </div>
              )}
            </div>

            {/* Data Unification Proof */}
            {incident.occurrenceCount > 1 && (
              <div className="mt-4 bg-brand-50 border border-brand-100 rounded-lg p-3 flex items-start gap-3">
                <div className="bg-brand-100 p-1.5 rounded text-brand-600 mt-0.5">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-brand-900">Merged with existing incident</p>
                  <p className="text-xs text-brand-700 mt-0.5">
                    This issue was reported {incident.occurrenceCount} times by sources: {incident.sources.join(', ')}. Our system merged them to speed up resolution.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Timeline */}
          <div className="p-6">
            <h3 className="text-sm font-semibold text-slate-800 uppercase tracking-wider mb-6">Status Timeline</h3>
            
            <div className="relative border-l-2 border-slate-200 ml-3 space-y-8">
              {incident.timeline.map((entry, idx) => {
                const statusInfo = STATUS_MAP[entry.status] || { label: entry.status, color: 'text-slate-600', bg: 'bg-slate-100', icon: Clock };
                const Icon = statusInfo.icon;
                
                return (
                  <div key={idx} className="relative pl-6">
                    <span className={`absolute -left-[17px] top-1 w-8 h-8 rounded-full flex items-center justify-center border-2 border-white ${statusInfo.bg} ${statusInfo.color}`}>
                      <Icon className="w-4 h-4" />
                    </span>
                    <div>
                      <h4 className={`font-semibold ${statusInfo.color}`}>{statusInfo.label}</h4>
                      <p className="text-sm text-slate-600 mt-0.5">{entry.note}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-xs text-slate-400 font-medium">{formatDate(entry.timestamp)}</p>
                        <span className="text-xs text-slate-300">•</span>
                        <p className="text-xs text-slate-400 uppercase tracking-wider">{entry.changedBy}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          
          {/* Signal images if available */}
          {incident.signals?.filter(s => s.photoUrl).length > 0 && (
             <div className="p-6 border-t border-slate-100 bg-slate-50">
               <h3 className="text-sm font-semibold text-slate-800 uppercase tracking-wider mb-3">Attached Evidence</h3>
               <div className="flex gap-3 overflow-x-auto pb-2">
                 {incident.signals.filter(s => s.photoUrl).map((s, idx) => (
                   <div key={idx} className="relative flex-shrink-0 w-24 h-24 rounded-lg overflow-hidden border border-slate-200">
                     <img src={s.photoUrl} alt="Evidence" className="w-full h-full object-cover" />
                     <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[10px] text-white p-1 truncate">
                       {s.source}
                     </div>
                   </div>
                 ))}
               </div>
             </div>
          )}
        </div>
      )}
    </div>
  );
}
