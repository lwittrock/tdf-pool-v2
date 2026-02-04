/**
 * TestDataSeeder Component
 * 
 * Add this component to your EtappeBeheer page to easily seed test data.
 * Place it at the top of the page, above the stage entry form.
 */

import { useState } from 'react';

export function TestDataSeeder() {
  const [selectedStage, setSelectedStage] = useState(5);
  const [isSeeding, setIsSeeding] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleSeed = async () => {
    setIsSeeding(true);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/seed-test-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ through_stage: selectedStage })
      });

      const data = await response.json();

      if (data.success) {
        setMessage({
          type: 'success',
          text: `✅ ${data.message}. Processed ${data.stages_processed.length} stages.`
        });
        // Refresh the page after 2 seconds to show updated data
        setTimeout(() => window.location.reload(), 2000);
      } else {
        setMessage({
          type: 'error',
          text: `❌ ${data.error}`
        });
      }
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: `❌ Failed to seed data: ${error.message}`
      });
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div style={{
      backgroundColor: '#fff3cd',
      border: '2px solid #ffc107',
      borderRadius: '8px',
      padding: '20px',
      marginBottom: '24px'
    }}>
      <h3 style={{ margin: '0 0 16px 0', color: '#856404' }}>
        🧪 Test Data Seeder
      </h3>
      
      <p style={{ margin: '0 0 16px 0', color: '#856404' }}>
        Quickly populate your database with realistic test data for development and testing.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <label htmlFor="stage-select" style={{ fontWeight: 'bold', color: '#856404' }}>
          Load data through stage:
        </label>
        
        <select 
          id="stage-select"
          value={selectedStage}
          onChange={(e) => setSelectedStage(Number(e.target.value))}
          disabled={isSeeding}
          style={{
            padding: '8px 12px',
            borderRadius: '4px',
            border: '1px solid #ffc107',
            fontSize: '14px'
          }}
        >
          {[...Array(21)].map((_, i) => (
            <option key={i + 1} value={i + 1}>
              Stage {i + 1}
            </option>
          ))}
        </select>

        <button
          onClick={handleSeed}
          disabled={isSeeding}
          style={{
            padding: '8px 16px',
            backgroundColor: isSeeding ? '#ccc' : '#ffc107',
            color: '#000',
            border: 'none',
            borderRadius: '4px',
            fontWeight: 'bold',
            cursor: isSeeding ? 'not-allowed' : 'pointer'
          }}
        >
          {isSeeding ? '⏳ Seeding...' : '🚀 Load Test Data'}
        </button>
      </div>

      {message && (
        <div style={{
          padding: '12px',
          borderRadius: '4px',
          backgroundColor: message.type === 'success' ? '#d4edda' : '#f8d7da',
          color: message.type === 'success' ? '#155724' : '#721c24',
          border: `1px solid ${message.type === 'success' ? '#c3e6cb' : '#f5c6cb'}`
        }}>
          {message.text}
        </div>
      )}

      <div style={{ 
        marginTop: '12px', 
        fontSize: '12px', 
        color: '#856404',
        borderTop: '1px solid #ffc107',
        paddingTop: '12px'
      }}>
        <strong>Note:</strong> This will:
        <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
          <li>Generate realistic stage results with top TdF riders</li>
          <li>Assign jersey holders automatically</li>
          <li>Calculate all points and rankings</li>
          <li>Process everything and generate JSON files</li>
        </ul>
      </div>
    </div>
  );
}
