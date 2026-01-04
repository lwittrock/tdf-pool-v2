import type { VercelRequest, VercelResponse } from '@vercel/node';

interface ProcessStageRequest {
  stage_number: number;
}

interface ProcessStageResponse {
  success: boolean;
  stage_number: number;
  steps_completed: {
    update_active_selections: boolean;
    calculate_points: boolean;
  };
  results: {
    substitutions_made?: any[];
    participants_calculated?: number;
    total_points_awarded?: number;
  };
  errors?: string[];
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { stage_number }: ProcessStageRequest = req.body;

    if (!stage_number) {
      return res.status(400).json({ error: 'stage_number is required' });
    }

    const errors: string[] = [];
    const results: ProcessStageResponse['results'] = {};
    const stepsCompleted = {
      update_active_selections: false,
      calculate_points: false,
    };

    // Get base URL from request or environment
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
    const baseUrl = `${protocol}://${host}`;

    // Step 1: Update active selections (activate backups for DNS riders)
    console.log(`[Stage ${stage_number}] Step 1: Updating active selections...`);
    
    try {
      const updateResponse = await fetch(
        `${baseUrl}/api/admin/update-active-selections`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage_number }),
        }
      );

      const updateData = await updateResponse.json();

      if (!updateResponse.ok) {
        errors.push(`Active selections update failed: ${updateData.error || 'Unknown error'}`);
      } else {
        stepsCompleted.update_active_selections = true;
        results.substitutions_made = updateData.substitutions_made;
        console.log(`[Stage ${stage_number}] âœ… Active selections updated`);
        console.log(`   - DNS riders: ${updateData.dns_riders?.length || 0}`);
        console.log(`   - Substitutions made: ${updateData.substitutions_made?.length || 0}`);
      }
    } catch (error: any) {
      errors.push(`Active selections update error: ${error.message}`);
    }

    // Step 2: Calculate points
    console.log(`[Stage ${stage_number}] Step 2: Calculating points...`);
    
    try {
      const calculateResponse = await fetch(
        `${baseUrl}/api/admin/calculate-points`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage_number }),
        }
      );

      const calculateData = await calculateResponse.json();

      if (!calculateResponse.ok) {
        errors.push(`Points calculation failed: ${calculateData.error || 'Unknown error'}`);
        
        // Include validation errors if present
        if (calculateData.validation_errors) {
          calculateData.validation_errors.forEach((err: any) => {
            errors.push(`  - ${err.field}: ${err.message}`);
          });
        }
      } else {
        stepsCompleted.calculate_points = true;
        results.participants_calculated = calculateData.participants_calculated;
        results.total_points_awarded = calculateData.total_points_awarded;
        console.log(`[Stage ${stage_number}] âœ… Points calculated`);
        console.log(`   - Participants: ${calculateData.participants_calculated}`);
        console.log(`   - Total points awarded: ${calculateData.total_points_awarded}`);
      }
    } catch (error: any) {
      errors.push(`Points calculation error: ${error.message}`);
    }

    // Determine overall success
    const success = stepsCompleted.calculate_points && errors.length === 0;

    if (!success) {
      return res.status(400).json({
        success: false,
        stage_number,
        steps_completed: stepsCompleted,
        results,
        errors,
      });
    }

    return res.status(200).json({
      success: true,
      stage_number,
      steps_completed: stepsCompleted,
      results,
    });
  } catch (error: any) {
    console.error('Process stage error:', error);
    return res.status(500).json({
      error: `Internal server error: ${error.message}`,
    });
  }
}