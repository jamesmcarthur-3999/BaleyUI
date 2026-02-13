/**
 * Simple user-agent parser for the admin session table.
 * Extracts browser name + version and OS from a userAgent string.
 */

export interface ParsedUserAgent {
  browser: string;
  os: string;
}

export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  if (!ua) return { browser: 'Unknown', os: 'Unknown' };

  const browser = parseBrowser(ua);
  const os = parseOS(ua);

  return { browser, os };
}

function parseBrowser(ua: string): string {
  // Order matters: check specific browsers before generic ones
  if (ua.includes('Edg/')) {
    const ver = ua.match(/Edg\/([\d.]+)/)?.[1];
    return ver ? `Edge ${ver}` : 'Edge';
  }
  if (ua.includes('OPR/') || ua.includes('Opera')) {
    const ver = ua.match(/OPR\/([\d.]+)/)?.[1];
    return ver ? `Opera ${ver}` : 'Opera';
  }
  if (ua.includes('Chrome/') && !ua.includes('Edg/')) {
    const ver = ua.match(/Chrome\/([\d.]+)/)?.[1];
    return ver ? `Chrome ${ver}` : 'Chrome';
  }
  if (ua.includes('Safari/') && !ua.includes('Chrome') && !ua.includes('Chromium')) {
    const ver = ua.match(/Version\/([\d.]+)/)?.[1];
    return ver ? `Safari ${ver}` : 'Safari';
  }
  if (ua.includes('Firefox/')) {
    const ver = ua.match(/Firefox\/([\d.]+)/)?.[1];
    return ver ? `Firefox ${ver}` : 'Firefox';
  }
  return 'Unknown';
}

function parseOS(ua: string): string {
  if (ua.includes('Windows NT 10')) return 'Windows 10+';
  if (ua.includes('Windows NT')) return 'Windows';
  if (ua.includes('Mac OS X')) {
    const ver = ua.match(/Mac OS X ([\d_]+)/)?.[1];
    return ver ? `macOS ${ver.replace(/_/g, '.')}` : 'macOS';
  }
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
  if (ua.includes('Android')) {
    const ver = ua.match(/Android ([\d.]+)/)?.[1];
    return ver ? `Android ${ver}` : 'Android';
  }
  if (ua.includes('Linux')) return 'Linux';
  if (ua.includes('CrOS')) return 'ChromeOS';
  return 'Unknown';
}
