import { tripsApi, billingApi, hospitalsApi, financeApi, salaryApi, leadsApi, vehiclesApi, authApi } from '../api/client';
import { PageHeader, StatusBadge, Btn, Modal, StatCard, Tabs, Spinner, Empty, rupee } from '../components/ui';
import toast from 'react-hot-toast';
// src/pages/FleetPage.jsx
import React, { useState, useEffect } from 'react';
import { Plus, MapPin, Gauge } from 'lucide-react';

export default function FleetPage() {
  const [vehicles, setVehicles] = useState([]);
  const [drivers,  setDrivers]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [modal,    setModal]    = useState(false);
  const [form,     setForm]     = useState({ registrationNumber:'', model:'', type:'BLS', assignedDriver:'' });

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [v, d] = await Promise.all([vehiclesApi.getAll(), authApi.getUsers({ role: 'driver' })]);
      setVehicles(v.data.vehicles||[]);
      setDrivers(d.data.users||[]);
    } finally { setLoading(false); }
  };

  const save = async () => {
    await vehiclesApi.create(form);
    toast.success('Vehicle added!');
    setModal(false);
    load();
  };

  const changeStatus = async (id, status) => {
    await vehiclesApi.update(id, { status });
    load();
  };

  const counts = {
    available:   vehicles.filter(v => v.status === 'available').length,
    on_trip:     vehicles.filter(v => v.status === 'on_trip').length,
    offline:     vehicles.filter(v => v.status === 'offline').length,
    maintenance: vehicles.filter(v => v.status === 'maintenance').length,
  };

  if (loading) return <Spinner />;

  return (
    <div className="page-enter">
      <PageHeader title="Fleet Tracker" subtitle="Live ambulance status · Driver assignment · Compliance"
        action={<Btn onClick={() => setModal(true)}><Plus size={14}/> Add Vehicle</Btn>} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Available"   value={counts.available}   color="green" />
        <StatCard label="On Trip"     value={counts.on_trip}     color="amber" />
        <StatCard label="Offline"     value={counts.offline}     color="blue"  />
        <StatCard label="Maintenance" value={counts.maintenance} color="red"   />
      </div>

      {vehicles.length === 0 ? <Empty icon="🚑" message="No vehicles in fleet" /> :
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {vehicles.map(v => {
            const accentColor = v.status === 'available' ? 'var(--accent)' : v.status === 'on_trip' ? 'var(--amber)' : 'var(--text3)';
            const expiring = v.expiring || [];
            return (
              <div key={v._id} className="card"
                style={{ borderLeft: `3px solid ${accentColor}` }}>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="font-mono text-xs mb-0.5" style={{ color: 'var(--accent)' }}>{v._id?.slice(-6).toUpperCase()}</div>
                    <div className="font-bold">{v.registrationNumber}</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text2)' }}>{v.model} · {v.type}</div>
                  </div>
                  <StatusBadge status={v.status} />
                </div>

                <div className="flex items-center gap-2 mb-3 p-2 rounded-lg" style={{ background: 'var(--surface2)' }}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{ background: 'rgba(59,158,255,.15)', color: 'var(--blue)' }}>
                    {v.assignedDriver?.name?.split(' ').map(w=>w[0]).join('').slice(0,2) || '??'}
                  </div>
                  <div>
                    <div className="text-xs font-medium">{v.assignedDriver?.name || 'Unassigned'}</div>
                    <div className="text-[10px] font-mono" style={{ color: 'var(--text3)' }}>{v.assignedDriver?.phone}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-3 text-xs" style={{ color: 'var(--text2)' }}>
                  <div className="flex items-center gap-1"><Gauge size={11}/> {v.odometer?.toLocaleString('en-IN')} km</div>
                  <div>✅ {v.trips || 0} trips</div>
                </div>

                {expiring.length > 0 && (
                  <div className="mb-3 rounded-lg p-2 text-xs"
                    style={{ background: 'rgba(255,77,109,.08)', border: '1px solid rgba(255,77,109,.2)', color: 'var(--red)' }}>
                    ⚠️ {expiring.map(d => `${d.type} (${d.daysLeft}d)`).join(', ')}
                  </div>
                )}

                <select value={v.status} onChange={e => changeStatus(v._id, e.target.value)}
                  className="inp text-xs py-1.5 w-full">
                  <option value="available">Available</option>
                  <option value="on_trip">On Trip</option>
                  <option value="offline">Offline</option>
                  <option value="maintenance">Maintenance</option>
                </select>
              </div>
            );
          })}
        </div>
      }

      <Modal open={modal} onClose={() => setModal(false)} title="Add Vehicle">
        <div className="space-y-4">
          {[['registrationNumber','Registration No.','DL-01-AA-1234'],['model','Model','Force Traveller ALS']].map(([k,l,p]) => (
            <div key={k}>
              <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--text2)' }}>{l}</label>
              <input className="inp" placeholder={p} value={form[k]} onChange={e => setForm(f=>({...f,[k]:e.target.value}))} />
            </div>
          ))}
          <div>
            <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--text2)' }}>Type</label>
            <select className="inp" value={form.type} onChange={e => setForm(f=>({...f,type:e.target.value}))}>
              <option value="ALS">ALS</option><option value="BLS">BLS</option><option value="Patient_Transport">Patient Transport</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--text2)' }}>Assign Driver</label>
            <select className="inp" value={form.assignedDriver} onChange={e => setForm(f=>({...f,assignedDriver:e.target.value}))}>
              <option value="">-- Select Driver --</option>
              {drivers.map(d => <option key={d._id} value={d._id}>{d.name} · {d.phone}</option>)}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <Btn className="flex-1" onClick={save}>Save Vehicle</Btn>
            <Btn variant="ghost" onClick={() => setModal(false)}>Cancel</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// src/pages/TripsPage.jsx
// ─────────────────────────────────────────────────────────────
export function TripsPage() {
  const [trips,   setTrips]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('all');

  useEffect(() => { load(); }, [filter]);

  

  const load = async () => {
    setLoading(true);
    try {
      const params = filter !== 'all' ? { status: filter } : {};
      const { data } = await tripsApi.getAll(params);
      setTrips(data.trips);
    } finally { setLoading(false); }
  };

  

  const FILTERS = ['all','booked','dispatched','en_route','completed','cancelled'];

  return (
    <div className="page-enter">
      <PageHeader title="Trip Records" subtitle="All bookings · Status · Bills" />

      <div className="flex gap-1 flex-wrap mb-5 p-1 rounded-xl" style={{ background: 'var(--surface)', width: 'fit-content' }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize
              ${filter === f ? 'bg-[var(--surface2)] text-[var(--text)]' : 'text-[var(--text3)]'}`}>
            {f.replace('_',' ')}
          </button>
        ))}
      </div>

      <div className="card overflow-x-auto">
        {loading ? <Spinner /> : trips.length === 0 ? <Empty icon="📋" message="No trips found" /> :
          <table className="tbl">
            <thead><tr>
              <th>Trip</th><th>Patient</th><th>Emergency</th><th>Hospital</th>
              <th>Vehicle</th><th>Driver</th><th>Fare</th><th>Status</th><th>Date</th>
            </tr></thead>
            <tbody>
              {trips.map(t => (
                <tr key={t._id}>
                  <td className="font-mono text-xs" style={{ color: 'var(--accent)' }}>{t.tripNumber || t._id.slice(-6)}</td>
                  <td><div className="font-medium text-sm">{t.patientName}</div><div className="text-xs" style={{ color:'var(--text3)' }}>{t.patientPhone}</div></td>
                  <td><span className="badge badge-blue text-xs capitalize">{t.emergencyType}</span></td>
                  <td className="text-sm" style={{ color:'var(--text2)' }}>{t.dropHospital?.name}</td>
                  <td className="font-mono text-xs" style={{ color:'var(--text2)' }}>{t.vehicle?.registrationNumber}</td>
                  <td className="text-sm">{t.driver?.name || '—'}</td>
                  <td className="font-bold font-mono" style={{ color:'var(--accent)' }}>{rupee(t.grandTotal || t.baseFare)}</td>
                  <td><StatusBadge status={t.status} /></td>
                  <td className="text-xs font-mono" style={{ color:'var(--text3)' }}>{new Date(t.createdAt).toLocaleDateString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// src/pages/BillingPage.jsx
// ─────────────────────────────────────────────────────────────
export function BillingPage() {
  const [tab,      setTab]      = useState('bills');
  const [bills,    setBills]    = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [hospitals,setHospitals]= useState([]);
  const [loading,  setLoading]  = useState(true);
  const [invForm,  setInvForm]  = useState({ hospitalId:'', month: new Date().getMonth()+1, year: new Date().getFullYear() });

  

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [b, i, h] = await Promise.all([billingApi.getBills(), billingApi.getInvoices(), hospitalsApi.getAll()]);
      setBills(b.data.bills);
      setInvoices(i.data.invoices);
      setHospitals(h.data.hospitals);
    } finally { setLoading(false); }
  };

  const genInvoice = async () => {
    if (!invForm.hospitalId) { toast.error('Select a hospital'); return; }
    await billingApi.generateInvoice(invForm);
    toast.success('Invoice generated!');
    loadAll();
  };

  

  const MONTHS = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  return (
    <div className="page-enter">
      <PageHeader title="Billing & Invoices" subtitle="Trip bills · Monthly hospital invoices" />
      <Tabs tabs={[{key:'bills',label:'Trip Bills'},{key:'invoices',label:'Hospital Invoices'}]}
        active={tab} onChange={setTab} />

      {tab === 'bills' && (
        <div className="card overflow-x-auto">
          {loading ? <Spinner /> : bills.length === 0 ? <Empty icon="🧾" message="No bills yet" /> :
            <table className="tbl">
              <thead><tr><th>Bill No.</th><th>Patient</th><th>Hospital</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>
                {bills.map(b => (
                  <tr key={b._id}>
                    <td className="font-mono text-xs" style={{ color:'var(--accent)' }}>{b.billNumber}</td>
                    <td className="text-sm font-medium">{b.patient}</td>
                    <td className="text-sm" style={{ color:'var(--text2)' }}>{b.hospital?.name}</td>
                    <td className="text-xs font-mono" style={{ color:'var(--text3)' }}>{new Date(b.createdAt).toLocaleDateString('en-IN')}</td>
                    <td className="font-bold font-mono" style={{ color:'var(--accent)' }}>{rupee(b.grandTotal)}</td>
                    <td><StatusBadge status={b.paymentStatus} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        </div>
      )}

      {tab === 'invoices' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="card">
            <h3 className="font-bold font-display mb-4">Generate Invoice</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color:'var(--text2)' }}>Hospital</label>
                <select className="inp" value={invForm.hospitalId} onChange={e => setInvForm(f=>({...f,hospitalId:e.target.value}))}>
                  <option value="">-- Select --</option>
                  {hospitals.filter(h=>h.tieUp?.isActive).map(h=><option key={h._id} value={h._id}>{h.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color:'var(--text2)' }}>Month</label>
                  <select className="inp" value={invForm.month} onChange={e=>setInvForm(f=>({...f,month:Number(e.target.value)}))}>
                    {MONTHS.slice(1).map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color:'var(--text2)' }}>Year</label>
                  <input className="inp" type="number" value={invForm.year} onChange={e=>setInvForm(f=>({...f,year:Number(e.target.value)}))} />
                </div>
              </div>
              <Btn className="w-full" onClick={genInvoice}>Generate Invoice</Btn>
            </div>
          </div>
          <div className="md:col-span-2 card overflow-x-auto">
            <h3 className="font-bold font-display mb-4">Invoice History</h3>
            {invoices.length === 0 ? <Empty icon="📄" message="No invoices yet" /> :
              <table className="tbl">
                <thead><tr><th>Invoice</th><th>Hospital</th><th>Period</th><th>Trips</th><th>Net Payable</th><th>Status</th></tr></thead>
                <tbody>
                  {invoices.map(i=>(
                    <tr key={i._id}>
                      <td className="font-mono text-xs" style={{color:'var(--accent)'}}>{i._id.slice(-8).toUpperCase()}</td>
                      <td className="text-sm font-medium">{i.hospital?.name}</td>
                      <td className="text-xs font-mono" style={{color:'var(--text3)'}}>{MONTHS[i.billingPeriod?.month]} {i.billingPeriod?.year}</td>
                      <td className="text-center">{i.totalTrips}</td>
                      <td className="font-bold font-mono" style={{color:'var(--accent)'}}>{rupee(i.netPayable)}</td>
                      <td><StatusBadge status={i.status}/></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          </div>
        </div>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// src/pages/FinancePage.jsx
// ─────────────────────────────────────────────────────────────
export function FinancePage() {
  const [entries,  setEntries]  = useState([]);
  const [loans,    setLoans]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState('ledger');
  const [addModal, setAddModal] = useState(false);
  const [form,     setForm]     = useState({ type:'expense', category:'diesel', amount:'', description:'', date: new Date().toISOString().split('T')[0] });

  
  

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [e, l] = await Promise.all([financeApi.getExpenses(), financeApi.getLoans()]);
      setEntries(e.data.expenses || []);
      setLoans(l.data.loans || []);
    } finally { setLoading(false); }
  };

  const totalExpenses = entries.filter(e=>e.category!=='salary').reduce((s,e)=>s+e.amount,0);
  const diesel = entries.filter(e=>e.category==='diesel').reduce((s,e)=>s+e.amount,0);

  return (
    <div className="page-enter">
      <PageHeader title="Finance" subtitle="Income · Expenses · Loans & EMI"
        action={<Btn onClick={()=>setAddModal(true)}><span>+</span> Add Entry</Btn>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Expenses" value={rupee(totalExpenses)} color="red" />
        <StatCard label="Diesel"         value={rupee(diesel)}        color="amber" />
        <StatCard label="Active Loans"   value={loans.filter(l=>l.status==='active').length} color="blue" />
        <StatCard label="Monthly EMI"    value={rupee(loans.filter(l=>l.status==='active').reduce((s,l)=>s+l.emiAmount,0))} color="red" />
      </div>
      <Tabs tabs={[{key:'ledger',label:'Ledger'},{key:'loans',label:'Loans & EMI'}]} active={tab} onChange={setTab} />

      {tab === 'ledger' && (
        <div className="card overflow-x-auto">
          {loading ? <Spinner /> : entries.length===0 ? <Empty icon="💰" message="No entries" /> :
            <table className="tbl">
              <thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Description</th><th>Amount</th></tr></thead>
              <tbody>
                {[...entries].reverse().map(e=>(
                  <tr key={e._id}>
                    <td className="font-mono text-xs" style={{color:'var(--text3)'}}>{new Date(e.date).toLocaleDateString('en-IN')}</td>
                    <td><span className={`badge ${e.type==='income'?'badge-green':'badge-red'} text-[10px]`}>{e.type}</span></td>
                    <td><span className="badge badge-gray text-[10px] capitalize">{e.category?.replace('_',' ')}</span></td>
                    <td className="text-sm" style={{color:'var(--text2)'}}>{e.description}</td>
                    <td className="font-bold font-mono" style={{color:e.type==='income'?'var(--accent)':'var(--red)'}}>
                      {e.type==='income'?'+':'−'}{rupee(e.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        </div>
      )}

      {tab === 'loans' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {loading ? <Spinner /> : loans.length===0 ? <Empty icon="🏦" message="No loans recorded" /> :
            loans.map(l => {
              const pct = Math.round(l.paidInstallments/l.tenureMonths*100);
              const outstanding = l.emiAmount*(l.tenureMonths-l.paidInstallments);
              return (
                <div key={l._id} className="card">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="font-mono text-xs" style={{color:'var(--blue)'}}>{l._id.slice(-6).toUpperCase()}</div>
                      <div className="font-bold mt-0.5">{l.vehicle?.registrationNumber}</div>
                      <div className="text-xs" style={{color:'var(--text2)'}}>{l.lenderName}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold font-mono" style={{color:'var(--accent)'}}>{rupee(l.emiAmount)}</div>
                      <div className="text-xs" style={{color:'var(--text3)'}}>EMI/month</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {[['Principal',rupee(l.principal),'var(--text)'],[`${l.interestRate}% p.a.`,'Interest','var(--amber)'],['Outstanding',rupee(outstanding),'var(--red)']].map(([a,b,c])=>(
                      <div key={a} className="rounded-lg p-2 text-center" style={{background:'var(--surface2)'}}>
                        <div className="font-mono text-xs font-bold" style={{color:c}}>{a}</div>
                        <div className="text-[10px] mt-0.5" style={{color:'var(--text3)'}}>{b}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mb-1 text-xs flex justify-between" style={{color:'var(--text2)'}}>
                    <span>{l.paidInstallments} paid</span><span>{l.tenureMonths-l.paidInstallments} remaining</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden mb-3" style={{background:'var(--surface3)'}}>
                    <div className="h-full rounded-full transition-all" style={{background:'linear-gradient(90deg,var(--accent),var(--blue))',width:`${pct}%`}} />
                  </div>
                  <Btn variant="amber" size="sm" className="w-full" onClick={async()=>{ await financeApi.recordEmi(l._id); toast.success('EMI recorded'); loadAll(); }}>
                    Record EMI Payment
                  </Btn>
                </div>
              );
            })
          }
        </div>
      )}

      <Modal open={addModal} onClose={()=>setAddModal(false)} title="Add Finance Entry">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{color:'var(--text2)'}}>Type</label>
              <select className="inp" value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{color:'var(--text2)'}}>Category</label>
              <select className="inp" value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>
                {['diesel','maintenance','oxygen_refill','salary','emi_payment','misc','trip_fare','hospital_credit'].map(c=>(
                  <option key={c} value={c}>{c.replace('_',' ')}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{color:'var(--text2)'}}>Description</label>
            <input className="inp" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{color:'var(--text2)'}}>Amount (₹)</label>
              <input className="inp" type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{color:'var(--text2)'}}>Date</label>
              <input className="inp" type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Btn className="flex-1" onClick={async()=>{ await financeApi.addExpense(form); toast.success('Entry added'); setAddModal(false); loadAll(); }}>Save</Btn>
            <Btn variant="ghost" onClick={()=>setAddModal(false)}>Cancel</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// src/pages/SalaryPage.jsx
// ─────────────────────────────────────────────────────────────
export function SalaryPage() {
  const now = new Date();
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [month,   setMonth]   = useState(now.getMonth()+1);
  const [year,    setYear]    = useState(now.getFullYear());
  const [loading, setLoading] = useState(false);
  const [modal,   setModal]   = useState(null);

  
  

  useEffect(() => { loadSummary(); }, [month, year]);

  const loadSummary = async () => {
    setLoading(true);
    try {
      const { data } = await salaryApi.getSummary(month, year);
      setRecords(data.records || []);
      setSummary(data.summary);
    } catch { setRecords([]); }
    setLoading(false);
  };

  const calc = async () => {
    await salaryApi.calculate(month, year);
    toast.success('Salaries calculated!');
    loadSummary();
  };

  const MONTHS=['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  return (
    <div className="page-enter">
      <PageHeader title="Driver Salaries" subtitle="Base + trip bonus · Auto calculate · Payslips"
        action={<Btn onClick={calc}>⚡ Calculate All</Btn>} />

      <div className="flex gap-3 mb-5">
        <select className="inp" style={{width:'auto',padding:'8px 12px'}} value={month} onChange={e=>setMonth(Number(e.target.value))}>
          {MONTHS.slice(1).map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}
        </select>
        <input className="inp" style={{width:90}} type="number" value={year} onChange={e=>setYear(Number(e.target.value))} />
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="Net Payroll"   value={rupee(summary.totalNetPayroll)} color="green" />
          <StatCard label="Trip Bonuses"  value={rupee(summary.totalTripBonus)}  color="amber" />
          <StatCard label="Deductions"    value={rupee(summary.totalDeductions)} color="red" />
          <StatCard label="Drivers"       value={summary.totalDrivers}           color="blue" />
        </div>
      )}

      <div className="card overflow-x-auto">
        {loading ? <Spinner /> : records.length===0 ? <Empty icon="👨‍💼" message="No salary records — click Calculate All" /> :
          <table className="tbl">
            <thead><tr><th>Driver</th><th>Base</th><th>Trips</th><th>Trip Bonus</th><th>Deductions</th><th>Net Salary</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {records.map(r => (
                <tr key={r._id}>
                  <td><div className="font-medium text-sm">{r.driver?.name}</div><div className="text-xs font-mono" style={{color:'var(--text3)'}}>{r.driver?.phone}</div></td>
                  <td className="font-mono text-sm">{rupee(r.earnedBase)}</td>
                  <td className="text-center"><span className="badge badge-blue">{r.completedTrips}</span></td>
                  <td className="font-mono text-sm" style={{color:'var(--accent)'}}>{rupee(r.tripBonusAmount)}</td>
                  <td className="font-mono text-sm" style={{color:'var(--red)'}}>{r.deductions>0?'−'+rupee(r.deductions):'—'}</td>
                  <td className="font-bold font-mono" style={{color:'var(--accent)'}}>{rupee(r.netSalary)}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td>
                    <div className="flex gap-1">
                      {r.status==='draft'    && <Btn size="sm" variant="blue"  onClick={async()=>{ await salaryApi.approve(r._id); loadSummary(); }}>Approve</Btn>}
                      {r.status==='approved' && <Btn size="sm" onClick={async()=>{ await salaryApi.markPaid(r._id,'bank_transfer'); toast.success('Salary paid!'); loadSummary(); }}>Mark Paid</Btn>}
                      <Btn size="sm" variant="ghost" onClick={()=>setModal(r)}>Payslip</Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      </div>

      <Modal open={!!modal} onClose={()=>setModal(null)} title="Salary Payslip">
        {modal && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg p-3" style={{background:'var(--surface2)'}}>
                <div className="text-xs" style={{color:'var(--text3)'}}>EMPLOYEE</div>
                <div className="font-bold mt-0.5">{modal.driver?.name}</div>
              </div>
              <div className="rounded-lg p-3" style={{background:'var(--surface2)'}}>
                <div className="text-xs" style={{color:'var(--text3)'}}>PERIOD</div>
                <div className="font-bold mt-0.5">{MONTHS[modal.month]} {modal.year}</div>
              </div>
            </div>
            {[['Fixed Base (pro-rated)',rupee(modal.earnedBase)],
              [`Trip Bonus (${modal.completedTrips} × ₹${modal.perTripBonus})`,rupee(modal.tripBonusAmount)],
              ['Deductions','−'+rupee(modal.deductions)]].map(([l,v])=>(
              <div key={l} className="flex justify-between text-sm py-2" style={{borderBottom:'1px solid var(--border)'}}>
                <span style={{color:'var(--text2)'}}>{l}</span><span className="font-mono">{v}</span>
              </div>
            ))}
            <div className="flex justify-between text-lg font-bold py-2">
              <span>Net Salary</span>
              <span className="font-mono" style={{color:'var(--accent)'}}>{rupee(modal.netSalary)}</span>
            </div>
            <Btn className="w-full" onClick={()=>window.print()}>🖨️ Print Payslip</Btn>
          </div>
        )}
      </Modal>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// src/pages/LeadsPage.jsx
// ─────────────────────────────────────────────────────────────
export function LeadsPage() {
  const [leads,   setLeads]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('new');

  
  

  useEffect(() => { load(); }, [filter]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await leadsApi.getAll(filter!=='all'?{status:filter}:{});
      setLeads(data.leads);
    } finally { setLoading(false); }
  };

  const update = async (id, status) => {
    await leadsApi.update(id, { status });
    toast.success('Lead updated');
    load();
  };

  const SRC_ICONS = { facebook_ad:'📘', google_ad:'🎯', inbound_call:'📞', manual:'✏️', walk_in:'🚶', referral:'👥' };
  const FILTERS = ['all','new','contacted','converted','lost'];

  return (
    <div className="page-enter">
      <PageHeader title="Leads Dashboard" subtitle="FB Ads · Google Ads · Inbound Calls" />

      <div className="flex gap-1 flex-wrap mb-5 p-1 rounded-xl" style={{background:'var(--surface)',width:'fit-content'}}>
        {FILTERS.map(f=>(
          <button key={f} onClick={()=>setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize
              ${filter===f?'bg-[var(--surface2)] text-[var(--text)]':'text-[var(--text3)]'}`}>{f}</button>
        ))}
      </div>

      <div className="card overflow-x-auto">
        {loading ? <Spinner /> : leads.length===0 ? <Empty icon="🎯" message="No leads found" /> :
          <table className="tbl">
            <thead><tr><th>Source</th><th>Name</th><th>Phone</th><th>Message</th><th>Campaign</th><th>Status</th><th>Received</th><th>Action</th></tr></thead>
            <tbody>
              {leads.map(l => (
                <tr key={l._id}>
                  <td><span title={l.source}>{SRC_ICONS[l.source]||'📩'}</span> <span className="text-xs" style={{color:'var(--text3)'}}>{l.source?.replace('_',' ')}</span></td>
                  <td><div className="font-medium text-sm">{l.patientName||'Unknown'}</div></td>
                  <td className="font-mono text-xs">{l.phone}</td>
                  <td className="text-xs max-w-xs truncate" style={{color:'var(--text2)'}}>{l.message||'—'}</td>
                  <td className="text-xs" style={{color:'var(--text3)'}}>{l.adName||l.formName||'—'}</td>
                  <td><StatusBadge status={l.status}/></td>
                  <td className="text-xs font-mono" style={{color:'var(--text3)'}}>{new Date(l.receivedAt).toLocaleDateString('en-IN')}</td>
                  <td>
                    <div className="flex gap-1">
                      {l.status==='new'       && <Btn size="sm" variant="blue"  onClick={()=>update(l._id,'contacted')}>Contact</Btn>}
                      {l.status==='contacted' && <Btn size="sm"                 onClick={()=>update(l._id,'converted')}>Convert</Btn>}
                      {!['lost','spam'].includes(l.status) && <Btn size="sm" variant="ghost" onClick={()=>update(l._id,'lost')}>✕</Btn>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// src/pages/CompliancePage.jsx
// ─────────────────────────────────────────────────────────────
export function CompliancePage() {
  const [report,  setReport]  = useState(null);
  const [loading, setLoading] = useState(true);

  
  
  

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await vehiclesApi.compliance();
      setReport(data);
    } finally { setLoading(false); }
  };

  const triggerCheck = async () => {
    await api.post('/compliance/run-compliance-check');
    toast.success('Compliance check triggered');
    load();
  };

  if (loading) return <Spinner />;
  const s = report?.summary || {};

  const IssueRow = ({ item, severity }) => {
    const colors = { expired:'var(--red)', critical:'var(--red)', warning:'var(--amber)' };
    return (
      <div className="flex items-center justify-between rounded-xl px-4 py-3 mb-2"
        style={{ background:`${colors[severity]}12`, border:`1px solid ${colors[severity]}30` }}>
        <div>
          <div className="font-semibold text-sm">{item.vehicle}</div>
          <div className="text-xs mt-0.5" style={{color:'var(--text2)'}}>{item.doc}</div>
        </div>
        <div className="text-right">
          <div className="font-mono font-bold text-sm" style={{color:colors[severity]}}>
            {item.daysLeft < 0 ? `Expired ${Math.abs(item.daysLeft)}d ago` : `${item.daysLeft}d left`}
          </div>
          <div className="text-xs" style={{color:'var(--text3)'}}>{new Date(item.expiryDate).toLocaleDateString('en-IN')}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="page-enter">
      <PageHeader title="Fleet Compliance" subtitle="Document expiry alerts · 15-day warnings"
        action={<Btn onClick={triggerCheck} variant="amber">Run Alert Check</Btn>} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Expired"       value={s.expiredCount   || 0} color="red"   />
        <StatCard label="Critical (≤15d)" value={s.criticalCount || 0} color="amber" />
        <StatCard label="Warning (≤30d)" value={s.warningCount  || 0} color="blue"  />
        <StatCard label="Healthy"        value={s.healthyVehicles|| 0} color="green" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="card">
          <h3 className="font-bold font-display mb-3 text-sm" style={{color:'var(--red)'}}>🚨 Expired Documents</h3>
          {(report?.report?.expired||[]).length===0
            ? <div className="text-xs py-4 text-center" style={{color:'var(--text3)'}}>None 🎉</div>
            : (report.report.expired||[]).map((d,i)=><IssueRow key={i} item={d} severity="expired"/>)}
        </div>
        <div className="card">
          <h3 className="font-bold font-display mb-3 text-sm" style={{color:'var(--amber)'}}>⚠️ Expiring in 15 days</h3>
          {(report?.report?.expiringSoon||[]).length===0
            ? <div className="text-xs py-4 text-center" style={{color:'var(--text3)'}}>None 🎉</div>
            : (report.report.expiringSoon||[]).map((d,i)=><IssueRow key={i} item={d} severity="critical"/>)}
        </div>
        <div className="card">
          <h3 className="font-bold font-display mb-3 text-sm" style={{color:'var(--blue)'}}>📋 Expiring in 30 days</h3>
          {(report?.report?.expiring30||[]).length===0
            ? <div className="text-xs py-4 text-center" style={{color:'var(--text3)'}}>None 🎉</div>
            : (report.report.expiring30||[]).map((d,i)=><IssueRow key={i} item={d} severity="warning"/>)}
        </div>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// src/pages/HospitalsPage.jsx
// ─────────────────────────────────────────────────────────────
export function HospitalsPage() {
  const [hospitals, setHospitals] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [modal,     setModal]     = useState(false);
  const [form,      setForm]      = useState({ name:'', address:'', phone:'', email:'', tieUp:{ isActive:false, discountPercent:0, creditDays:30 } });

  
  

  useEffect(() => { load(); }, []);
  const load = async () => { setLoading(true); try { const {data}=await hospitalsApi.getAll(); setHospitals(data.hospitals); } finally { setLoading(false); } };

  const save = async () => {
    await hospitalsApi.create(form);
    toast.success('Hospital added!');
    setModal(false);
    load();
  };

  return (
    <div className="page-enter">
      <PageHeader title="Hospitals" subtitle="Master list · Tie-up contracts"
        action={<Btn onClick={()=>setModal(true)}><span>+</span> Add Hospital</Btn>} />

      {loading ? <Spinner /> : hospitals.length===0 ? <Empty icon="🏥" message="No hospitals yet" /> :
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {hospitals.map(h=>(
            <div key={h._id} className="card">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="font-bold">{h.name}</div>
                  <div className="text-xs mt-0.5" style={{color:'var(--text2)'}}>{h.address}</div>
                </div>
                {h.tieUp?.isActive && <span className="badge badge-green text-[10px]">Tie-up</span>}
              </div>
              <div className="text-xs" style={{color:'var(--text3)'}}>📞 {h.phone} · ✉️ {h.email}</div>
              {h.tieUp?.isActive && (
                <div className="mt-2 rounded-lg p-2 text-xs" style={{background:'rgba(0,212,170,.07)',border:'1px solid rgba(0,212,170,.15)'}}>
                  {h.tieUp.discountPercent}% discount · {h.tieUp.creditDays}d credit
                </div>
              )}
            </div>
          ))}
        </div>
      }

      <Modal open={modal} onClose={()=>setModal(false)} title="Add Hospital">
        <div className="space-y-4">
          {[['name','Hospital Name','AIIMS'],['address','Address',''],['phone','Phone',''],['email','Email','']].map(([k,l,p])=>(
            <div key={k}>
              <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{color:'var(--text2)'}}>{l}</label>
              <input className="inp" placeholder={p} value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} />
            </div>
          ))}
          <div className="flex items-center gap-3 p-3 rounded-lg" style={{background:'var(--surface2)'}}>
            <input type="checkbox" id="tieup" checked={form.tieUp.isActive}
              onChange={e=>setForm(f=>({...f,tieUp:{...f.tieUp,isActive:e.target.checked}}))} className="w-4 h-4" />
            <label htmlFor="tieup" className="text-sm font-medium">Tie-up Hospital</label>
          </div>
          {form.tieUp.isActive && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{color:'var(--text2)'}}>Discount %</label>
                <input className="inp" type="number" value={form.tieUp.discountPercent}
                  onChange={e=>setForm(f=>({...f,tieUp:{...f.tieUp,discountPercent:Number(e.target.value)}}))} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 uppercase tracking-wide" style={{color:'var(--text2)'}}>Credit Days</label>
                <input className="inp" type="number" value={form.tieUp.creditDays}
                  onChange={e=>setForm(f=>({...f,tieUp:{...f.tieUp,creditDays:Number(e.target.value)}}))} />
              </div>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <Btn className="flex-1" onClick={save}>Save Hospital</Btn>
            <Btn variant="ghost" onClick={()=>setModal(false)}>Cancel</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
