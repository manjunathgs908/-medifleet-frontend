// Page re-exports — each page is in AllPages.jsx for bundle efficiency
// App.jsx imports these; in a large project split into individual files.

export { default }     from './DashboardPage';
export { TripsPage as default_trips }       from './AllPages';
export { BillingPage as default_billing }   from './AllPages';
export { FinancePage as default_finance }   from './AllPages';
export { SalaryPage  as default_salary  }   from './AllPages';
export { LeadsPage   as default_leads   }   from './AllPages';
export { CompliancePage as default_compliance } from './AllPages';
export { HospitalsPage  as default_hospitals  } from './AllPages';
