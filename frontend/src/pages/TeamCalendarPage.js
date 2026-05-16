import React, { useState, useEffect, useMemo } from 'react';
import api, { formatApiError } from '../lib/api';
import DashboardLayout from '../components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  CalendarDays, ChevronLeft, ChevronRight, RefreshCw, Loader2,
  Users, PartyPopper, UserMinus, Star,
} from 'lucide-react';
import { toast } from 'sonner';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const LEAVE_COLOR = {
  annual: 'bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30',
  sick: 'bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30',
  casual: 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30',
  earned: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  default: 'bg-gray-500/20 text-gray-700 dark:text-gray-300 border-gray-500/30',
};

function fmtDate(d) { return d.toISOString().slice(0, 10); }
function parseDate(s) { return new Date(`${s}T00:00:00`); }

export default function TeamCalendarPage() {
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);

  const monthStart = useMemo(() => new Date(cursor.getFullYear(), cursor.getMonth(), 1), [cursor]);
  const monthEnd   = useMemo(() => new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0), [cursor]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/leaves/calendar?start=${fmtDate(monthStart)}&end=${fmtDate(monthEnd)}`);
      setData(data);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [cursor]);

  // Build a 6-week grid (Sunday-start) covering the month
  const grid = useMemo(() => {
    const start = new Date(monthStart);
    start.setDate(start.getDate() - start.getDay()); // back to Sunday
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [monthStart]);

  const today = fmtDate(new Date());
  const byDay = data?.by_day || {};
  const inCurMonth = (d) => d.getMonth() === cursor.getMonth();

  const navMonth = (delta) => {
    const d = new Date(cursor);
    d.setMonth(d.getMonth() + delta);
    setCursor(d);
    setSelectedDay(null);
  };

  const selectedInfo = selectedDay ? byDay[selectedDay] : null;

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="team-calendar-page">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <CalendarDays className="w-6 h-6 text-primary" />
              <h1 className="text-2xl font-bold tracking-tight">Team Time-Off Calendar</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Plan around your team's approved leaves and company holidays at a glance.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} data-testid="refresh-btn">
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </div>

        {/* Summary cards */}
        {data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">On Leave Today</p>
                  <p className="text-3xl font-bold text-red-600" data-testid="stat-today">{data.summary.total_employees_on_leave_today}</p>
                </div>
                <UserMinus className="w-8 h-8 opacity-20 text-red-600" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Upcoming Days Off</p>
                  <p className="text-3xl font-bold">{data.summary.upcoming_leave_days}</p>
                </div>
                <CalendarDays className="w-8 h-8 opacity-20" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Holidays in View</p>
                  <p className="text-3xl font-bold text-emerald-600">{data.summary.holidays_in_range}</p>
                </div>
                <PartyPopper className="w-8 h-8 opacity-20 text-emerald-600" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Total Events</p>
                  <p className="text-3xl font-bold">{data.events.length}</p>
                </div>
                <Users className="w-8 h-8 opacity-20" />
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendar grid */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{MONTH_NAMES[cursor.getMonth()]} {cursor.getFullYear()}</CardTitle>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => navMonth(-1)} data-testid="prev-month">
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); }} data-testid="today-btn">
                    Today
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => navMonth(1)} data-testid="next-month">
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="py-16 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-7 mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {DAY_LABELS.map(l => <div key={l} className="text-center py-1">{l}</div>)}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {grid.map((d, i) => {
                      const iso = fmtDate(d);
                      const info = byDay[iso];
                      const isCur = inCurMonth(d);
                      const isToday = iso === today;
                      const isSel = iso === selectedDay;
                      const hasHoliday = info?.holidays?.length > 0;
                      const hasLeaves = info?.leaves?.length > 0;
                      return (
                        <button
                          key={i}
                          onClick={() => setSelectedDay(iso)}
                          className={`relative min-h-[78px] p-1.5 rounded-md border text-left transition-all ${
                            !isCur ? 'opacity-30 border-transparent' :
                            isSel ? 'border-primary ring-1 ring-primary' :
                            isToday ? 'border-primary/50 bg-primary/5' :
                            'border-border hover:border-primary/40'
                          } ${hasHoliday ? 'bg-emerald-500/5' : ''}`}
                          data-testid={`day-${iso}`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-xs font-semibold ${isToday ? 'text-primary' : ''}`}>{d.getDate()}</span>
                            {hasHoliday && <Star className="w-3 h-3 text-emerald-600 fill-emerald-600" />}
                          </div>
                          <div className="space-y-0.5">
                            {hasHoliday && info.holidays.slice(0, 1).map((h, j) => (
                              <div key={`h-${j}`} className="text-[10px] truncate px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                                🎉 {h.name}
                              </div>
                            ))}
                            {hasLeaves && info.leaves.slice(0, 2).map((l, j) => (
                              <div key={`l-${j}`} className={`text-[10px] truncate px-1 py-0.5 rounded border ${LEAVE_COLOR[l.leave_type] || LEAVE_COLOR.default}`}
                                title={`${l.employee_name} (${l.leave_type})`}>
                                {l.employee_name?.split(' ')[0] || 'Emp'}
                              </div>
                            ))}
                            {hasLeaves && info.leaves.length > 2 && (
                              <div className="text-[10px] text-muted-foreground px-1">+{info.leaves.length - 2} more</div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-500/30 border border-blue-500/50" /> Annual</span>
                    <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500/30 border border-red-500/50" /> Sick</span>
                    <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-500/30 border border-amber-500/50" /> Casual</span>
                    <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500/30 border border-emerald-500/50" /> Holiday</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Side panel — Today / Selected day */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{selectedDay ? `Selected: ${selectedDay}` : `Today: ${today}`}</CardTitle>
                <CardDescription>
                  {selectedDay ? 'Tap a day on the calendar to inspect events' : 'People & holidays for today'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(() => {
                  const info = selectedInfo || byDay[today];
                  if (!info || (!info.leaves?.length && !info.holidays?.length)) {
                    return <p className="text-sm text-muted-foreground">No events on this day. Everyone's at work! 💪</p>;
                  }
                  return (
                    <div className="space-y-3">
                      {info.holidays?.map((h, i) => (
                        <div key={`h-${i}`} className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5" data-testid="holiday-item">
                          <div className="flex items-center gap-2">
                            <PartyPopper className="w-4 h-4 text-emerald-600" />
                            <span className="font-semibold">{h.name}</span>
                            {h.is_optional && <Badge variant="outline" className="text-xs">Optional</Badge>}
                          </div>
                        </div>
                      ))}
                      {info.leaves?.length > 0 && (
                        <div>
                          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">On Leave ({info.leaves.length})</p>
                          <div className="space-y-2">
                            {info.leaves.map((l, i) => (
                              <div key={`l-${i}`} className={`p-2 rounded-lg border ${LEAVE_COLOR[l.leave_type] || LEAVE_COLOR.default}`} data-testid="leave-item">
                                <div className="flex items-center justify-between">
                                  <span className="font-medium text-sm">{l.employee_name || l.employee_id}</span>
                                  <Badge variant="secondary" className="text-xs capitalize">{l.leave_type}</Badge>
                                </div>
                                <p className="text-xs mt-1 opacity-80">{l.start_date} → {l.end_date} ({l.days}d)</p>
                                {l.reason && <p className="text-xs italic opacity-70 mt-1">"{l.reason}"</p>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Upcoming This Month</CardTitle>
              </CardHeader>
              <CardContent>
                {data?.events?.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No upcoming events.</p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {(data?.events || [])
                      .filter(e => (e.type === 'holiday' ? e.date >= today : e.end_date >= today))
                      .sort((a, b) => (a.start_date || a.date).localeCompare(b.start_date || b.date))
                      .slice(0, 8)
                      .map((e, i) => (
                        <div key={i} className="text-xs flex items-center gap-2 py-1 border-b border-border/50 last:border-0" data-testid="upcoming-item">
                          {e.type === 'holiday' ? (
                            <>
                              <PartyPopper className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span className="font-mono w-24 shrink-0">{e.date}</span>
                              <span className="truncate">{e.name}</span>
                            </>
                          ) : (
                            <>
                              <UserMinus className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              <span className="font-mono w-24 shrink-0">{e.start_date}</span>
                              <span className="truncate">{e.employee_name} · <span className="capitalize">{e.leave_type}</span></span>
                            </>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
