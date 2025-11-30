/**
 * SaveContext Configuration
 * Handles persistent storage of auth credentials and settings
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { SaveContextLocalConfig, SaveContextCredentials } from '../types/index.js';

// Configuration directory and file paths
const CONFIG_DIR = join(homedir(), '.savecontext');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const CREDENTIALS_FILE = join(CONFIG_DIR, 'credentials.json');

// Cloud URL settings
export const CLOUD_MCP_URL = 'https://mcp.savecontext.dev/mcp';
export const CLOUD_WEB_URL = 'https://savecontext.dev';
export const CLOUD_API_URL = 'https://mcp.savecontext.dev'; // Lambda API Gateway base (for device auth)

/**
 * Ensure config directory exists
 */
function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

/**
 * Load configuration
 */
export function loadConfig(): SaveContextLocalConfig {
  try {
    if (existsSync(CONFIG_FILE)) {
      const data = readFileSync(CONFIG_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch {
    // Return defaults on error
  }
  return { mode: 'local' };
}

/**
 * Save configuration
 */
export function saveConfig(config: SaveContextLocalConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}

/**
 * Load stored credentials
 */
export function loadCredentials(): SaveContextCredentials | null {
  try {
    if (existsSync(CREDENTIALS_FILE)) {
      const data = readFileSync(CREDENTIALS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch {
    // Return null on error
  }
  return null;
}

/**
 * Save credentials securely
 */
export function saveCredentials(credentials: SaveContextCredentials): void {
  ensureConfigDir();
  writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2), { mode: 0o600 });
}

/**
 * Delete stored credentials (for logout)
 */
export function deleteCredentials(): boolean {
  try {
    if (existsSync(CREDENTIALS_FILE)) {
      unlinkSync(CREDENTIALS_FILE);
      return true;
    }
  } catch {
    // Ignore errors
  }
  return false;
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  const creds = loadCredentials();
  return creds !== null && !!creds.apiKey;
}

/**
 * Get API key for cloud requests
 */
export function getApiKey(): string | null {
  const creds = loadCredentials();
  return creds?.apiKey ?? null;
}

/**
 * Get the cloud MCP URL (allows override via env var)
 */
export function getCloudMcpUrl(): string {
  return process.env.SAVECONTEXT_MCP_URL || CLOUD_MCP_URL;
}

/**
 * Get the cloud web URL for auth flows (allows override via env var)
 */
export function getCloudWebUrl(): string {
  return process.env.SAVECONTEXT_WEB_URL || CLOUD_WEB_URL;
}

/**
 * Get the cloud API URL for device auth (Lambda API Gateway)
 */
export function getCloudApiUrl(): string {
  return process.env.SAVECONTEXT_API_URL || CLOUD_API_URL;
}

/**
 * Format provider name for display (capitalize)
 */
export function formatProvider(provider?: string): string {
  if (!provider) return 'Unknown';
  switch (provider.toLowerCase()) {
    case 'github':
      return 'GitHub';
    case 'google':
      return 'Google';
    default:
      return provider.charAt(0).toUpperCase() + provider.slice(1);
  }
}
