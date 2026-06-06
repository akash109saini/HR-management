import React, { useState, useCallback } from 'react';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

/* ─── Constants ─────────────────────────────────────────── */
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

const STATUS_META = {
  P:   { label: 'Present',   short: 'P',   bg: '#d4edda', color: '#155724', border: '#b8dac1' },
  AA:  { label: 'Absent',    short: 'AA',  bg: '#f8d7da', color: '#721c24', border: '#f1aeb5' },
  AHD: { label: 'Half Day',  short: 'AHD', bg: '#fff3cd', color: '#856404', border: '#ffda6a' },
  WO:  { label: 'Week Off',  short: 'WO',  bg: '#e2e3e5', color: '#495057', border: '#c4c8cb' },
  H:   { label: 'Holiday',   short: 'H',   bg: '#cce5ff', color: '#004085', border: '#9ec5fe' },
};

function statusMeta(s) {
  return STATUS_META[s] || { label: s || '-', short: s || '-', bg: '#f8f9fa', color: '#6c757d', border: '#dee2e6' };
}

/* ─── Export to Excel (CSV-based, no library needed) ───── */
function exportToExcel(rows, employeeName, month) {
  const headers = ['Date','Week Day','Shift Time','In Time','Out Time','Working Hours','Late By','Early By','Status'];
  const csvRows = [
    headers.join(','),
    ...rows.map(r => [
      r.display_date, r.weekday, r.shift_time,
      r.in_time, r.out_time, r.working_hour,
      r.late_by, r.early_by, statusMeta(r.status).label,
    ].map(v => `"${v || '-'}"`).join(','))
  ];
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `Attendance_${employeeName.replace(/\s+/g,'_')}_${month}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─── Component ─────────────────────────────────────────── */
export default function AttendanceCalendar({ userRole, employees = [] }) {
  const { user } = useAuth();
  const userPermissions = user?.permissions || [];
  const isHR = userRole === 'hr_manager' || userRole === 'super_admin' || userPermissions.includes('attendance');

  const now     = new Date();
  const [month, setMonth]   = useState(now.getMonth() + 1);   // 1-12
  const [year,  setYear]    = useState(now.getFullYear());
  const [empId, setEmpId]   = useState('');
  const [empSearch, setEmpSearch] = useState('');
  const [data,  setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const handleGet = useCallback(async () => {
    setLoading(true);
    setError('');
    setData(null);
    try {
      const monthStr = `${year}-${String(month).padStart(2, '0')}`;
      let url = `/attendance/calendar?month=${monthStr}`;
      if (isHR && empId) {
        url += `&employee_id=${empId}`;
      }
      const res = await api.get(url);
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load attendance calendar');
    }
    setLoading(false);
  }, [month, year, empId, isHR]);

  /* summary counts */
  const summary = data?.rows?.reduce((acc, r) => {
    const s = r.status || 'AA';
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  const yearOptions = [];
  for (let y = now.getFullYear() - 3; y <= now.getFullYear() + 1; y++) yearOptions.push(y);

  return (
    <div style={{ fontFamily: "'Inter', 'Outfit', sans-serif" }}>

      {/* ── Filter Bar ── */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10,
        background: 'var(--card, #fff)', borderRadius: 10,
        padding: '14px 20px', marginBottom: 20,
        border: '1px solid var(--border, #e5e7eb)',
        boxShadow: '0 1px 4px rgba(0,0,0,.06)',
      }}>
        <span style={{ fontWeight: 600, fontSize: 14, marginRight: 4, color: 'var(--foreground)' }}>Month</span>
        <select
          value={month}
          onChange={e => setMonth(Number(e.target.value))}
          style={selectStyle}
          id="cal-month"
        >
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>

        <span style={{ fontWeight: 600, fontSize: 14, marginRight: 4, color: 'var(--foreground)' }}>Year</span>
        <select
          value={year}
          onChange={e => setYear(Number(e.target.value))}
          style={selectStyle}
          id="cal-year"
        >
          {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        {isHR && employees.length > 0 && (() => {
          const filteredEmployees = employees.filter(emp => {
            const term = empSearch.toLowerCase();
            return (
              emp.name?.toLowerCase().includes(term) ||
              (emp.employee_id || emp.id)?.toLowerCase().includes(term) ||
              (emp.biometric_pin && String(emp.biometric_pin).toLowerCase().includes(term))
            );
          });
          return (
            <>
              <span style={{ fontWeight: 600, fontSize: 14, marginRight: 4, color: 'var(--foreground)' }}>Search Employee</span>
              <input
                type="text"
                placeholder="Search name, ID or PIN..."
                value={empSearch}
                onChange={e => setEmpSearch(e.target.value)}
                style={{
                  ...selectStyle,
                  minWidth: 160,
                  padding: '6px 10px',
                }}
                id="cal-employee-search"
              />

              <span style={{ fontWeight: 600, fontSize: 14, marginRight: 4, color: 'var(--foreground)' }}>Employee</span>
              <select
                value={empId}
                onChange={e => setEmpId(e.target.value)}
                style={{ ...selectStyle, minWidth: 200 }}
                id="cal-employee"
              >
                <option value="">— Select Employee —</option>
                {filteredEmployees.map(emp => (
                  <option key={emp.employee_id || emp.id} value={emp.employee_id || emp.id}>
                    {emp.name} ({emp.employee_id || emp.id})
                  </option>
                ))}
              </select>
            </>
          );
        })()}

        <button
          onClick={handleGet}
          disabled={loading}
          style={btnPrimary}
          id="cal-get-btn"
        >
          {loading ? '⏳ Loading…' : 'Get'}
        </button>

        {data && (
          <button
            onClick={() => exportToExcel(data.rows, data.employee_name, data.month)}
            style={btnSuccess}
            id="cal-export-btn"
          >
            📥 Export To Excel
          </button>
        )}
      </div>

      {error && (
        <div style={{ padding: '10px 16px', background: '#f8d7da', color: '#721c24', borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
          ⚠ {error}
        </div>
      )}

      {/* ── Legend & Summary ── */}
      {data && (
        <>
          {/* Employee Info */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center',
            marginBottom: 14, padding: '10px 18px',
            background: 'var(--card, #fff)',
            border: '1px solid var(--border, #e5e7eb)', borderRadius: 10,
            boxShadow: '0 1px 4px rgba(0,0,0,.05)',
          }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{data.employee_name}</span>
            <span style={{ fontSize: 13, color: '#6c757d' }}>{data.employee_id}</span>
            <span style={{
              fontSize: 12, padding: '2px 10px', borderRadius: 99,
              background: '#e8f4fd', color: '#0c63e4', fontWeight: 600,
            }}>
              🕐 Shift: {data.shift_time}
            </span>

            {/* Summary chips */}
            {summary && Object.entries(STATUS_META).map(([key, meta]) => {
              const count = summary[key] || 0;
              if (count === 0) return null;
              return (
                <span key={key} style={{
                  fontSize: 12, padding: '3px 10px', borderRadius: 99,
                  background: meta.bg, color: meta.color,
                  border: `1px solid ${meta.border}`, fontWeight: 600,
                }}>
                  {meta.label}: {count}
                </span>
              );
            })}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {Object.entries(STATUS_META).map(([key, meta]) => (
              <span key={key} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 12, padding: '3px 10px', borderRadius: 6,
                background: meta.bg, color: meta.color,
                border: `1px solid ${meta.border}`, fontWeight: 600,
              }}>
                <span style={{
                  display: 'inline-block', width: 10, height: 10, borderRadius: 2,
                  background: meta.color, opacity: 0.7,
                }} />
                {meta.short} – {meta.label}
              </span>
            ))}
          </div>

          {/* ── Table ── */}
          <div style={{ overflowX: 'auto', borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,.08)', border: '1px solid #dee2e6' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr>
                  {['Date','Week Day','Shift Time','In Time','Out Time','Working Hours','Late By','Early By','Status'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, idx) => {
                  const meta = statusMeta(row.status);
                  const rowBg = meta.bg;
                  const rowColor = meta.color;
                  const isToday = row.is_today;

                  return (
                    <tr
                      key={row.date}
                      style={{
                        background: rowBg,
                        borderBottom: '1px solid rgba(0,0,0,.05)',
                        outline: isToday ? '2px solid #0d6efd' : 'none',
                        outlineOffset: isToday ? '-2px' : undefined,
                        transition: 'filter .15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.filter = 'brightness(0.94)'}
                      onMouseLeave={e => e.currentTarget.style.filter = ''}
                    >
                      <td style={{ ...tdStyle, fontWeight: isToday ? 700 : 600, color: rowColor }}>
                        {row.display_date}
                        {isToday && <span style={{ marginLeft: 5, fontSize: 10, background: '#0d6efd', color: '#fff', borderRadius: 4, padding: '1px 5px' }}>Today</span>}
                      </td>
                      <td style={{ ...tdStyle, color: rowColor }}>{row.weekday}</td>
                      <td style={{ ...tdStyle, color: rowColor, fontFamily: 'monospace' }}>{row.shift_time}</td>
                      <td style={{ ...tdStyle, color: rowColor, fontFamily: 'monospace' }}>{row.in_time}</td>
                      <td style={{ ...tdStyle, color: rowColor, fontFamily: 'monospace' }}>{row.out_time}</td>
                      <td style={{ ...tdStyle, color: rowColor, fontFamily: 'monospace' }}>{row.working_hour}</td>
                      <td style={{ ...tdStyle, color: row.late_by !== '-' ? '#c0392b' : rowColor, fontWeight: row.late_by !== '-' ? 700 : 400 }}>
                        {row.late_by}
                      </td>
                      <td style={{ ...tdStyle, color: row.early_by !== '-' ? '#e67e22' : rowColor, fontWeight: row.early_by !== '-' ? 700 : 400 }}>
                        {row.early_by}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '3px 12px',
                          borderRadius: 99,
                          fontWeight: 700,
                          fontSize: 12,
                          background: 'rgba(0,0,0,.10)',
                          color: rowColor,
                          letterSpacing: .5,
                        }}>
                          {meta.short}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Empty state */}
      {!data && !loading && !error && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '56px 20px', color: '#adb5bd',
          border: '2px dashed #dee2e6', borderRadius: 12,
        }}>
          <span style={{ fontSize: 48, marginBottom: 12 }}>📅</span>
          <p style={{ fontWeight: 600, fontSize: 15 }}>Select a month and year, then click <strong>Get</strong></p>
          <p style={{ fontSize: 13 }}>The full attendance calendar will appear here</p>
        </div>
      )}
    </div>
  );
}

/* ─── Inline styles ────────────────────────────────────── */
const selectStyle = {
  padding: '6px 12px', borderRadius: 7, fontSize: 13.5,
  border: '1.5px solid var(--border, #d1d5db)',
  background: 'var(--background, #fff)',
  color: 'var(--foreground)',
  outline: 'none', cursor: 'pointer',
};

const btnPrimary = {
  padding: '7px 20px', borderRadius: 8, fontWeight: 600, fontSize: 13.5,
  background: '#0d6efd', color: '#fff', border: 'none', cursor: 'pointer',
  transition: 'background .2s',
};

const btnSuccess = {
  padding: '7px 20px', borderRadius: 8, fontWeight: 600, fontSize: 13.5,
  background: '#198754', color: '#fff', border: 'none', cursor: 'pointer',
  transition: 'background .2s',
};

const thStyle = {
  padding: '11px 14px', textAlign: 'left', fontWeight: 700,
  fontSize: 13, whiteSpace: 'nowrap',
  background: '#e8590c',        // Orange header matching the screenshot
  color: '#fff',
  borderBottom: '2px solid #c94a00',
  borderRight: '1px solid rgba(255,255,255,.15)',
};

const tdStyle = {
  padding: '9px 14px', whiteSpace: 'nowrap', fontSize: 13.5,
};
