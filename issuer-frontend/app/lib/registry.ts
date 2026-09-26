/**
 * The one place this site talks to the institution's registry.
 *
 * Two things live on the other end: whether we hold a person, and the award we hold for them.
 * Both are keyed, and neither belongs in a browser — the key is what names the institution, so a
 * key that reached a visitor would be a key handed to every visitor. Everything here therefore
 * runs on the server, and the pages never see the key.
 *
 * Configuration is named rather than defaulted. A deployment without a registry is not a
 * deployment with a default registry: it is one that cannot answer, and saying so is better than
 * quietly pointing at somebody else's.
 */

const TIMEOUT_MS = 15000;

export function registryConfiguration() {
  const baseUrl = String(process.env.REGISTRY_BASE_URL || '').trim().replace(/\/+$/, '');
  const apiKey = String(process.env.REGISTRY_API_KEY || '').trim();

  const missing = [
    baseUrl ? null : 'REGISTRY_BASE_URL',
    apiKey ? null : 'REGISTRY_API_KEY',
  ].filter(Boolean) as string[];

  return { baseUrl, apiKey, missing };
}

export type RegistryAnswer = {
  /** Whether the registry answered at all. A failure to answer is not a verdict. */
  reached: boolean;
  status: number;
  /** The body it answered with, when it answered with one. */
  body: Record<string, unknown> | null;
  error?: string;
};

/**
 * Ask the registry something, and always come back with an answer rather than an exception.
 *
 * Callers here have to render a sentence either way, so a thrown error would only have to be
 * caught again. What matters is that `reached: false` is distinguishable from a verdict, because
 * the two lead to different copy and only one of them is a fact about the applicant.
 */
export async function askRegistry(path: string, payload: unknown): Promise<RegistryAnswer> {
  const configuration = registryConfiguration();

  if (configuration.missing.length > 0) {
    return {
      reached: false,
      status: 0,
      body: null,
      error: `The registry is not configured: set ${configuration.missing.join(' and ')}`,
    };
  }

  try {
    const response = await fetch(`${configuration.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': configuration.apiKey,
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    let body: Record<string, unknown> | null = null;
    try {
      body = (await response.json()) as Record<string, unknown>;
    } catch {
      body = null;
    }

    return { reached: true, status: response.status, body };
  } catch (error) {
    console.error(`[Registry] ${path} could not be reached:`, (error as Error).message);
    return { reached: false, status: 0, body: null, error: (error as Error).message };
  }
}
