import React, { useState, useEffect } from 'react';
import { api } from '../../api/client.js';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend, Cell } from 'recharts';
import { Activity, Clock, CheckCircle2, AlertTriangle, ArrowLeft } from 'lucide-react';

export default function Analytics() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/stats')
      .then(data => {
        setStats(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="min-h-screen bg-coc-bg flex items-center justify-center text-white"><div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full"></div></div>;
  if (error) return <div className="min-h-screen bg-coc-bg p-8 text-red-400">Error loading analytics: {error}</div>;

  return (
    <div className="min-h-screen bg-coc-bg text-coc-text p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <a href="/coc" className="p-2 bg-coc-card rounded-lg border border-coc-border hover:bg-slate-800 transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-300" />
          </a>
          <div>
            <h1 className="text-2xl font-bold text-white">System Analytics</h1>
            <p className="text-slate-400">Historical performance & ward health</p>
          </div>
        </div>

        {/* Top KPIs */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-coc-card p-6 rounded-xl border border-coc-border shadow-lg">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-500/10 rounded-lg"><Activity className="w-5 h-5 text-blue-500" /></div>
              <p className="text-slate-400 font-medium">Total Incidents</p>
            </div>
            <p className="text-3xl font-bold text-white">{stats.overall.total}</p>
          </div>
          <div className="bg-coc-card p-6 rounded-xl border border-coc-border shadow-lg">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-green-500/10 rounded-lg"><CheckCircle2 className="w-5 h-5 text-green-500" /></div>
              <p className="text-slate-400 font-medium">Resolved</p>
            </div>
            <p className="text-3xl font-bold text-white">{stats.overall.resolved}</p>
            <p className="text-xs text-green-400 mt-1">{Math.round((stats.overall.resolved / stats.overall.total) * 100) || 0}% resolution rate</p>
          </div>
          <div className="bg-coc-card p-6 rounded-xl border border-coc-border shadow-lg">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-orange-500/10 rounded-lg"><Clock className="w-5 h-5 text-orange-500" /></div>
              <p className="text-slate-400 font-medium">Avg Resolution Time</p>
            </div>
            <p className="text-3xl font-bold text-white">
              {stats.departments[0]?.avgResolutionMin 
                ? `${Math.round(stats.departments[0].avgResolutionMin)}m` 
                : 'N/A'}
            </p>
            <p className="text-xs text-slate-500 mt-1">Best: {stats.departments[0]?.department || 'None'}</p>
          </div>
          <div className="bg-coc-card p-6 rounded-xl border border-coc-border shadow-lg">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-red-500/10 rounded-lg"><AlertTriangle className="w-5 h-5 text-red-500" /></div>
              <p className="text-slate-400 font-medium">SLA Breaches</p>
            </div>
            <p className="text-3xl font-bold text-white">{stats.overall.slaBreached}</p>
          </div>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-2 gap-6">
          
          {/* Ward Open/Resolved Chart */}
          <div className="bg-coc-card p-6 rounded-xl border border-coc-border shadow-lg h-96">
            <h3 className="text-lg font-semibold text-white mb-6">Ward Health (Open vs Resolved)</h3>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.wards} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="_id" stroke="#94a3b8" tick={{ fontSize: 11 }} tickMargin={10} axisLine={false} tickLine={false} />
                <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <RechartsTooltip cursor={{ fill: '#334155', opacity: 0.4 }} contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#e2e8f0', borderRadius: '0.5rem' }} />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '10px' }} />
                <Bar dataKey="open" name="Open Incidents" stackId="a" fill="#3b82f6" radius={[0, 0, 4, 4]} />
                <Bar dataKey="resolved" name="Resolved" stackId="a" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Department Resolution Time Chart */}
          <div className="bg-coc-card p-6 rounded-xl border border-coc-border shadow-lg h-96">
            <h3 className="text-lg font-semibold text-white mb-6">Dept Avg Resolution Time (Minutes)</h3>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.departments} layout="vertical" margin={{ top: 10, right: 30, left: 30, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                <XAxis type="number" stroke="#94a3b8" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis dataKey="department" type="category" stroke="#94a3b8" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={120} />
                <RechartsTooltip cursor={{ fill: '#334155', opacity: 0.4 }} contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#e2e8f0', borderRadius: '0.5rem' }} />
                <Bar dataKey="avgResolutionMin" name="Avg Minutes" fill="#a855f7" radius={[0, 4, 4, 0]}>
                  {stats.departments.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === 0 ? '#22c55e' : index === stats.departments.length - 1 ? '#ef4444' : '#a855f7'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

        </div>
      </div>
    </div>
  );
}
