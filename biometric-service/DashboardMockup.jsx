import React, { useEffect, useState } from 'react';

const VERIFICATION_ICONS = {
  face: '👤',
  fingerprint: '👆',
  card: '💳',
  password: '🔑',
  unknown: '❓'
};

export default function BiometricLiveDashboard() {
  const [punches, setPunches] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8080/ws/live-punches');

    ws.onopen = () => {
      setConnectionStatus('Connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // Process normalized data payload
        const newPunch = {
          id: Date.now(),
          userId: data.userId || 'N/A',
          name: data.name || 'Unknown User',
          time: data.time || new Date().toLocaleTimeString(),
          mode: data.verifyMode || 'unknown',
          status: data.status || 'check_in',
          source: data.source || 'device'
        };
        setPunches((prev) => [newPunch, ...prev].slice(0, 50));
      } catch (err) {
        console.error('Error parsing live log event:', err);
      }
    };

    ws.onclose = () => {
      setConnectionStatus('Disconnected');
    };

    return () => {
      ws.close();
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header Section */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
              Biometric Live Feed
            </h1>
            <p className="text-sm text-slate-400 mt-1">Real-time attendance monitor & device listener logs</p>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-3.5 h-3.5 rounded-full ${connectionStatus === 'Connected' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
            <span className="text-sm font-semibold tracking-wide text-slate-300">{connectionStatus}</span>
          </div>
        </div>

        {/* Dashboard Panels */}
        <div className="grid lg:grid-cols-3 gap-6">
          
          {/* Punch Stream Feed */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-2xl space-y-4">
            <h2 className="text-lg font-semibold text-slate-200">Live Attendance Events</h2>
            <div className="overflow-y-auto max-h-[600px] pr-2 space-y-3 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
              {punches.length === 0 ? (
                <div className="h-48 flex items-center justify-center border border-dashed border-slate-800 rounded-lg text-slate-500 text-sm">
                  Waiting for device logs...
                </div>
              ) : (
                punches.map((punch) => (
                  <div key={punch.id} className="flex items-center justify-between bg-slate-950 border border-slate-850 p-4 rounded-xl hover:border-slate-700 transition">
                    <div className="flex items-center gap-4">
                      <div className="text-2xl w-10 h-10 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center">
                        {VERIFICATION_ICONS[punch.mode] || VERIFICATION_ICONS.unknown}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-100">{punch.name}</p>
                        <p className="text-xs text-slate-400">UID: <span className="font-mono text-slate-300">{punch.userId}</span> | Via: {punch.mode}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-slate-200">{punch.time}</p>
                      <span className={`inline-block text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded mt-1 ${
                        punch.status === 'check_in' ? 'bg-emerald-950 text-emerald-400 border border-emerald-900' : 'bg-indigo-950 text-indigo-400 border border-indigo-900'
                      }`}>
                        {punch.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Quick Metrics & Info Panel */}
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-2xl">
              <h3 className="font-semibold text-slate-200 mb-4">Device Overview</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between border-b border-slate-850 pb-2">
                  <span className="text-slate-400">Machine Brand</span>
                  <span className="font-medium text-slate-200">Realtime Biometrics</span>
                </div>
                <div className="flex justify-between border-b border-slate-850 pb-2">
                  <span className="text-slate-400">Model</span>
                  <span className="font-medium text-slate-200">T304F+</span>
                </div>
                <div className="flex justify-between border-b border-slate-850 pb-2">
                  <span className="text-slate-400">TCP Port</span>
                  <span className="font-mono text-slate-200">5005</span>
                </div>
                <div className="flex justify-between pb-1">
                  <span className="text-slate-400">Webhook Endpoints</span>
                  <span className="font-mono text-slate-200">/api/biometric/webhook</span>
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
