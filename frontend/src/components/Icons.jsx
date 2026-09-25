// SVG icons copied from the wireframes.
const base = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: 'false' };

export const SparkIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" stroke="#C9AEE8" strokeWidth="2.4" {...base}>
    <path d="M12 2v6M12 16v6M4.9 4.9l4.2 4.2M14.9 14.9l4.2 4.2M2 12h6M16 12h6M4.9 19.1l4.2-4.2M14.9 9.1l4.2-4.2" />
  </svg>
);
export const PersonIcon = ({ size = 12, stroke = '#C9AEE8', width = 2.4 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" stroke={stroke} strokeWidth={width} {...base}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
  </svg>
);
export const CalendarIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" stroke="#C9AEE8" strokeWidth="2.4" {...base}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9h18M8 2v4M16 2v4" />
  </svg>
);
export const BoltIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" stroke="#C9AEE8" strokeWidth="2.4" {...base}>
    <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" />
  </svg>
);
export const UploadIcon = ({ size = 16, stroke = '#9A8CBB', width = 2.2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" stroke={stroke} strokeWidth={width} {...base}>
    <path d="M12 3v12M7 10l5 5 5-5M4 21h16" />
  </svg>
);
export const FileIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" stroke="#6D3FA0" strokeWidth="2" {...base}>
    <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
    <path d="M14 3v5h5" />
  </svg>
);
export const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" {...base}>
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);
export const AlertIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" stroke="#6D3FA0" strokeWidth="2" {...base}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5M12 16h.01" />
  </svg>
);
export const MailIcon = ({ size = 28, stroke = '#6D3FA0', width = 2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" stroke={stroke} strokeWidth={width} {...base}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 7l9 6 9-6" />
  </svg>
);
export const PencilIcon = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" {...base}>
    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);
export const GridIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" stroke="#FFFFFF" strokeWidth="2" {...base}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);
export const CheckIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" stroke="#1E8A4C" strokeWidth="3" {...base}>
    <path d="M20 6L9 17l-5-5" />
  </svg>
);
export const PlusIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" stroke="#6D3FA0" strokeWidth="2.4" {...base}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const LinkedinOutlineIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" stroke="#8A7DA8" strokeWidth="2" {...base}>
    <rect x="2" y="9" width="4" height="12" />
    <circle cx="4" cy="4" r="2" />
    <path d="M10 9v12M10 13a4 4 0 018 0v8" />
  </svg>
);
export const GoogleLogo = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
    <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1C3.3 21.3 7.3 24 12 24z" />
    <path fill="#FBBC05" d="M5.4 14.4c-.2-.7-.4-1.4-.4-2.4s.1-1.7.4-2.4V6.5H1.4C.5 8.3 0 10.1 0 12s.5 3.7 1.4 5.5l4-3.1z" />
    <path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0 7.3 0 3.3 2.7 1.4 6.5l4 3.1c.9-2.8 3.5-4.8 6.6-4.8z" />
  </svg>
);
export const LinkedinLogo = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <rect width="24" height="24" rx="4" fill="#0A66C2" />
    <path fill="#FFFFFF" d="M7.2 9.6H4.4V19h2.8V9.6zM5.8 5c-.9 0-1.6.7-1.6 1.6 0 .9.7 1.6 1.6 1.6.9 0 1.6-.7 1.6-1.6C7.4 5.7 6.7 5 5.8 5zM19.6 19h-2.8v-4.9c0-1.2 0-2.7-1.6-2.7-1.6 0-1.9 1.3-1.9 2.6V19H10.5V9.6h2.7v1.3h0c.4-.7 1.3-1.5 2.7-1.5 2.9 0 3.7 1.9 3.7 4.4V19z" />
  </svg>
);
