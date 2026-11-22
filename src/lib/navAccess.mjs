// src/lib/navAccess.mjs
//
// Which CRM pages each role is shown in navigation — moved here unchanged
// from components/Shell.jsx's NAV_GROUPS (labels, routes, roles, badges and
// grouping exactly as on main) so the desktop sidebar and the phone "More"
// sheet read ONE list and can never disagree. Shell adds the icons.
//
// This is navigation only. What a role may actually open is still decided
// by App.jsx's route tables and the backend's role middleware; the mobile
// tests check that all three agree (src/mobile/__tests__).
export const NAV_ACCESS = [
  { id: 'overview', label: 'Overview', pinned: true, items: [
    { label: 'Dashboard',   to: '/',           roles: ['owner'] },
  ] },
  { id: 'operations', label: 'Operations', items: [
    { label: 'Dispatch',    to: '/dispatch',   roles: ['owner', 'telecaller'] },
    { label: 'Trips',       to: '/trips',      roles: ['owner', 'telecaller'] },
    { label: 'Fleet',       to: '/fleet',      roles: ['owner', 'telecaller'] },
    { label: 'SOS Alerts',  to: '/sos',        roles: ['owner', 'telecaller'], badgeKey: 'sos' },
    { label: 'Trip Alerts', to: '/trip-alerts', roles: ['owner', 'telecaller'], badgeKey: 'noResponse' },
    { label: 'Posting Alerts', to: '/posting-alerts', roles: ['owner', 'telecaller'] },
  ] },
  { id: 'customers', label: 'Customers', items: [
    { label: 'Leads',       to: '/leads',      roles: ['owner', 'telecaller'], badgeKey: 'leads' },
    { label: 'WhatsApp Leads', to: '/whatsapp-leads', roles: ['owner', 'telecaller'] },
    { label: 'WhatsApp Chats', to: '/whatsapp-conversations', roles: ['owner', 'telecaller'] },
    { label: 'Callbacks',   to: '/callbacks',  roles: ['owner', 'telecaller'], badgeKey: 'callbacks' },
    { label: 'Call Logs',   to: '/call-logs',  roles: ['owner', 'telecaller'] },
    { label: 'AI Telecaller (pilot)', to: '/ai-telecaller', roles: ['owner'] },
  ] },
  { id: 'finance', label: 'Finance', items: [
    { label: 'Billing',     to: '/billing',    roles: ['owner'] },
    { label: 'GST Invoicing', to: '/invoicing', roles: ['owner'] },
    { label: 'Finance',     to: '/finance',    roles: ['owner'] },
    { label: 'Salaries',    to: '/salary',     roles: ['owner'] },
    { label: 'Advances',    to: '/advances',   roles: ['owner'] },
  ] },
  { id: 'management', label: 'Management', items: [
    { label: 'Staff',       to: '/staff',      roles: ['owner'] },
    { label: 'Owners',      to: '/owners',     roles: ['owner'] },
    { label: 'Hospitals',   to: '/hospitals',  roles: ['owner', 'telecaller'] },
    { label: 'Compliance',  to: '/compliance', roles: ['owner'] },
  ] },
  { id: 'marketing', label: 'Marketing', items: [
    { label: 'SEO Studio',  to: '/seo-studio', roles: ['owner'] },
  ] },
];

/** Every page `role` is shown, in sidebar order. */
export const navItemsFor = (role) => NAV_ACCESS.flatMap((g) => g.items.filter((i) => i.roles.includes(role)).map((i) => ({ ...i, group: g.id, groupLabel: g.label })));
