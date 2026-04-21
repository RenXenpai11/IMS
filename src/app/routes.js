export const pageMeta = {
  '/login': {
    title: 'Login',
    description: 'Access your Internship Management System account.',
  },
  '/signup': {
    title: 'Sign Up',
    description: 'Create a new Internship Management System account.',
  },
  '/': {
    title: 'Dashboard',
    description: 'Welcome back. Here is your internship overview.',
  },
  '/time-log': {
    title: 'Time Log',
    description: 'Track and manage your daily work hours.',
  },
  '/requests': {
    title: 'Requests',
    description: 'Manage your absence and overtime requests',
  },
  '/activity': {
    title: 'Activity Log',
    description: 'Review your task updates, timeline, and work activity.',
  },
  '/documents': {
    title: 'Documents',
    description: 'Upload and manage your important documents, records, and links.',
  },
  '/settings': {
    title: 'Settings',
    description: 'Manage your account preferences and profile.',
  },
  '/supervisor': {
    title: 'Supervisor Dashboard',
    description: 'Assign students and monitor internship progress.',
  },
  '/supervisor/interns': {
    title: 'Intern Management',
    description: 'Manage and monitor assigned interns.',
  },
  '/supervisor/time-logs': {
    title: 'Time Log Management',
    description: 'Review and manage assigned student time entries.',
  },
  '/supervisor/requests': {
    title: 'Intern Requests',
    description: 'Approve or reject assigned student requests.',
  },
  '/supervisor/activity': {
    title: 'Activity Log',
    description: 'Review activity logs of assigned students.',
  },
  '/supervisor/documents': {
    title: 'Documents',
    description: 'Review documents submitted by assigned students.',
  },
};

export function normalizePath(path) {
  return pageMeta[path] ? path : '/';
}

export function getPageMeta(path) {
  return pageMeta[path] ?? { title: 'Internship Management System', description: '' };
}
