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
  '/documents': {
    title: 'Activity Log',
    description: 'Review your task updates, timeline, and work activity.',
  },
  '/evaluation': {
    title: 'Evaluation',
    description: 'View your performance metrics and supervisor feedback.',
  },
  '/settings': {
    title: 'Settings',
    description: 'Manage your account preferences and profile.',
  },
};

export function normalizePath(path) {
  return pageMeta[path] ? path : '/';
}

export function getPageMeta(path) {
  return pageMeta[path] ?? { title: 'Internship Management System', description: '' };
}
