import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import socket from '../../api/socket.js';
import { ArrowLeft, MapPin, Clock, Camera, Loader2, CheckCircle2, UserCircle2, AlertTriangle } from 'lucide-react';

const formatDate = (dateString) => {
  const d = new Date(dateString);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

export default function IncidentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [incident, setIncident] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Resolve modal state
  const [showResolve, setShowResolve] = useState(false);
  const [resolvePhoto, setResolvePhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);

  useEffect(() => {
    const fetchIncident = async () => {
      try {
        const data = await api.get(`/incidents/${id}`);
        setIncident(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchIncident();

    const handleUpdate = (updatedIncident) => {
      if (updatedIncident._id === id) {
        // Need to refetch to get the signals if it updated, but this is simpler for hackathon
        fetchIncident();
      }
    };

    socket.on('incident:updated', handleUpdate);
    return () => socket.off('incident:updated', handleUpdate);
  }, [id]);

  const handleAction = async (action) => {
    setActionLoading(true);
    setError(null);
    try {
      let body = {};
      
      if (action === 'resolve') {
        if (!resolvePhoto) {
          throw new Error('Resolution photo is required');
        }
        const uploadRes = await api.upload(resolvePhoto);
        body.photo_url = uploadRes.url;
      }

      await api.post(`/incidents/${id}/${action}`, body);
      
      if (action === 'resolve') {
        setShowResolve(false);
        navigate('/dept/queue');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setResolvePhoto(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  if (loading) return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white"><Loader2 className="animate-spin w-8 h-8 text-brand-500" /></div>;
  if (error && !incident) return <div className="min-h-screen bg-slate-900 p-6 text-red-400">Error: {error}</div>;
  if (!incident) return null;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 pb-24 relative">
      {/* Header */}
      <header className="sticky top-0 bg-slate-800/90 backdrop-blur border-b border-slate-700 z-10 px-4 py-4 flex items-center gap-4">
        <button onClick={() => navigate('/dept/queue')} className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-white capitalize">{incident.category}</h1>
          <p className="text-xs text-slate-400 font-mono">ID: {incident._id}</p>
        </div>
      </header>

      <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6">
        
        {error && (
          <div className="bg-red-900/50 text-red-200 p-4 rounded-xl flex items-start gap-3 border border-red-500/30">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Info Card */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <div className="flex justify-between items-start mb-4">
            <span className={`text-xs font-bold uppercase tracking-wider px-2 py-1 rounded ${incident.urgency === 'critical' ? 'bg-red-500 text-white' : 'bg-orange-500 text-white'}`}>
              {incident.urgency} Priority
            </span>
            <span className="text-xs font-medium px-2 py-1 rounded bg-slate-700 text-slate-300 border border-slate-600">
              {incident.status.replace('_', ' ')}
            </span>
          </div>

          <div className="grid gap-4 mb-4">
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-white">{incident.ward}</p>
                <p className="text-xs text-slate-400">Loc: {incident.location.coordinates[1].toFixed(4)}, {incident.location.coordinates[0].toFixed(4)}</p>
              </div>
            </div>
            
            {incident.assignedTeam && (
              <div className="flex items-start gap-3">
                <UserCircle2 className="w-5 h-5 text-purple-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-purple-300">Assigned To: {incident.assignedTeam.name}</p>
                </div>
              </div>
            )}
          </div>

          {incident.occurrenceCount > 1 && (
            <div className="mt-4 p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg text-sm text-orange-200">
              <span className="font-bold">Data Unification:</span> Merged {incident.occurrenceCount} reports from {incident.sources.join(', ')}
            </div>
          )}
        </div>

        {/* Signals/Evidence */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <h3 className="font-semibold text-white mb-4">Evidence ({incident.signals?.length || 0})</h3>
          <div className="space-y-4">
            {incident.signals?.map((sig, idx) => (
              <div key={idx} className="bg-slate-900 rounded-lg p-4 border border-slate-700">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-bold uppercase text-brand-400 bg-brand-900/30 px-2 py-1 rounded">Source: {sig.source}</span>
                  <span className="text-xs text-slate-500">{formatDate(sig.createdAt)}</span>
                </div>
                <p className="text-sm text-slate-300 mb-3">{sig.description}</p>
                {sig.photoUrl && (
                  <img src={sig.photoUrl} alt="Evidence" className="w-full max-h-48 object-cover rounded-lg border border-slate-700" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Timeline */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <h3 className="font-semibold text-white mb-4">History</h3>
          <div className="relative border-l-2 border-slate-700 ml-3 space-y-6">
            {incident.statusHistory?.map((entry, idx) => (
              <div key={idx} className="relative pl-6">
                <span className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-brand-500 border-4 border-slate-800"></span>
                <p className="text-sm font-semibold text-white capitalize">{entry.status.replace('_', ' ')}</p>
                <p className="text-sm text-slate-400 mt-0.5">{entry.note}</p>
                <p className="text-xs text-slate-500 mt-1">{formatDate(entry.timestamp)} • {entry.changedBy}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Action Bar */}
      {incident.status !== 'resolved_verified' && (
        <div className="fixed bottom-0 left-0 right-0 bg-slate-800 border-t border-slate-700 p-4 shadow-[0_-10px_20px_rgba(0,0,0,0.3)]">
          <div className="max-w-3xl mx-auto">
            {incident.status === 'reported' && (
              <button 
                onClick={() => handleAction('accept')}
                disabled={actionLoading}
                className="w-full py-4 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl shadow-lg transition-colors flex items-center justify-center gap-2"
              >
                {actionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <MapPin className="w-5 h-5" />}
                Assign Team
              </button>
            )}

            {incident.status === 'assigned' && !showResolve && (
              <button 
                onClick={() => setShowResolve(true)}
                className="w-full py-4 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl shadow-lg transition-colors flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-5 h-5" />
                Resolve Issue
              </button>
            )}

            {showResolve && (
              <div className="space-y-4 animate-slide-in">
                <p className="text-sm text-slate-300 font-medium text-center">Upload resolution photo</p>
                
                {photoPreview ? (
                  <div className="relative rounded-xl overflow-hidden aspect-video border border-slate-600">
                    <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                    <button 
                      onClick={() => { setPhotoPreview(null); setResolvePhoto(null); }}
                      className="absolute top-2 right-2 bg-black/70 text-white rounded-full p-2"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <label className="border-2 border-dashed border-slate-600 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:border-brand-500 hover:bg-brand-900/20 bg-slate-900 transition-colors">
                    <Camera className="w-8 h-8 text-slate-500 mb-2" />
                    <span className="text-sm text-slate-400 font-medium">Take Photo</span>
                    <input type="file" accept="image/jpeg, image/png" capture="environment" className="hidden" onChange={handlePhotoChange} />
                  </label>
                )}

                <div className="flex gap-3">
                  <button onClick={() => setShowResolve(false)} className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-xl">Cancel</button>
                  <button 
                    onClick={() => handleAction('resolve')}
                    disabled={!resolvePhoto || actionLoading}
                    className="flex-1 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl disabled:opacity-50 flex justify-center items-center"
                  >
                    {actionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirm Resolved'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
