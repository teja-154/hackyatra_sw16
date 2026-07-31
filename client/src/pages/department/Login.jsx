import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import { AlertCircle, Lock, Users, Loader2 } from 'lucide-react';

export default function Login() {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    code: '',
    pin: '',
  });

  useEffect(() => {
    api.get('/auth/departments')
      .then(setDepartments)
      .catch(() => setError('Failed to load departments. Please refresh.'));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!formData.code || !formData.pin) {
      setError('Please select a department and enter your PIN');
      return;
    }

    setLoading(true);

    try {
      const res = await api.post('/auth/login', formData);
      localStorage.setItem('coc_token', res.token);
      localStorage.setItem('coc_dept', JSON.stringify(res.department));
      navigate('/dept/queue');
    } catch (err) {
      setError(err.message || 'Invalid PIN or department code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-coc-bg flex items-center justify-center p-4">
      <div className="bg-coc-card border border-coc-border rounded-2xl shadow-2xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-brand-500/10 border border-brand-500/20 rounded-2xl flex items-center justify-center mb-4">
            <Lock className="w-8 h-8 text-brand-500" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Manager Login</h1>
          <p className="text-slate-400">Access your department queue</p>
        </div>

        {error && (
          <div className="bg-red-900/50 text-red-200 p-4 rounded-xl flex items-start gap-3 mb-6 border border-red-500/30">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Department</label>
            <div className="relative">
              <Users className="w-5 h-5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={formData.code}
                onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value }))}
                className="w-full bg-slate-800 border-2 border-slate-700 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-brand-500 appearance-none"
              >
                <option value="" disabled>Select department</option>
                {departments.map(d => (
                  <option key={d.code} value={d.code}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">PIN</label>
            <div className="relative">
              <Lock className="w-5 h-5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={formData.pin}
                onChange={(e) => setFormData(prev => ({ ...prev, pin: e.target.value }))}
                placeholder="Enter PIN (1234)"
                className="w-full bg-slate-800 border-2 border-slate-700 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-brand-500 placeholder:text-slate-600"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-brand-600 hover:bg-brand-500 text-white font-bold rounded-xl shadow-lg shadow-brand-500/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
