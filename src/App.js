import React, { useState, useEffect } from 'react';

const Dashboard = () => {
  const [data, setData] = useState({
    ntvAll: 0,
    ntv12mo: 0,
    ntv6mo: 0,
    googleRating: 4.4,
    googleCount: 725,
    reasonCounts: {},
    quarterlyData: [],
    loading: true,
    error: null,
  });

  const JOTFORM_API = '07ccb8c84ca28d60dab2a5392c24d5df';
  const FORMS = {
    ntv: '72854558878175',
    ntv_relisting: '81987326013156',
    move_out_items: '80006727478157',
  };

  const REASON_CATEGORIES = [
    'Military / PCS', 'Buying a home', 'Relocation / job', 'Cost / rent increase',
    'Maintenance issues', 'Owner selling property', 'Lease expiration', 'Personal / family',
    'Dissatisfied with management', 'Safety concerns', 'Other / unknown',
  ];

  const controllable = new Set(['Cost / rent increase', 'Maintenance issues', 'Dissatisfied with management', 'Safety concerns']);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const now = new Date();
      const sixAgo = new Date(now);
      sixAgo.setMonth(now.getMonth() - 6);
      const twelveAgo = new Date(now);
      twelveAgo.setFullYear(now.getFullYear() - 1);

      let allRows = [];

      // Fetch from all forms
      for (const [key, formId] of Object.entries(FORMS)) {
        const rows = await fetchJotformSubmissions(formId);
        allRows = [...allRows, ...rows];
      }

      // Calculate metrics
      const ntvAll = allRows.length;
      const ntv12mo = allRows.filter(r => new Date(r.date) >= twelveAgo).length;
      const ntv6mo = allRows.filter(r => new Date(r.date) >= sixAgo).length;

      // Build reason counts
      const reasonCounts = {};
      REASON_CATEGORIES.forEach(c => { reasonCounts[c] = { all: 0, mo12: 0, mo6: 0 }; });

      allRows.forEach(row => {
        const cat = row.category || 'Other / unknown';
        const d = new Date(row.date);
        if (!reasonCounts[cat]) reasonCounts[cat] = { all: 0, mo12: 0, mo6: 0 };
        reasonCounts[cat].all++;
        if (d >= twelveAgo) reasonCounts[cat].mo12++;
        if (d >= sixAgo) reasonCounts[cat].mo6++;
      });

      // Build quarterly data
      const qmap = {};
      allRows.forEach(row => {
        const d = new Date(row.date);
        const yr = d.getFullYear();
        const q = 'Q' + Math.ceil((d.getMonth() + 1) / 3);
        if (!qmap[yr]) qmap[yr] = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
        qmap[yr][q]++;
      });

      const quarterlyData = Object.keys(qmap).sort().map(yr => ({
        year: yr,
        q1: qmap[yr].Q1,
        q2: qmap[yr].Q2,
        q3: qmap[yr].Q3,
        q4: qmap[yr].Q4,
        total: qmap[yr].Q1 + qmap[yr].Q2 + qmap[yr].Q3 + qmap[yr].Q4,
      }));

      setData({
        ntvAll,
        ntv12mo,
        ntv6mo,
        googleRating: 4.4,
        googleCount: 725,
        reasonCounts,
        quarterlyData,
        loading: false,
        error: null,
      });
    } catch (err) {
      setData(prev => ({ ...prev, error: err.message, loading: false }));
    }
  };

  const fetchJotformSubmissions = async (formId) => {
    const rows = [];
    let offset = 0;

    try {
      while (true) {
        const url = `https://api.jotform.com/form/${formId}/submissions?apiKey=${JOTFORM_API}&limit=1000&offset=${offset}&orderby=created_at,DESC`;
        const resp = await fetch(url);
        if (resp.status !== 200) break;

        const jsonData = await resp.json();
        const submissions = jsonData.content || [];
        if (!submissions.length) break;

        submissions.forEach(sub => {
          const answers = sub.answers || {};
          const created = sub.created_at || '';
          const dateObj = created ? new Date(created) : null;

          const reasonRaw = findAnswer(answers, ['reason','why','moving','vacating','purpose']) || '';
          const comments = findAnswer(answers, ['comment','note','additional']) || '';
          const category = categorizeReason(reasonRaw + ' ' + comments);

          rows.push({
            date: dateObj ? dateObj.toISOString().split('T')[0] : '',
            category,
          });
        });

        if (submissions.length < 1000) break;
        offset += 1000;
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    } catch (e) {
      console.error('Error fetching form:', formId, e);
    }

    return rows;
  };

  const findAnswer = (answers, keywords) => {
    for (const key in answers) {
      const ans = answers[key];
      const label = (ans.name || ans.text || '').toLowerCase();
      if (keywords.some(k => label.includes(k.toLowerCase()))) {
        const val = ans.answer;
        if (!val) return '';
        if (typeof val === 'string') return val.trim();
        if (typeof val === 'object') {
          if (val.first || val.last) return `${val.first || ''} ${val.last || ''}`.trim();
          return Object.values(val).filter(Boolean).join(', ');
        }
      }
    }
    return '';
  };

  const categorizeReason = (text) => {
    if (!text) return 'Other / unknown';
    const t = text.toLowerCase();
    if (/military|pcs|orders|deployment/.test(t)) return 'Military / PCS';
    if (/buy|bought|purchas|home|own/.test(t)) return 'Buying a home';
    if (/relocat|job|work|transfer|employ/.test(t)) return 'Relocation / job';
    if (/rent|price|cost|afford|increas|budget/.test(t)) return 'Cost / rent increase';
    if (/mold|maint|repair|broken|leak|hvac|pest/.test(t)) return 'Maintenance issues';
    if (/owner|sell|sold|landlord/.test(t)) return 'Owner selling property';
    if (/expir|end of lease|lease up|term/.test(t)) return 'Lease expiration';
    if (/family|personal|parent|child|marriage|health/.test(t)) return 'Personal / family';
    if (/dissatisf|unhappy|poor|management|staff/.test(t)) return 'Dissatisfied with management';
    if (/safety|safe|crime|fear|dangerous/.test(t)) return 'Safety concerns';
    return 'Other / unknown';
  };

  const totalAll = Object.values(data.reasonCounts).reduce((a, b) => a + (b.all || 0), 0);
  let ctrlCount = 0, unctrlCount = 0;
  REASON_CATEGORIES.forEach(cat => {
    const c = (data.reasonCounts[cat] || {}).all || 0;
    if (controllable.has(cat)) ctrlCount += c; else unctrlCount += c;
  });
  const ctrlPct = totalAll > 0 ? Math.round(ctrlCount / totalAll * 100) : 0;

  if (data.loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#6c757d' }}>
        Loading dashboard...
      </div>
    );
  }

  return (
    <div style={{ background: '#f8f9fa', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ background: '#1a3c5e', color: 'white', padding: '1.5rem', textAlign: 'center' }}>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>MSPM MOVE-OUT DASHBOARD</h1>
        <p style={{ margin: '0.5rem 0 0 0', fontSize: '12px', opacity: 0.8 }}>
          Generated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
        </p>
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem 1rem' }}>
        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '2rem' }}>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: '8px', border: '0.5px solid #e1e0d9' }}>
            <div style={{ fontSize: '12px', color: '#6c757d', marginBottom: '0.5rem' }}>Google Rating</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#d4af37' }}>
              {data.googleRating} ★
            </div>
            <div style={{ fontSize: '11px', color: '#6c757d' }}>{data.googleCount} reviews</div>
          </div>

          <div style={{ background: 'white', padding: '1.5rem', borderRadius: '8px', border: '0.5px solid #e1e0d9' }}>
            <div style={{ fontSize: '12px', color: '#6c757d', marginBottom: '0.5rem' }}>All-Time Notices</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#1a3c5e' }}>
              {data.ntvAll}
            </div>
            <div style={{ fontSize: '11px', color: '#6c757d' }}>total submissions</div>
          </div>

          <div style={{ background: 'white', padding: '1.5rem', borderRadius: '8px', border: '0.5px solid #e1e0d9' }}>
            <div style={{ fontSize: '12px', color: '#6c757d', marginBottom: '0.5rem' }}>Last 12 Months</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#1a3c5e' }}>
              {data.ntv12mo}
            </div>
            <div style={{ fontSize: '11px', color: '#6c757d' }}>move-outs</div>
          </div>

          <div style={{ background: 'white', padding: '1.5rem', borderRadius: '8px', border: '0.5px solid #e1e0d9' }}>
            <div style={{ fontSize: '12px', color: '#6c757d', marginBottom: '0.5rem' }}>Last 6 Months</div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#1a3c5e' }}>
              {data.ntv6mo}
            </div>
            <div style={{ fontSize: '11px', color: '#6c757d' }}>move-outs</div>
          </div>
        </div>

        {/* Retention Risk */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '2rem' }}>
          <div style={{ background: '#ffe6e6', padding: '1.5rem', borderRadius: '8px', border: '0.5px solid #ffcccc' }}>
            <div style={{ fontSize: '12px', color: '#c0392b', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              ⚠ CONTROLLABLE FACTORS
            </div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#c0392b' }}>
              {ctrlCount}
            </div>
            <div style={{ fontSize: '11px', color: '#6c757d' }}>{ctrlPct}% of total</div>
          </div>

          <div style={{ background: '#e6f4e8', padding: '1.5rem', borderRadius: '8px', border: '0.5px solid #ccead1' }}>
            <div style={{ fontSize: '12px', color: '#27ae60', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              ✓ EXTERNAL FACTORS
            </div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#27ae60' }}>
              {unctrlCount}
            </div>
            <div style={{ fontSize: '11px', color: '#6c757d' }}>{100 - ctrlPct}% of total</div>
          </div>
        </div>

        {/* Reason Breakdown Table */}
        <div style={{ background: 'white', borderRadius: '8px', border: '0.5px solid #e1e0d9', marginBottom: '2rem', overflow: 'hidden' }}>
          <div style={{ background: '#1a3c5e', color: 'white', padding: '1rem', fontWeight: 'bold', fontSize: '13px' }}>
            MOVE-OUT REASON BREAKDOWN
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#2c5f8a', color: 'white', fontWeight: 'bold' }}>
                <th style={{ padding: '12px', textAlign: 'left', borderRight: '0.5px solid #e1e0d9' }}>Reason</th>
                <th style={{ padding: '12px', textAlign: 'center', borderRight: '0.5px solid #e1e0d9' }}>All Time</th>
                <th style={{ padding: '12px', textAlign: 'center', borderRight: '0.5px solid #e1e0d9' }}>Last 12 Mo</th>
                <th style={{ padding: '12px', textAlign: 'center', borderRight: '0.5px solid #e1e0d9' }}>Last 6 Mo</th>
                <th style={{ padding: '12px', textAlign: 'center', borderRight: '0.5px solid #e1e0d9' }}>% Total</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>Type</th>
              </tr>
            </thead>
            <tbody>
              {REASON_CATEGORIES.map((cat, i) => {
                const counts = data.reasonCounts[cat] || { all: 0, mo12: 0, mo6: 0 };
                const pct = totalAll > 0 ? ((counts.all / totalAll * 100).toFixed(1)) : '0.0';
                const isCtrl = controllable.has(cat);
                const bg = i % 2 === 0 ? '#f8f9fa' : 'white';

                return (
                  <tr key={cat} style={{ background: bg, borderBottom: '0.5px solid #e1e0d9' }}>
                    <td style={{ padding: '12px', borderRight: '0.5px solid #e1e0d9' }}>{cat}</td>
                    <td style={{ padding: '12px', textAlign: 'center', borderRight: '0.5px solid #e1e0d9' }}>{counts.all}</td>
                    <td style={{ padding: '12px', textAlign: 'center', borderRight: '0.5px solid #e1e0d9' }}>{counts.mo12}</td>
                    <td style={{ padding: '12px', textAlign: 'center', borderRight: '0.5px solid #e1e0d9' }}>{counts.mo6}</td>
                    <td style={{ padding: '12px', textAlign: 'center', borderRight: '0.5px solid #e1e0d9' }}>{pct}%</td>
                    <td style={{ 
                      padding: '12px', 
                      textAlign: 'center', 
                      color: isCtrl ? '#c0392b' : '#27ae60',
                      fontWeight: 'bold',
                      fontSize: '11px'
                    }}>
                      {isCtrl ? '⚠ CTRL' : '✓ EXT'}
                    </td>
                  </tr>
                );
              })}
              <tr style={{ background: '#1a3c5e', color: 'white', fontWeight: 'bold' }}>
                <td style={{ padding: '12px', borderRight: '0.5px solid #e1e0d9' }}>TOTAL</td>
                <td style={{ padding: '12px', textAlign: 'center', borderRight: '0.5px solid #e1e0d9' }}>{totalAll}</td>
                <td style={{ padding: '12px', textAlign: 'center', borderRight: '0.5px solid #e1e0d9' }}>—</td>
                <td style={{ padding: '12px', textAlign: 'center', borderRight: '0.5px solid #e1e0d9' }}>—</td>
                <td style={{ padding: '12px', textAlign: 'center', borderRight: '0.5px solid #e1e0d9' }}>100%</td>
                <td style={{ padding: '12px', textAlign: 'center' }}>—</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Quarterly Trend */}
        <div style={{ background: 'white', borderRadius: '8px', border: '0.5px solid #e1e0d9', overflow: 'hidden' }}>
          <div style={{ background: '#1a3c5e', color: 'white', padding: '1rem', fontWeight: 'bold', fontSize: '13px' }}>
            QUARTERLY TREND
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#2c5f8a', color: 'white', fontWeight: 'bold' }}>
                <th style={{ padding: '12px', textAlign: 'left' }}>Year</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>Q1</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>Q2</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>Q3</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>Q4</th>
                <th style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold' }}>Annual</th>
              </tr>
            </thead>
            <tbody>
              {data.quarterlyData.map((row, i) => {
                const bg = i % 2 === 0 ? '#f8f9fa' : 'white';
                return (
                  <tr key={row.year} style={{ background: bg, borderBottom: '0.5px solid #e1e0d9' }}>
                    <td style={{ padding: '12px' }}>{row.year}</td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>{row.q1}</td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>{row.q2}</td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>{row.q3}</td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>{row.q4}</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold' }}>{row.total}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ textAlign: 'center', marginTop: '2rem', fontSize: '11px', color: '#6c757d' }}>
          Dashboard updated: {new Date().toLocaleString()}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
