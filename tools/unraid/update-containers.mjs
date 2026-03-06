const baseUrl = new URL(process.env.UNRAID_BASE_URL || 'http://unraid.local');
const username = process.env.UNRAID_USERNAME;
const password = process.env.UNRAID_PASSWORD;
const containers = String(process.env.UNRAID_CONTAINERS || 'Stirling-PDF')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

if (!username || !password || containers.length === 0) {
  console.error('Missing UNRAID credentials or container list');
  process.exit(1);
}

const jar = new Map();

const storeCookies = (response) => {
  for (const cookie of response.headers.getSetCookie?.() || []) {
    const token = String(cookie).split(';', 1)[0];
    const index = token.indexOf('=');
    if (index > 0) {
      jar.set(token.slice(0, index).trim(), token.slice(index + 1).trim());
    }
  }
};

const rawFetch = async (input, options = {}) => {
  const headers = new Headers(options.headers);
  if (jar.size) {
    headers.set('cookie', [...jar].map(([key, value]) => `${key}=${value}`).join('; '));
  }
  if (!headers.has('cache-control')) headers.set('cache-control', 'no-cache');
  if (!headers.has('pragma')) headers.set('pragma', 'no-cache');

  const response = await fetch(new URL(input, baseUrl), {
    ...options,
    headers,
    redirect: 'manual',
  });
  storeCookies(response);
  return response;
};

const fetchFollow = async (input, options = {}, maxRedirects = 10) => {
  let url = new URL(input, baseUrl);
  let request = { ...options };

  for (let index = 0; index <= maxRedirects; index += 1) {
    const response = await rawFetch(url, request);
    if (response.status < 300 || response.status >= 400) {
      return { response, loginRedirect: false };
    }

    const location = response.headers.get('location');
    if (!location) {
      return { response, loginRedirect: false };
    }

    url = new URL(location, url);
    if (url.pathname === '/login') {
      return { response, loginRedirect: true };
    }

    const method = (request.method || 'GET').toUpperCase();
    if (response.status === 303 || (response.status === 302 && method !== 'GET' && method !== 'HEAD')) {
      request = { ...request, method: 'GET', body: undefined };
    }
  }

  return { response: null, loginRedirect: true };
};

const ensureNoConfigError = async (response) => {
  const text = await response.text().catch(() => '');
  if (text.toLowerCase().includes('configuration not found')) {
    throw new Error('Unraid reported configuration not found');
  }
};

(async () => {
  try {
    await rawFetch('/login');

    const login = await fetchFollow('/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username, password }),
    });

    if (login.loginRedirect) {
      throw new Error('Unraid login failed');
    }

    const dockerPage = await fetchFollow(`/Docker?_=${Date.now()}`);
    if (dockerPage.loginRedirect || dockerPage.response?.status >= 400) {
      throw new Error('Unraid Docker page unavailable');
    }
    dockerPage.response?.body?.cancel?.();

    const url = new URL('/plugins/dynamix.docker.manager/include/CreateDocker.php', baseUrl);
    url.searchParams.set('updateContainer', 'true');
    for (const container of containers) {
      url.searchParams.append('ct[]', container);
    }

    const response = await rawFetch(url, {
      signal: AbortSignal.timeout(10 * 60 * 1000),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location') || '';
      if (new URL(location, url).pathname === '/login') {
        throw new Error('Unraid session expired');
      }
    }

    if (response.status >= 400) {
      throw new Error(`Unraid update failed: ${response.status}`);
    }

    await ensureNoConfigError(response);
    process.exit(0);
  } catch (error) {
    console.error(error?.message || error);
    process.exit(1);
  }
})();
