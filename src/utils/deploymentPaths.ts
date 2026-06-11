const normaliseBase = (base: string | undefined): string => {
  if (!base || base === './') return '/';
  return base.startsWith('/') ? base : `/${base}`;
};

export const getAppHref = (path = ''): string => {
  const base = normaliseBase(import.meta.env.BASE_URL);
  const suffix = path.replace(/^\/+/, '');
  return `${base}${base.endsWith('/') ? '' : '/'}${suffix}`.replace(/\/{2,}/g, '/');
};

export const getSiteHref = (path = ''): string => {
  const base = normaliseBase(import.meta.env.BASE_URL);
  const appBase = base.endsWith('/') ? base : `${base}/`;
  const siteBase = appBase.endsWith('/planner/') ? appBase.slice(0, -'planner/'.length) : appBase;
  const suffix = path.replace(/^\/+/, '');
  return `${siteBase}${suffix}`.replace(/\/{2,}/g, '/');
};
