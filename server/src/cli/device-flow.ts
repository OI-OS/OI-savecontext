/**
 * RFC 8628 Device Authorization Grant Flow
 * Implements device code flow for CLI authentication
 */

import type { DeviceCodeResponse, DeviceTokenResponse, DeviceAuthResult, DeviceFlowOptions } from '../types/index.js';
import { getCloudApiUrl, saveCredentials } from '../utils/config.js';

// Lambda API Gateway endpoints (mcp.savecontext.dev)
const DEVICE_CODE_ENDPOINT = '/auth/device/code';
const DEVICE_TOKEN_ENDPOINT = '/auth/device/token';

/**
 * Request a device code from the server
 */
export async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  const baseUrl = getCloudApiUrl();
  const response = await fetch(`${baseUrl}${DEVICE_CODE_ENDPOINT}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to request device code: ${error}`);
  }

  return response.json() as Promise<DeviceCodeResponse>;
}

/**
 * Poll for token after user authorizes
 * Note: RFC 8628 specifies 400 status for authorization_pending/slow_down,
 * so we parse JSON for both success and 400 responses.
 */
export async function pollForToken(deviceCode: string, interval: number): Promise<DeviceTokenResponse> {
  const baseUrl = getCloudApiUrl();
  const response = await fetch(`${baseUrl}${DEVICE_TOKEN_ENDPOINT}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_code: deviceCode }),
  });

  // Parse JSON for both 200 (success) and 400 (pending/slow_down/expired per RFC 8628)
  if (response.ok || response.status === 400) {
    return response.json() as Promise<DeviceTokenResponse>;
  }

  const error = await response.text();
  throw new Error(`Failed to poll for token: ${error}`);
}

/**
 * Wait for specified interval (in seconds)
 */
function sleep(seconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

/**
 * Execute the complete device authorization flow
 * @param options - Flow options including callbacks and whether to save credentials
 */
export async function executeDeviceFlow(
  options: DeviceFlowOptions,
): Promise<DeviceAuthResult> {
  const { onCodeReceived, onPolling, saveCredentials: shouldSave = true } = options;

  try {
    // Step 1: Request device code
    const codeResponse = await requestDeviceCode();

    // Step 2: Display code to user
    onCodeReceived(codeResponse.user_code, codeResponse.verification_uri);

    // Step 3: Poll for authorization
    const expiresAt = Date.now() + (codeResponse.expires_in * 1000);
    let interval = codeResponse.interval;

    while (Date.now() < expiresAt) {
      await sleep(interval);

      if (onPolling) {
        onPolling();
      }

      const tokenResponse = await pollForToken(codeResponse.device_code, interval);

      if (tokenResponse.error) {
        switch (tokenResponse.error) {
          case 'authorization_pending':
            // Keep polling
            continue;
          case 'slow_down':
            // Increase interval by 5 seconds
            interval += 5;
            continue;
          case 'expired_token':
            return { success: false, error: 'Device code expired. Please try again.' };
          case 'access_denied':
            return { success: false, error: 'Authorization denied by user.' };
          default:
            return { success: false, error: `Unknown error: ${tokenResponse.error}` };
        }
      }

      // Success - we have the API key
      if (tokenResponse.api_key) {
        // Only save credentials if requested (default: true)
        if (shouldSave) {
          const credentials = {
            apiKey: tokenResponse.api_key,
            email: tokenResponse.email,
            provider: tokenResponse.provider,
            createdAt: new Date().toISOString(),
          };
          saveCredentials(credentials);
        }

        return {
          success: true,
          apiKey: tokenResponse.api_key,
          keyPrefix: tokenResponse.key_prefix,
          userId: tokenResponse.user_id,
          email: tokenResponse.email,
          provider: tokenResponse.provider,
        };
      }
    }

    return { success: false, error: 'Device code expired. Please try again.' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}
