import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface TdfData {
  metadata: {
    current_stage: number;
    top_n_participants_for_directie: number;
  };
  leaderboard_by_stage: Record<string, any[]>;
  directie_leaderboard_by_stage: Record<string, any[]>;
  riders: Record<string, any>;
}

interface TdfDataContextType {
  data: TdfData | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  // Riders-specific
  ridersData: Record<string, any> | null;
  ridersLoading: boolean;
  ridersError: Error | null;
  fetchRiders: () => Promise<void>;
}

const TdfDataContext = createContext<TdfDataContextType | undefined>(undefined);

export function TdfDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<TdfData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Separate state for riders data
  const [ridersData, setRidersData] = useState<Record<string, any> | null>(null);
  const [ridersLoading, setRidersLoading] = useState(false);
  const [ridersError, setRidersError] = useState<Error | null>(null);

  const fetchData = async () => {
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
  };

  const fetchRiders = async () => {
    // Don't fetch if already loaded
    if (ridersData) return;

    try {
      setRidersLoading(true);
      const response = await fetch('/api/riders');
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const json = await response.json();
      setRidersData(json);
      setRidersError(null);
    } catch (err) {
      console.error('Failed to fetch riders data:', err);
      setRidersError(err as Error);
    } finally {
      setRidersLoading(false);
    }
  };

  // Fetch leaderboard data once on mount
  useEffect(() => {
    fetchData();
  }, []);

  return (
    <TdfDataContext.Provider value={{ 
      data, 
      loading, 
      error, 
      refetch: fetchData,
      ridersData,
      ridersLoading,
      ridersError,
      fetchRiders
    }}>
      {children}
    </TdfDataContext.Provider>
  );
}

export function useTdfData() {
  const context = useContext(TdfDataContext);
  if (context === undefined) {
    throw new Error('useTdfData must be used within a TdfDataProvider');
  }
  return context;
}