export class ConfigError extends Error {}

export interface ServerConfig {
  apiBaseUrl: URL;
  username: string;
  password: string;
}

export function loadConfig(environment: NodeJS.ProcessEnv): ServerConfig {
  const username = requiredEnvironmentValue(environment, 'RESUME_API_USERNAME');
  const password = requiredEnvironmentValue(environment, 'RESUME_API_PASSWORD');
  const rawBaseUrl = requiredEnvironmentValue(environment, 'RESUME_API_BASE_URL');

  let apiBaseUrl: URL;
  try {
    apiBaseUrl = new URL(rawBaseUrl);
  } catch {
    throw new ConfigError('RESUME_API_BASE_URL must be an absolute URL.');
  }

  if (
    apiBaseUrl.username !== '' ||
    apiBaseUrl.password !== '' ||
    apiBaseUrl.pathname !== '/' ||
    apiBaseUrl.search !== '' ||
    apiBaseUrl.hash !== ''
  ) {
    throw new ConfigError('RESUME_API_BASE_URL must be an origin without credentials, path, query, or fragment.');
  }

  if (
    apiBaseUrl.protocol !== 'https:' &&
    !(apiBaseUrl.protocol === 'http:' && isLoopbackHost(apiBaseUrl.hostname))
  ) {
    throw new ConfigError('RESUME_API_BASE_URL must use HTTPS except for loopback development.');
  }

  return { apiBaseUrl, username, password };
}

function requiredEnvironmentValue(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name];
  if (value === undefined || value === '') {
    throw new ConfigError(`${name} is required.`);
  }

  return value;
}

function isLoopbackHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]' || hostname === '::1') {
    return true;
  }

  const octets = hostname.split('.');
  return (
    octets.length === 4 &&
    octets[0] === '127' &&
    octets.slice(1).every((octet) => /^(0|[1-9]\d{0,2})$/.test(octet) && Number(octet) <= 255)
  );
}
