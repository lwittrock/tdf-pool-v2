import { useState, useEffect } from 'react';

interface TdfData {
  metadata: {
    current_stage: number;
    top_n_participants_for_directie: number;
  };
  leaderboard_by_stage: Record<string, any[]>;
  directie_leaderboard_by_stage: Record<string, any[]>;
  riders: Record<string, any>;
}

export function useTdfData() {
  const [data, setData] = useState<TdfData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const response = await fetch('/api/tdf-data');
        
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        
        const json = await response.json();
        setData(json);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch TDF data:', err);
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    
    // Optional: Refresh data every 30 seconds
    // const interval = setInterval(fetchData, 30000);
    // return () => clearInterval(interval);
  }, []);

  return { data, loading, error };
}