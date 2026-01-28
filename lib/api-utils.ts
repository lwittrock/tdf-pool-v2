/**
 * API Utilities
 * 
 * Helper functions for API routes
 */

/**
 * Get the full API URL for making internal API calls
 * (e.g., process-stage calling update-active-selections)
 * 
 * @param path - API path (e.g., '/api/admin/calculate-points')
 * @returns Full URL for the API endpoint
 * 
 * @example
 * const url = getApiUrl('/api/admin/update-active-selections');
 * const response = await fetch(url, { method: 'POST', ... });
 */
export function getApiUrl(path: string): string {
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  
  // In Vercel production
  if (process.env.VERCEL_URL) {
    // VERCEL_URL doesn't include protocol, add https://
    return `https://${process.env.VERCEL_URL}${normalizedPath}`;
  }
  
  // In local development
  if (process.env.NODE_ENV === 'development') {
    return `http://localhost:3000${normalizedPath}`;
  }
  
  // Fallback: use relative URL (assumes same domain)
  return normalizedPath;
}

/**
 * Standardized error response helper
 * 
 * @param message - User-friendly error message
 * @param details - Technical details (only shown in development)
 * @returns Standardized error object
 */
export function createErrorResponse(
  message: string,
  details?: unknown
): {
  success: false;
  error: string;
  details?: unknown;
} {
  const isDev = process.env.NODE_ENV === 'development';
  
  return {
    success: false,
    error: message,
    ...(isDev && details ? { details } : {}),
  };
}

/**
 * Standardized success response helper
 */
export function createSuccessResponse<T = unknown>(
  data?: T,
  message?: string
): {
  success: true;
  data?: T;
  message?: string;
} {
  return {
    success: true,
    ...(data !== undefined ? { data } : {}),
    ...(message ? { message } : {}),
  };
}

/**
 * Validate required environment variables
 * Throws if any are missing
 */
export function validateEnv(requiredVars: string[]): void {
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }
}

/**
 * Safe JSON parse with fallback
 */
export function safeJsonParse<T = unknown>(
  json: string,
  fallback: T
): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}
