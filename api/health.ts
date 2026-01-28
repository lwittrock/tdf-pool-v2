/**
 * Health Check API
 * Tests connections to Supabase and Vercel Blob
 */
import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  const checks = {
    supabase: { status: 'unknown', message: '' },
    blob: { status: 'unknown', message: '' },
    env: { status: 'unknown', message: '' }
  };

  // Check environment variables
  const requiredEnvVars = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'BLOB_READ_WRITE_TOKEN'
  ];

  const missingVars = requiredEnvVars.filter(v => !process.env[v]);
  
  if (missingVars.length > 0) {
    checks.env.status = 'error';
    checks.env.message = `Missing: ${missingVars.join(', ')}`;
  } else {
    checks.env.status = 'ok';
    checks.env.message = 'All required env vars present';
  }

  // Check Supabase connection
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error } = await supabase
      .from('riders')
      .select('count', { count: 'exact', head: true });

    if (error) throw error;

    checks.supabase.status = 'ok';
    checks.supabase.message = `Connected (${data?.length || 0} riders)`;
  } catch (error: any) {
    checks.supabase.status = 'error';
    checks.supabase.message = error.message;
  }

  // Check Blob storage (basic check)
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    checks.blob.status = 'ok';
    checks.blob.message = 'Token configured';
  } else {
    checks.blob.status = 'warning';
    checks.blob.message = 'No token found';
  }

  const allOk = Object.values(checks).every(c => c.status === 'ok');

  return res.status(allOk ? 200 : 500).json({
    healthy: allOk,
    checks,
    timestamp: new Date().toISOString()
  });
}