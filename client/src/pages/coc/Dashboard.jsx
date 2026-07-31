import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Marker, Popup, LayersControl, useMap } from 'react-leaflet';
const { BaseLayer } = LayersControl;
import L from 'leaflet';
import { api } from '../../api/client.js';
import socket from '../../api/socket.js';
import { AlertCircle, Clock, CheckCircle2, Users, Activity, BarChart2, Search, X, MapPin, ChevronRight, Image } from 'lucide-react';

/**
 * Get marker visual properties based on priority score.
 */
const getPriorityVisuals = (priorityScore, urgency) => {
  const radius = Math.min(18, Math.max(6, 6 + (priorityScore || 0) * 0.4));
  const colors = {
    critical: { fill: '#ef4444', stroke: '#7f1d1d' },
    high:     { fill: '#f97316', stroke: '#7c2d12' },
    medium:   { fill: '#eab308', stroke: '#713f12' },
    low:      { fill: '#3b82f6', stroke: '#1e3a5f' },
  };
  const color = colors[urgency] || colors.medium;
  const opacity = Math.min(1, 0.5 + (priorityScore || 0) * 0.02);
  return { radius, ...color, opacity };
};

const teamIcon = L.divIcon({
  className: 'team-leaflet-icon',
  html: `<div style="width:20px;height:20px;border-radius:4px;border:2px solid white;background:#9333ea;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.4)"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10]
});

const formatTime = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const formatDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const STATUS_LABELS = {
  reported: 'Reported', acknowledged: 'Acknowledged', assigned: 'Team Assigned',
  in_progress: 'In Progress', resolved_verified: 'Resolved', disputed: 'Disputed',
  signal_merged: 'Report Merged', sla_breached: 'SLA Breached', rerouted: 'Rerouted',
};

function MapUpdater({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.flyTo(center, 18, { duration: 1.5 });
    }
  }, [center, map]);
  return null;
}

export default function Dashboard() {
  const [incidents, setIncidents] = useState([]);
  const [teams, setTeams] = useState([]);
  const [stats, setStats] = useState({ overall: { open: 0, resolved: 0, slaBreached: 0 } });
  const [toasts, setToasts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showResolved, setShowResolved] = useState(false);

  const mapRef = useRef(null);

  useEffect(() => {
    Promise.all([
      api.get('/incidents'),
      api.get('/teams'),
      api.get('/stats')
    ]).then(([incData, teamsData, statsData]) => {
      // Sort open incidents by priority
      const sortedOpen = incData.sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));
      setIncidents(sortedOpen);
      setTeams(teamsData);
      setStats(statsData);
    }).catch(() => {});

    socket.emit('join:coc');

    socket.on('incident:new', (inc) => {
      setIncidents(prev => {
        const arr = [inc, ...prev];
        return arr.sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));
      });
      if (inc.urgency === 'critical' || inc.urgency === 'high') {
        addToast(`🚨 ${inc.urgency.toUpperCase()}: ${inc.category || 'Issue'} in ${inc.ward}`);
      }
      refreshStats();
    });

    socket.on('incident:updated', (inc) => {
      setIncidents(prev => {
        const idx = prev.findIndex(i => i._id === inc._id);
        let arr = idx === -1 ? [inc, ...prev] : [...prev];
        if (idx >= 0) arr[idx] = inc;
        return arr.sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));
      });
      // Update detail panel if open
      if (selectedIncident === inc._id) loadDetail(inc._id);
      refreshStats();
    });

    socket.on('incident:sla_breach', (d) => {
      addToast(`⚠️ SLA Breach! ${d.category} in ${d.ward} — ${d.age} min overdue`, 'error');
      refreshStats();
    });

    socket.on('team:location', (t) => {
      setTeams(prev => {
        const idx = prev.findIndex(x => x._id === t._id);
        if (idx === -1) return [...prev, t];
        const arr = [...prev]; arr[idx] = t; return arr;
      });
    });

    return () => { socket.off('incident:new'); socket.off('incident:updated'); socket.off('incident:sla_breach'); socket.off('team:location'); };
  }, [selectedIncident]);

  const refreshStats = () => api.get('/stats').then(setStats).catch(() => {});

  const addToast = (message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 6000);
  };

  const loadDetail = async (incId) => {
    setSelectedIncident(incId);
    setDetailLoading(true);
    try {
      const data = await api.get(`/incidents/${incId}`);
      setDetailData(data);
    } catch { setDetailData(null); }
    setDetailLoading(false);
  };

  const closeDetail = () => { setSelectedIncident(null); setDetailData(null); };

  // Search — match category, ward, ID, or department name
  const sq = searchQuery.trim().toLowerCase();
  
  // Filter by search query and resolved toggle
  const visibleIncidents = incidents.filter(inc => {
    const isResolved = inc.status === 'resolved_verified' || inc.status === 'disputed';
    if (isResolved && !showResolved) return false;
    if (!isResolved && showResolved) return false;

    if (sq) {
      return (
        (inc.category || '').toLowerCase().includes(sq) ||
        (inc.ward || '').toLowerCase().includes(sq) ||
        (inc._id || '').toLowerCase().includes(sq) ||
        (inc.department?.name || '').toLowerCase().includes(sq) ||
        (inc.urgency || '').toLowerCase().includes(sq)
      );
    }
    return true;
  });

  const VIZAG_CENTER = [17.72, 83.3];

  return (
    <div className="flex flex-col h-screen bg-coc-bg text-coc-text overflow-hidden">
      {/* Navbar */}
      <header className="h-14 bg-coc-card border-b border-coc-border flex items-center justify-between px-6 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-brand-500" />
          <h1 className="font-bold text-lg text-white">COC-Sync <span className="text-sm font-normal text-slate-400 ml-2 border-l border-coc-border pl-2">City Operations Center</span></h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <span className="relative flex h-3 w-3"><span className="animate-ping absolute h-full w-full rounded-full bg-green-400 opacity-75"></span><span className="relative rounded-full h-3 w-3 bg-green-500"></span></span>
            Live
          </div>
          <a href="/coc/analytics" className="text-sm font-medium text-slate-300 hover:text-white flex items-center gap-1 bg-slate-800 px-3 py-1.5 rounded-md border border-coc-border">
            <BarChart2 className="w-4 h-4" /> Analytics
          </a>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-12 gap-3 p-3 overflow-hidden">
        {/* LEFT: Alerts Feed OR Detail Panel */}
        <div className="col-span-3 bg-coc-card rounded-xl border border-coc-border flex flex-col overflow-hidden">
          {selectedIncident && detailData ? (
            /* ── DETAIL PANEL ── */
            <div className="flex flex-col h-full overflow-hidden">
              <div className="p-3 border-b border-coc-border flex items-center justify-between bg-slate-800/50">
                <h2 className="font-semibold text-white text-sm truncate">Incident Detail</h2>
                <button onClick={closeDetail} className="p-1.5 hover:bg-slate-700 rounded-lg"><X className="w-4 h-4 text-slate-400" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {/* Category + Urgency */}
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white capitalize text-base">{detailData.category || 'General'}</span>
                  <span className={`text-[10px] uppercase px-2 py-1 rounded font-bold ${detailData.urgency === 'critical' ? 'bg-red-500 text-white' : detailData.urgency === 'high' ? 'bg-orange-500 text-white' : 'bg-yellow-500 text-white'}`}>{detailData.urgency}</span>
                </div>
                {/* Info */}
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-slate-400">Ward</span><span className="text-white font-medium text-right truncate ml-2" style={{maxWidth:'60%'}}>{detailData.ward}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Department</span><span className="text-white font-medium text-right truncate ml-2" style={{maxWidth:'60%'}}>{detailData.department?.name || 'Unassigned'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Team</span><span className="text-white font-medium text-right truncate ml-2" style={{maxWidth:'60%'}}>{detailData.assignedTeam?.name || 'Pending'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Status</span><span className="text-brand-400 font-medium">{STATUS_LABELS[detailData.status] || detailData.status}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Priority</span><span className="text-white font-bold">{detailData.priorityScore}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Reports</span><span className="text-orange-400 font-bold">×{detailData.occurrenceCount}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Sources</span><span className="text-white">{detailData.sources?.join(', ')}</span></div>
                </div>

                {/* Data Silo Bridge Badge */}
                {detailData.sources?.length > 1 && (
                  <div className="bg-brand-900/30 border border-brand-500/50 rounded-lg p-2 flex items-start gap-2 animate-pulse">
                    <Activity className="w-4 h-4 text-brand-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-[10px] font-bold text-brand-300 uppercase">Data Silo Broken</p>
                      <p className="text-[10px] text-brand-100">Merged from {detailData.sources.length} separate isolated systems.</p>
                    </div>
                  </div>
                )}

                {/* Simulated CCTV Feed */}
                {detailData.sources?.includes('cctv') && (
                  <div className="border-2 border-red-500/50 rounded-lg overflow-hidden relative aspect-video bg-black flex flex-col items-center justify-center">
                    <div className="absolute top-2 left-2 flex items-center gap-1.5 z-10">
                      <span className="animate-pulse w-2 h-2 bg-red-500 rounded-full"></span>
                      <span className="text-[10px] text-red-500 font-bold tracking-widest bg-black/50 px-1 rounded">LIVE CCTV</span>
                    </div>
                    <div className="absolute top-2 right-2 text-[10px] text-white font-mono bg-black/50 px-1 rounded z-10">{detailData.ward.split(' - ')[0]} CAM-04</div>
                    <div className="w-full h-full opacity-40 bg-[url('https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=400&q=80')] bg-cover bg-center mix-blend-luminosity"></div>
                    <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(transparent, transparent 2px, rgba(0,0,0,0.5) 2px, rgba(0,0,0,0.5) 4px)' }}></div>
                    <div className="absolute text-center z-10">
                      <div className="w-12 h-12 border-2 border-red-500/50 mx-auto rounded-full flex items-center justify-center mb-1">
                        <div className="w-1 h-1 bg-red-500 rounded-full"></div>
                      </div>
                      <p className="text-[9px] text-red-400 font-mono tracking-widest uppercase bg-black/70 px-2 py-0.5 rounded">Anomaly Detected</p>
                    </div>
                  </div>
                )}

                {/* Evidence Images */}
                {detailData.signals?.filter(s => s.photoUrl).length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Evidence Photos</h4>
                    <div className="grid grid-cols-1 gap-3">
                      {detailData.signals.filter(s => s.photoUrl).map((s, i) => (
                        <div key={i} className="relative rounded-xl overflow-hidden border-2 border-slate-700 shadow-lg">
                          <img src={s.photoUrl} alt="Evidence" className="w-full h-48 object-cover" />
                          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent p-2 pt-6">
                            <p className="text-[11px] font-medium text-white truncate">{s.source} • {formatTime(s.createdAt)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Signal descriptions */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Reports ({detailData.signals?.length || 0})</h4>
                  <div className="space-y-2">
                    {detailData.signals?.map((s, i) => (
                      <div key={i} className="bg-slate-800 rounded-lg p-2 border border-slate-700">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[10px] font-bold uppercase text-brand-400">{s.source}</span>
                          <span className="text-[10px] text-slate-500">{formatDate(s.createdAt)}</span>
                        </div>
                        <p className="text-xs text-slate-300 break-words">{s.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Timeline */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Timeline</h4>
                  <div className="relative border-l-2 border-slate-700 ml-2 space-y-3">
                    {detailData.statusHistory?.map((e, i) => (
                      <div key={i} className="relative pl-4">
                        <span className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-brand-500"></span>
                        <p className="text-xs font-semibold text-white">{STATUS_LABELS[e.status] || e.status}</p>
                        <p className="text-[11px] text-slate-400 break-words">{e.note}</p>
                        <p className="text-[10px] text-slate-500">{formatDate(e.timestamp)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ── ALERT LIST ── */
            <>
              <div className="p-3 border-b border-coc-border bg-slate-800/50">
                <div className="flex justify-between items-center mb-2">
                  <h2 className="font-semibold text-white flex items-center gap-2 text-sm">
                    <AlertCircle className="w-4 h-4 text-orange-400" /> Live Alerts
                  </h2>
                  <span className="text-xs font-mono bg-slate-800 px-2 py-0.5 rounded text-slate-300 border border-coc-border">{incidents.length}</span>
                </div>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search category, ward, ID..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-brand-500" />
                  {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2"><X className="w-3 h-3 text-slate-500" /></button>}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5">
                {visibleIncidents.slice(0, 100).map((inc) => {
                  const pv = getPriorityVisuals(inc.priorityScore, inc.urgency);
                  return (
                    <div key={inc._id}
                      className="p-2.5 rounded-lg border transition-all cursor-pointer bg-slate-800/40 border-slate-700/50 hover:border-slate-500 hover:bg-slate-800/70"
                      onClick={() => { loadDetail(inc._id); mapRef.current?.flyTo([inc.location.coordinates[1], inc.location.coordinates[0]], 16); }}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: pv.fill }}></div>
                          <span className="text-xs font-semibold text-slate-200 capitalize truncate">{inc.category || 'general'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0 ml-1">
                          <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-slate-700 text-slate-300">P{inc.priorityScore || 0}</span>
                          <span className="text-[10px] text-slate-500">{formatTime(inc.createdAt)}</span>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-400 truncate mb-1">{inc.ward}</p>
                      <div className="flex items-center justify-between">
                        <div className="flex flex-wrap gap-1 min-w-0">
                          {inc.sources?.map((src, i) => (
                            <span key={i} className={`text-[9px] px-1 py-0.5 rounded uppercase font-medium ${src === 'cctv' ? 'bg-purple-500/20 text-purple-300' : 'bg-blue-500/20 text-blue-300'}`}>{src}</span>
                          ))}
                          {inc.occurrenceCount > 1 && <span className="text-[9px] px-1 py-0.5 rounded bg-orange-500/20 text-orange-300 font-medium">×{inc.occurrenceCount}</span>}
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
                      </div>
                    </div>
                  );
                })}
                {visibleIncidents.length === 0 && (
                  <div className="text-center p-6 text-slate-500 text-xs">{searchQuery ? 'No matches' : showResolved ? 'No resolved incidents' : 'No active alerts'}</div>
                )}
              </div>
            </>
          )}
        </div>

        {/* RIGHT: Stats + Map */}
        <div className="col-span-9 flex flex-col gap-3 overflow-hidden">
          <div className="grid grid-cols-4 gap-3 flex-shrink-0">
            <div className="bg-coc-card p-3 rounded-xl border border-coc-border flex items-center gap-3">
              <div className="p-2.5 bg-red-500/10 rounded-lg text-red-500 border border-red-500/20"><AlertCircle className="w-5 h-5" /></div>
              <div><p className="text-xs text-slate-400">Open</p><p className="text-xl font-bold text-white">{stats.overall?.open || 0}</p></div>
            </div>
            <div 
              className={`bg-coc-card p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-colors ${showResolved ? 'border-green-500 bg-green-500/10' : 'border-coc-border hover:border-green-500/50'}`}
              onClick={() => {
                setShowResolved(!showResolved);
                setSelectedIncident(null);
              }}
            >
              <div className="p-2.5 bg-green-500/10 rounded-lg text-green-500 border border-green-500/20"><CheckCircle2 className="w-5 h-5" /></div>
              <div><p className="text-xs text-slate-400">{showResolved ? 'Showing Resolved' : 'View Resolved'}</p><p className="text-xl font-bold text-white">{stats.overall?.resolved || 0}</p></div>
            </div>
            <div className="bg-coc-card p-3 rounded-xl border border-coc-border flex items-center gap-3">
              <div className="p-2.5 bg-orange-500/10 rounded-lg text-orange-500 border border-orange-500/20"><Clock className="w-5 h-5" /></div>
              <div><p className="text-xs text-slate-400">SLA Breach</p><p className="text-xl font-bold text-white">{stats.overall?.slaBreached || 0}</p></div>
            </div>
            <div className="bg-coc-card p-3 rounded-xl border border-coc-border flex items-center gap-3">
              <div className="p-2.5 bg-purple-500/10 rounded-lg text-purple-500 border border-purple-500/20"><Users className="w-5 h-5" /></div>
              <div><p className="text-xs text-slate-400">Teams</p><p className="text-xl font-bold text-white">{teams.filter(t => t.status !== 'offline').length}</p></div>
            </div>
          </div>

          <div className="flex-1 bg-slate-900 rounded-xl border border-coc-border overflow-hidden relative isolate">
            <MapContainer center={VIZAG_CENTER} zoom={12} style={{ height: '100%', width: '100%' }} className="z-0" ref={mapRef}>
              <MapUpdater center={detailData?.location?.coordinates ? [detailData.location.coordinates[1], detailData.location.coordinates[0]] : null} />
              <LayersControl position="topright">
                <BaseLayer checked name="Street View (Bright Labels)">
                  <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" attribution='&copy; OpenStreetMap &copy; CARTO' />
                </BaseLayer>
                <BaseLayer name="Dark Mode">
                  <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution='&copy; OpenStreetMap &copy; CARTO' />
                </BaseLayer>
                <BaseLayer name="Satellite view">
                  <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="Tiles &copy; Esri" />
                </BaseLayer>
              </LayersControl>
              
              {visibleIncidents.map(inc => {
                const pv = getPriorityVisuals(inc.priorityScore, inc.urgency);
                const isResolved = inc.status === 'resolved_verified';
                
                return (
                  <CircleMarker key={inc._id} center={[inc.location.coordinates[1], inc.location.coordinates[0]]}
                    radius={isResolved ? 8 : pv.radius} 
                    pathOptions={{ 
                      color: isResolved ? '#22c55e' : pv.stroke, 
                      fillColor: isResolved ? '#166534' : pv.fill, 
                      fillOpacity: isResolved ? 0.8 : pv.opacity, 
                      weight: 2 
                    }}
                    eventHandlers={{ click: () => loadDetail(inc._id) }}>
                    <Popup>
                      <div className="p-1 min-w-[180px]">
                        <div className="flex items-center justify-between mb-1 border-b pb-1">
                          <span className="font-bold text-sm capitalize">{inc.category || 'General'}</span>
                          <span className={`text-[10px] uppercase px-1 py-0.5 rounded font-bold ${inc.urgency === 'critical' ? 'bg-red-100 text-red-700' : inc.urgency === 'high' ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'}`}>{inc.urgency}</span>
                        </div>
                        <p className="text-[11px] text-gray-600">{inc.ward}</p>
                        <p className="text-[11px] text-gray-800 font-medium">Dept: {inc.department?.name || '—'}</p>
                        <p className="text-[11px] text-gray-800 font-medium">Team: {inc.assignedTeam?.name || 'Pending'}</p>
                        <p className="text-[10px] mt-1">Priority: <strong>{inc.priorityScore}</strong> {inc.occurrenceCount > 1 ? `• ×${inc.occurrenceCount}` : ''}</p>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
              {teams.filter(t => t.location?.coordinates && t.status !== 'offline').map(team => (
                <Marker key={team._id} position={[team.location.coordinates[1], team.location.coordinates[0]]} icon={teamIcon} zIndexOffset={1000}>
                  <Popup><div className="p-1"><h4 className="font-bold text-sm">{team.name}</h4><p className="text-xs text-gray-600">{team.department?.name}</p><span className={`text-[10px] px-1 py-0.5 rounded uppercase font-bold ${team.status === 'available' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>{team.status}</span></div></Popup>
                </Marker>
              ))}
            </MapContainer>
            {/* Legend */}
            <div className="absolute bottom-3 left-3 z-[1000] bg-slate-900/90 backdrop-blur border border-slate-700 rounded-lg p-2.5 text-[10px] text-slate-300">
              <p className="font-semibold text-white mb-1.5">Legend</p>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5"><div className="w-3.5 h-3.5 rounded-full bg-red-500"></div>Critical</div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-orange-500"></div>High</div>
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-yellow-500"></div>Medium</div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-500"></div>Low</div>
                <div className="flex items-center gap-1.5 border-t border-slate-700 pt-1 mt-1"><div className="w-3 h-3 rounded bg-purple-600"></div>Team</div>
              </div>
              <p className="text-slate-500 mt-1">Bigger = Higher Priority</p>
            </div>
          </div>
        </div>
      </div>

      {/* Toasts */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {toasts.map(t => (
          <div key={t.id} className={`px-4 py-3 rounded-lg shadow-xl border flex items-center gap-3 animate-slide-in ${t.type === 'error' ? 'bg-red-900/90 border-red-500/50 text-white' : 'bg-slate-800/90 border-brand-500/50 text-white'}`}>
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm font-medium break-words">{t.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
