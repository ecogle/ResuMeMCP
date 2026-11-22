import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.js';

const validEnvironment: NodeJS.ProcessEnv = {
  RESUME_API_BASE_URL: 'https://api.example.test',
  RESUME_API_USERNAME: 'test-admin',
  RESUME_API_PASSWORD: 'test-secret',
};

describe('loadConfig', () => {
  it.each([
    'RESUME_API_BASE_URL',
    'RESUME_API_USERNAME',
    'RESUME_API_PASSWORD',
  ])('rejects missing %s without exposing credentials', (variable) => {
    const environment = { ...validEnvironment };
    delete environment[variable];

    let thrown: unknown;
    try {
      loadConfig(environment);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ConfigError);
    const message = thrown instanceof Error ? thrown.message : '';
    expect(message).not.toContain('test-admin');
    expect(message).not.toContain('test-secret');
  });

  it('normalizes an optional trailing slash on the API origin', () => {
    const withoutSlash = loadConfig(validEnvironment).apiBaseUrl;
    const withSlash = loadConfig({
      ...validEnvironment,
      RESUME_API_BASE_URL: 'https://api.example.test/',
    }).apiBaseUrl;

    expect(withoutSlash.origin).toBe('https://api.example.test');
    expect(withSlash.origin).toBe(withoutSlash.origin);
  });

  it.each([
    'http://localhost:8000',
    'http://127.0.0.1:8000',
    'http://[::1]:8000',
  ])('allows loopback HTTP for local development: %s', (baseUrl) => {
    const config = loadConfig({
      ...validEnvironment,
      RESUME_API_BASE_URL: baseUrl,
    });

    expect(config.apiBaseUrl.origin).toBe(new URL(baseUrl).origin);
  });

  it.each([
    'http://api.example.test',
    'http://192.0.2.10:8000',
    'https://test-admin:test-secret@api.example.test',
    'https://api.example.test/proxy',
    'https://api.example.test?debug=true',
    'not a URL',
  ])('rejects an unsafe or malformed API base URL: %s', (baseUrl) => {
    expect(() =>
      loadConfig({
        ...validEnvironment,
        RESUME_API_BASE_URL: baseUrl,
      }),
    ).toThrow(ConfigError);
  });
});
