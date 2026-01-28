/**
 * Submit Startlist API
 * Endpoint for scraper to submit Tour de France startlist
 *
 * This populates the riders table at the start of the Tour
 */
import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type {
  SubmitStartlistRequest,
  SubmitStartlistSuccess
} from '../lib/scraper-types.js';

console.log('[DEBUG] SUPABASE_URL:', process.env.SUPABASE_URL);
console.log('[DEBUG] SERVICE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 20) + '...');

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    const { year, riders }: SubmitStartlistRequest = req.body;

    // Validation
    if (!year || !riders || !Array.isArray(riders) || riders.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'year and riders array are required'
      });
    }

    console.log(`[Submit Startlist] Importing ${riders.length} riders for Tour ${year}`);

    const warnings: string[] = [];
    let ridersInserted = 0;
    let ridersUpdated = 0;

    // Process each rider
    for (const rider of riders) {
      if (!rider.rider_name || !rider.team_name) {
        warnings.push(`Skipping rider with missing data: ${JSON.stringify(rider)}`);
        continue;
      }

      // Check if rider already exists
      const { data: existingRider } = await supabase
        .from('riders')
        .select('id, name, team, rider_number')
        .eq('name', rider.rider_name)
        .maybeSingle();

      if (existingRider) {
        // Update existing rider
        const { error: updateError } = await supabase
          .from('riders')
          .update({
            team: rider.team_name,
            rider_number: rider.rider_number,
            is_active: true,
          })
          .eq('id', existingRider.id);

        if (updateError) {
          warnings.push(`Failed to update rider ${rider.rider_name}: ${updateError.message}`);
        } else {
          ridersUpdated++;
          console.log(`[Submit Startlist] Updated: ${rider.rider_name} (#${rider.rider_number})`);
        }
      } else {
        // Insert new rider
        const { error: insertError } = await supabase
          .from('riders')
          .insert({
            name: rider.rider_name,
            team: rider.team_name,
            rider_number: rider.rider_number,
            is_active: true,
          });

        if (insertError) {
          warnings.push(`Failed to insert rider ${rider.rider_name}: ${insertError.message}`);
        } else {
          ridersInserted++;
          console.log(`[Submit Startlist] Inserted: ${rider.rider_name} (#${rider.rider_number})`);
        }
      }
    }

    console.log(`[Submit Startlist] Complete: ${ridersInserted} inserted, ${ridersUpdated} updated`);

    return res.status(200).json({
      success: true,
      data: {
        riders_inserted: ridersInserted,
        riders_updated: ridersUpdated,
        warnings: warnings.length > 0 ? warnings : undefined,
      },
    } as SubmitStartlistSuccess);

  } catch (error: any) {
    console.error('[Submit Startlist] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message,
    });
  }
}