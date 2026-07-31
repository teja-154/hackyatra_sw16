import React, { useState, useRef } from 'react';
import { Camera, MapPin, CheckCircle, AlertCircle, Loader2, Phone } from 'lucide-react';
import { api } from '../../api/client.js';

const WARDS = [
  'Ward 1 - Gajuwaka', 'Ward 5 - MVP Colony', 'Ward 8 - Seethammadhara',
  'Ward 12 - Dwaraka Nagar', 'Ward 18 - Maddilapalem', 'Ward 22 - Akkayyapalem',
  'Ward 30 - Pendurthi', 'Ward 35 - Simhachalam',
];

export default function ReportForm() {
  const [step, setStep] = useState(1); // 1: form, 2: success
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const [formData, setFormData] = useState({
    description: '',
    phone: '',
    ward: '',
    photo: null,
    lat: null,
    lon: null,
  });

  const [photoPreview, setPhotoPreview] = useState(null);
  const [locating, setLocating] = useState(false);
  
  // Use a ref for idempotency key to prevent double submits
  const idempotencyKey = useRef(crypto.randomUUID());

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setError('Photo must be less than 5MB');
        return;
      }
      setFormData(prev => ({ ...prev, photo: file }));
      setPhotoPreview(URL.createObjectURL(file));
      setError(null);
    }
  };

  const getLocation = () => {
    setLocating(true);
    setError(null);
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      setLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFormData(prev => ({
          ...prev,
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        }));
        setLocating(false);
      },
      (err) => {
        setError('Failed to get location. Please ensure location services are enabled.');
        setLocating(false);
      }
    );
  };

  const getDemoLocation = () => {
    if (!formData.ward) {
      setError('Please select a ward first to get a realistic demo location.');
      return;
    }
    // Hardcoded Vizag ward centers for presentation
    const demoCoords = {
      'Ward 1 - Gajuwaka': { lat: 17.6900, lon: 83.2180 },
      'Ward 5 - MVP Colony': { lat: 17.7405, lon: 83.3330 },
      'Ward 8 - Seethammadhara': { lat: 17.7450, lon: 83.3150 },
      'Ward 12 - Dwaraka Nagar': { lat: 17.7280, lon: 83.3080 },
      'Ward 18 - Maddilapalem': { lat: 17.7340, lon: 83.3220 },
      'Ward 22 - Akkayyapalem': { lat: 17.7300, lon: 83.3030 },
      'Ward 30 - Pendurthi': { lat: 17.8200, lon: 83.2000 },
      'Ward 35 - Simhachalam': { lat: 17.7667, lon: 83.2500 }
    };
    const coords = demoCoords[formData.ward] || { lat: 17.6868, lon: 83.2185 }; // Fallback to Vizag center
    setFormData(prev => ({
      ...prev,
      lat: coords.lat,
      lon: coords.lon,
    }));
    setError(null);
  };

  // Phone validation — only allow digits, max 10
  const handlePhoneChange = (e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 10);
    setFormData(prev => ({ ...prev, phone: val }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    
    if (formData.description.trim().length < 5) {
      setError('Description must be at least 5 characters');
      return;
    }
    if (!formData.ward) {
      setError('Please select a ward');
      return;
    }
    if (formData.lat == null || formData.lon == null) {
      setError('Please provide your location');
      return;
    }
    // Phone is mandatory now
    if (!formData.phone || formData.phone.length !== 10) {
      setError('Please enter a valid 10-digit phone number');
      return;
    }

    setLoading(true);

    try {
      let photoUrl = null;
      if (formData.photo) {
        const uploadRes = await api.upload(formData.photo);
        photoUrl = uploadRes.url;
      }

      const res = await api.post('/complaints', {
        description: formData.description,
        phone: formData.phone,
        ward: formData.ward,
        lat: formData.lat,
        lon: formData.lon,
        photo_url: photoUrl,
        idempotency_key: idempotencyKey.current,
      });

      setResult(res);
      setStep(2);
      // Reset idempotency key for next possible submission
      idempotencyKey.current = crypto.randomUUID();
    } catch (err) {
      setError(err.message || 'Failed to submit complaint');
    } finally {
      setLoading(false);
    }
  };

  if (step === 2 && result) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-6">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Issue Reported!</h1>
          <p className="text-slate-600 mb-4">
            Your complaint has been logged and assigned to <strong>{result.department}</strong>.
          </p>
          
          {result.assigned_team && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 mb-4 flex items-center gap-3">
              <div className="bg-purple-100 p-2 rounded-lg">
                <MapPin className="w-5 h-5 text-purple-600" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-purple-800">Nearest team auto-assigned!</p>
                <p className="text-xs text-purple-600">{result.assigned_team} is on the way</p>
              </div>
            </div>
          )}

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6 text-left">
            <p className="text-sm text-slate-500 mb-1">Tracking ID</p>
            <p className="font-mono text-lg font-medium text-slate-800 break-all">{result.id}</p>
          </div>

          <p className="text-sm text-slate-500 mb-6">
            You can track your complaint status using this ID or your phone number.
          </p>

          <div className="flex gap-4">
            <a href="/track" className="flex-1 py-3 px-4 border border-brand-500 text-brand-600 font-medium rounded-xl hover:bg-brand-50 transition-colors">
              Track Status
            </a>
            <button 
              onClick={() => {
                setStep(1);
                setFormData({ description: '', phone: '', ward: '', photo: null, lat: null, lon: null });
                setPhotoPreview(null);
                setResult(null);
              }}
              className="flex-1 py-3 px-4 bg-brand-600 text-white font-medium rounded-xl hover:bg-brand-700 transition-colors"
            >
              Report Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex py-8 px-4 justify-center">
      <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8 max-w-md w-full h-fit">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">Report Civic Issue</h1>
        <p className="text-slate-500 mb-6">Help keep Visakhapatnam clean and safe.</p>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl flex items-start gap-3 mb-6 border border-red-100">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Photo Upload */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Photo (Optional)</label>
            {photoPreview ? (
              <div className="relative rounded-xl overflow-hidden bg-slate-100 aspect-video">
                <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                <button 
                  type="button" 
                  onClick={() => { setPhotoPreview(null); setFormData(prev => ({ ...prev, photo: null })); }}
                  className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-2 hover:bg-black/70"
                >
                  ✕
                </button>
              </div>
            ) : (
              <label className="border-2 border-dashed border-slate-300 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:border-brand-500 hover:bg-brand-50 transition-colors">
                <Camera className="w-8 h-8 text-slate-400 mb-2" />
                <span className="text-sm text-slate-600 font-medium">Tap to take photo</span>
                <input type="file" accept="image/jpeg, image/png" className="hidden" onChange={handlePhotoChange} />
              </label>
            )}
          </div>

          {/* Phone — now mandatory */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Phone Number *</label>
            <div className="relative">
              <Phone className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input 
                type="tel"
                inputMode="numeric"
                value={formData.phone}
                onChange={handlePhoneChange}
                placeholder="10-digit number"
                maxLength={10}
                className="w-full border-2 border-slate-200 rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-brand-500 text-slate-700 tracking-wider"
                required
              />
            </div>
            {formData.phone && formData.phone.length < 10 && (
              <p className="text-xs text-orange-500 mt-1">{10 - formData.phone.length} digits remaining</p>
            )}
            {formData.phone.length === 10 && (
              <p className="text-xs text-green-600 mt-1 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Valid phone number</p>
            )}
          </div>

          {/* Ward */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Ward *</label>
            <select 
              value={formData.ward} 
              onChange={e => setFormData(prev => ({ ...prev, ward: e.target.value }))}
              className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-brand-500 text-slate-700"
              required
            >
              <option value="">Select your ward</option>
              {WARDS.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Location *</label>
            {formData.lat ? (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl flex items-center gap-2">
                <CheckCircle className="w-5 h-5" />
                <span className="text-sm font-medium">Location captured</span>
              </div>
            ) : (
              <div className="flex gap-2">
                <button 
                  type="button" 
                  onClick={getLocation}
                  disabled={locating}
                  className="flex-1 border-2 border-slate-200 rounded-xl px-4 py-3 flex items-center justify-center gap-2 text-slate-700 font-medium hover:border-slate-300 hover:bg-slate-50 transition-colors disabled:opacity-50"
                  title="Real GPS for genuine reports"
                >
                  {locating ? <Loader2 className="w-5 h-5 animate-spin" /> : <MapPin className="w-5 h-5" />}
                  {locating ? 'Finding...' : 'Get GPS Location'}
                </button>
                <button 
                  type="button" 
                  onClick={getDemoLocation}
                  disabled={locating}
                  className="flex-1 border-2 border-brand-200 bg-brand-50 rounded-xl px-4 py-3 flex items-center justify-center gap-2 text-brand-700 font-medium hover:border-brand-300 hover:bg-brand-100 transition-colors disabled:opacity-50"
                  title="Mocks GPS to match selected ward for presentations"
                >
                  <MapPin className="w-5 h-5" />
                  Use Demo Location
                </button>
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Description *</label>
            <textarea 
              value={formData.description}
              onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="E.g., Large pothole near the bus stop causing traffic..."
              className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-brand-500 h-28 resize-none text-slate-700"
              required
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-4 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-4"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
            {loading ? 'Submitting...' : 'Submit Report'}
          </button>
        </form>
        
        <div className="mt-6 text-center">
          <a href="/track" className="text-brand-600 hover:underline font-medium text-sm">
            Already reported? Track status
          </a>
        </div>
      </div>
    </div>
  );
}
