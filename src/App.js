import React, { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const SHEET_API_URL = 'https://script.google.com/macros/s/AKfycbw5EF2qxIKlPIufd8Mhgv6AkYvy10tXkQMzQBnkuh_I5VicCfVtyvrl9MXSGEj51dLe/exec';

const NAVY = '#1a3c5e';
const GOLD = '#d4af37';
const ALERT = '#c0392b';
const SUCCESS = '#27ae60';
const GRAY = '#6c757d';
const LIGHT = '#f8f9fa';

const REASON_CATEGORIES = [
  'Military / PCS', 'Buying a home', 'Relocation / job', 'Cost / rent increase',
  'Maintenance issues', 'Owner selling property', 'Lease expiration', 'Personal / family',
  'Dissatisfied with management', 'Safety concerns', 'Other / unknown',
];

const CONTROLLABLE = new Set(['Cost / rent increase', 'Maintenance issues', 'Dissatisfied with management', 'Safety concerns']);

// Industry benchmarks (property management)
const BENCHMARKS = {
  googleRating: 4.2,       // typical PM industry average
  annualTurnoverRate: 50,  // % — industry avg annual turnover
  controllablePct: 35,     // % of moveouts typically preventable
};

const fmtDate = (d) => {
  const dt = new Date(d);
  if (isNaN(dt)) return '';
  return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const Dashboard = () => {
  const [raw, setRaw] = useState({ ntv: [], reviews: [], lastSync: null, loading: true, error: null });
  const [reviewStart, setReviewStart] = useState('');
  const [reviewEnd, setReviewEnd] = useState('');
  const [expandedReview, setExpandedReview] = useState(null);
  const [showAllReviews, setShowAllReviews] = useState(false);

  useEffect(() => {
    fetch(SHEET_API_URL)
      .then(r => r.json())
      .then(json => {
        if (json.error) throw new Error(json.error);
        setRaw({ ntv: json.ntv || [], reviews: json.reviews || [], lastSync: json.lastSync, loading: false, error: null });
      })
      .catch(err => setRaw(prev => ({ ...prev, loading: false, error: err.message })));
  }, []);

  const now = new Date();
  const sixAgo = new Date(now); sixAgo.setMonth(now.getMonth() - 6);
  const twelveAgo = new Date(now); twelveAgo.setFullYear(now.getFullYear() - 1);

  const ntvAll = raw.ntv.length;
  const ntv12mo = raw.ntv.filter(r => new Date(r.date) >= twelveAgo).length;
  const ntv6mo = raw.ntv.filter(r => new Date(r.date) >= sixAgo).length;

  const reasonCounts = useMemo(() => {
    const counts = {};
    REASON_CATEGORIES.forEach(c => { counts[c] = { all: 0, mo12: 0, mo6: 0 }; });
    raw.ntv.forEach(row => {
      const cat = REASON_CATEGORIES.includes(row.category) ? row.category : 'Other / unknown';
      const d = new Date(row.date);
      counts[cat].all++;
      if (d >= twelveAgo) counts[cat].mo12++;
      if (d >= sixAgo) counts[cat].mo6++;
    });
    return counts;
  }, [raw.ntv]);

  const totalAll = Object.values(reasonCounts).reduce((a, b) => a + b.all, 0);
  let ctrlCount = 0, unctrlCount = 0;
  REASON_CATEGORIES.forEach(cat => {
    const c = reasonCounts[cat].all;
    if (CONTROLLABLE.has(cat)) ctrlCount += c; else unctrlCount += c;
  });
  const ctrlPct = totalAll > 0 ? Math.round(ctrlCount / totalAll * 100) : 0;

  const reasonChartData = REASON_CATEGORIES.map(cat => ({
    name: cat.length > 16 ? cat.slice(0, 15) + '…' : cat,
    fullName: cat,
    count: reasonCounts[cat].all,
    controllable: CONTROLLABLE.has(cat),
  })).filter(d => d.count > 0).sort((a, b) => b.count - a.count);

  const quarterlyData = useMemo(() => {
    const qmap = {};
    raw.ntv.forEach(row => {
      const d = new Date(row.date);
      if (isNaN(d)) return;
      const yr = d.getFullYear();
      const q = Math.ceil((d.getMonth() + 1) / 3);
      const key = `${yr} Q${q}`;
      qmap[key] = (qmap[key] || 0) + 1;
    });
    return Object.keys(qmap).sort().map(key => ({ period: key, moveouts: qmap[key] }));
  }, [raw.ntv]);

  const filteredReviews = useMemo(() => {
    return raw.reviews.filter(r => {
      const d = new Date(r.date);
      if (isNaN(d)) return false;
      if (reviewStart && d < new Date(reviewStart)) return false;
      if (reviewEnd && d > new Date(reviewEnd)) return false;
      return true;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [raw.reviews, reviewStart, reviewEnd]);

  const avgRating = filteredReviews.length > 0
    ? (filteredReviews.reduce((a, b) => a + (parseFloat(b.stars) || 0), 0) / filteredReviews.length)
    : 0;

  const allTimeAvgRating = raw.reviews.length
    ? (raw.reviews.reduce((a, b) => a + (parseFloat(b.stars) || 0), 0) / raw.reviews.length)
    : 0;

  const ratingDistribution = useMemo(() => {
    const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    filteredReviews.forEach(r => {
      const s = Math.round(parseFloat(r.stars) || 0);
      if (dist[s] !== undefined) dist[s]++;
    });
    return [5, 4, 3, 2, 1].map(s => ({ stars: `${s}★`, count: dist[s] }));
  }, [filteredReviews]);

  const displayedReviews = showAllReviews ? filteredReviews : filteredReviews.slice(0, 8);

  if (raw.loading) {
    return (
      <div style={{ padding: '4rem', textAlign: 'center', color: GRAY, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        Loading dashboard...
      </div>
    );
  }

  if (raw.error) {
    return (
      <div style={{ padding: '4rem', textAlign: 'center', color: ALERT, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        Error loading data: {raw.error}
      </div>
    );
  }

  const cardStyle = { background: 'white', padding: '1.5rem', borderRadius: '10px', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' };
  const sectionHeaderStyle = { background: NAVY, color: 'white', padding: '0.85rem 1.25rem', fontWeight: 700, fontSize: '13px', letterSpacing: '0.03em', borderRadius: '10px 10px 0 0' };
  const panelStyle = { background: 'white', borderRadius: '10px', border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' };

  return (
    <div style={{ background: '#f4f5f7', minHeight: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ background: `linear-gradient(135deg, ${NAVY}, #0f2438)`, color: 'white', padding: '2rem 1.5rem', textAlign: 'center' }}>
        <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 800, letterSpacing: '0.01em' }}>MSPM MOVE-OUT &amp; REVIEWS DASHBOARD</h1>
        <p style={{ margin: '0.5rem 0 0 0', fontSize: '12px', opacity: 0.75 }}>
          Data synced daily 6 AM EST · Last sync: {raw.lastSync ? fmtDate(raw.lastSync) : '—'}
        </p>
      </div>

      <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '2rem 1.25rem 4rem' }}>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px', marginBottom: '1.5rem' }}>
          <div style={cardStyle}>
            <div style={{ fontSize: '12px', color: GRAY, marginBottom: '0.4rem' }}>Google Rating (all-time)</div>
            <div style={{ fontSize: '30px', fontWeight: 800, color: GOLD }}>{raw.reviews.length ? allTimeAvgRating.toFixed(1) : '—'} ★</div>
            <div style={{ fontSize: '11px', color: GRAY }}>{raw.reviews.length} reviews · benchmark {BENCHMARKS.googleRating}★</div>
          </div>
          <div style={cardStyle}>
            <div style={{ fontSize: '12px', color: GRAY, marginBottom: '0.4rem' }}>All-Time Move-Outs</div>
            <div style={{ fontSize: '30px', fontWeight: 800, color: NAVY }}>{ntvAll}</div>
            <div style={{ fontSize: '11px', color: GRAY }}>total submissions</div>
          </div>
          <div style={cardStyle}>
            <div style={{ fontSize: '12px', color: GRAY, marginBottom: '0.4rem' }}>Last 12 Months</div>
            <div style={{ fontSize: '30px', fontWeight: 800, color: NAVY }}>{ntv12mo}</div>
            <div style={{ fontSize: '11px', color: GRAY }}>vs industry ~{BENCHMARKS.annualTurnoverRate}% turnover</div>
          </div>
          <div style={cardStyle}>
            <div style={{ fontSize: '12px', color: GRAY, marginBottom: '0.4rem' }}>Last 6 Months</div>
            <div style={{ fontSize: '30px', fontWeight: 800, color: NAVY }}>{ntv6mo}</div>
            <div style={{ fontSize: '11px', color: GRAY }}>move-outs</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', marginBottom: '1.5rem' }}>
          <div style={{ ...cardStyle, background: '#fdecea', borderColor: '#f6cdc8' }}>
            <div style={{ fontSize: '12px', color: ALERT, fontWeight: 700, marginBottom: '0.4rem' }}>⚠ CONTROLLABLE FACTORS</div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: ALERT }}>{ctrlCount} <span style={{ fontSize: '15px', fontWeight: 600 }}>({ctrlPct}%)</span></div>
            <div style={{ fontSize: '11px', color: GRAY }}>
              Industry benchmark: ~{BENCHMARKS.controllablePct}% preventable
              {ctrlPct > BENCHMARKS.controllablePct ? ` · ${ctrlPct - BENCHMARKS.controllablePct}pt above benchmark` : ` · ${BENCHMARKS.controllablePct - ctrlPct}pt below benchmark`}
            </div>
          </div>
          <div style={{ ...cardStyle, background: '#eaf7ee', borderColor: '#c9ecd3' }}>
            <div style={{ fontSize: '12px', color: SUCCESS, fontWeight: 700, marginBottom: '0.4rem' }}>✓ EXTERNAL FACTORS</div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: SUCCESS }}>{unctrlCount} <span style={{ fontSize: '15px', fontWeight: 600 }}>({100 - ctrlPct}%)</span></div>
            <div style={{ fontSize: '11px', color: GRAY }}>PCS, buying homes, relocation, lease expiry — outside your control</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,1fr)', gap: '16px', marginBottom: '1.5rem' }}>
          <div style={panelStyle}>
            <div style={sectionHeaderStyle}>MOVE-OUT REASONS (ALL TIME)</div>
            <div style={{ padding: '1.25rem 1rem 0.5rem' }}>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={reasonChartData} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eee" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v, n, p) => [v, p.payload.fullName]} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {reasonChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.controllable ? ALERT : SUCCESS} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', fontSize: '11px', color: GRAY, paddingBottom: '0.75rem' }}>
                <span><span style={{ display: 'inline-block', width: 10, height: 10, background: ALERT, borderRadius: 2, marginRight: 4 }}></span>Controllable</span>
                <span><span style={{ display: 'inline-block', width: 10, height: 10, background: SUCCESS, borderRadius: 2, marginRight: 4 }}></span>External</span>
              </div>
            </div>
          </div>

          <div style={panelStyle}>
            <div style={sectionHeaderStyle}>QUARTERLY TREND</div>
            <div style={{ padding: '1.25rem 1rem 0.5rem' }}>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={quarterlyData} margin={{ left: 0, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="period" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="moveouts" stroke={NAVY} strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div style={{ ...panelStyle, marginBottom: '1.5rem' }}>
          <div style={sectionHeaderStyle}>MOVE-OUT REASON BREAKDOWN — DETAIL</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#2c5f8a', color: 'white' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>Reason</th>
                <th style={{ padding: '10px 12px', textAlign: 'center' }}>All Time</th>
                <th style={{ padding: '10px 12px', textAlign: 'center' }}>Last 12 Mo</th>
                <th style={{ padding: '10px 12px', textAlign: 'center' }}>Last 6 Mo</th>
                <th style={{ padding: '10px 12px', textAlign: 'center' }}>% Total</th>
                <th style={{ padding: '10px 12px', textAlign: 'center' }}>Type</th>
              </tr>
            </thead>
            <tbody>
              {REASON_CATEGORIES.map((cat, i) => {
                const counts = reasonCounts[cat];
                const pct = totalAll > 0 ? (counts.all / totalAll * 100).toFixed(1) : '0.0';
                const isCtrl = CONTROLLABLE.has(cat);
                return (
                  <tr key={cat} style={{ background: i % 2 === 0 ? LIGHT : 'white', borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '9px 12px' }}>{cat}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'center' }}>{counts.all}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'center' }}>{counts.mo12}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'center' }}>{counts.mo6}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'center' }}>{pct}%</td>
                    <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 700, fontSize: '11px', color: isCtrl ? ALERT : SUCCESS }}>
                      {isCtrl ? '⚠ CTRL' : '✓ EXT'}
                    </td>
                  </tr>
                );
              })}
              <tr style={{ background: NAVY, color: 'white', fontWeight: 700 }}>
                <td style={{ padding: '10px 12px' }}>TOTAL</td>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}>{totalAll}</td>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}>—</td>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}>—</td>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}>100%</td>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}>—</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ ...panelStyle, marginBottom: '1.5rem' }}>
          <div style={{ ...sectionHeaderStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <span>GOOGLE REVIEWS {reviewStart || reviewEnd ? '(FILTERED)' : ''}</span>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontWeight: 400 }}>
              <input type="date" value={reviewStart} onChange={e => setReviewStart(e.target.value)}
                style={{ fontSize: '11px', padding: '4px 6px', borderRadius: '4px', border: 'none' }} />
              <span style={{ fontSize: '11px' }}>to</span>
              <input type="date" value={reviewEnd} onChange={e => setReviewEnd(e.target.value)}
                style={{ fontSize: '11px', padding: '4px 6px', borderRadius: '4px', border: 'none' }} />
              {(reviewStart || reviewEnd) && (
                <button onClick={() => { setReviewStart(''); setReviewEnd(''); }}
                  style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '4px', border: 'none', background: GOLD, color: NAVY, fontWeight: 700, cursor: 'pointer' }}>
                  Clear
                </button>
              )}
            </div>
          </div>

          <div style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', gap: '2rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '11px', color: GRAY }}>Avg rating in range</div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: GOLD }}>{avgRating ? avgRating.toFixed(1) : '—'} ★</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: GRAY }}>Reviews in range</div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: NAVY }}>{filteredReviews.length}</div>
              </div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <ResponsiveContainer width="100%" height={70}>
                  <BarChart data={ratingDistribution} layout="vertical" margin={{ top: 0, bottom: 0, left: 0, right: 10 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="stars" width={28} tick={{ fontSize: 10 }} />
                    <Bar dataKey="count" fill={GOLD} radius={[0, 3, 3, 0]} barSize={10} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {displayedReviews.length === 0 ? (
              <div style={{ color: GRAY, fontSize: '13px', textAlign: 'center', padding: '2rem 0' }}>No reviews in this date range.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {displayedReviews.map((rev, i) => {
                  const isOpen = expandedReview === i;
                  return (
                    <div key={i} onClick={() => setExpandedReview(isOpen ? null : i)}
                      style={{ border: '1px solid #eee', borderRadius: '8px', padding: '10px 14px', cursor: 'pointer', background: isOpen ? LIGHT : 'white' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontWeight: 700, fontSize: '13px' }}>{rev.reviewer || 'Anonymous'}</span>
                          <span style={{ marginLeft: '10px', color: GOLD, fontSize: '13px' }}>{'★'.repeat(Math.round(parseFloat(rev.stars) || 0))}</span>
                        </div>
                        <span style={{ fontSize: '11px', color: GRAY }}>{fmtDate(rev.date)}</span>
                      </div>
                      {isOpen && (
                        <div style={{ marginTop: '8px', fontSize: '13px', color: '#333', lineHeight: 1.5 }}>
                          {rev.text || <em style={{ color: GRAY }}>No written review text.</em>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {filteredReviews.length > 8 && (
              <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                <button onClick={() => setShowAllReviews(!showAllReviews)}
                  style={{ fontSize: '12px', padding: '6px 14px', borderRadius: '6px', border: `1px solid ${NAVY}`, background: 'white', color: NAVY, fontWeight: 600, cursor: 'pointer' }}>
                  {showAllReviews ? 'Show fewer' : `Show all ${filteredReviews.length} reviews`}
                </button>
              </div>
            )}
          </div>
        </div>

        <div style={{ textAlign: 'center', fontSize: '11px', color: GRAY, paddingTop: '0.5rem' }}>
          Source of truth: Google Sheet · Synced daily 6 AM EST
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
