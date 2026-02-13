const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

const LOOPBACK_HOSTS = new Set(["localhost", "::1", "127.0.0.1"]);

const LOCAL_PROTOCOLS = new Set(["about:", "blob:", "chrome-extension:", "data:", "devtools:", "file:"]);

export interface OfflineUrlOptions {
  allowLoopbackHttp?: boolean;
}

const normalize = (value: string): string => value.trim().toLowerCase();

export const parseEnvBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = normalize(value);
  if (TRUE_VALUES.has(normalized)) {
    return true;
  }
  if (FALSE_VALUES.has(normalized)) {
    return false;
  }
  return fallback;
};

export const isLoopbackHost = (hostname: string): boolean => {
  const normalized = normalize(hostname);
  if (LOOPBACK_HOSTS.has(normalized)) {
    return true;
  }
  return /^127(?:\.\d{1,3}){3}$/.test(normalized);
};

export const isOfflineSafeUrl = (rawUrl: string, options: OfflineUrlOptions = {}): boolean => {
  try {
    const parsed = new URL(rawUrl);
    return isOfflineSafeParsedUrl(parsed, options);
  } catch {
    return false;
  }
};

export const isOfflineSafeParsedUrl = (
  parsed: URL,
  options: OfflineUrlOptions = {}
): boolean => {
  const protocol = normalize(parsed.protocol);
  if (LOCAL_PROTOCOLS.has(protocol)) {
    return true;
  }

  if (protocol === "http:" || protocol === "https:") {
    if (options.allowLoopbackHttp === false) {
      return false;
    }
    return isLoopbackHost(parsed.hostname);
  }

  return false;
};

export const strictOfflineEnabled = (value: string | undefined = process.env.JARVIS_STRICT_OFFLINE): boolean =>
  parseEnvBoolean(value, true);
