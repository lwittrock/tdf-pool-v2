"""
Submit scraped stage data to API (UPDATED)
Uses new /api/submit-stage-results endpoint with fuzzy matching
"""
import requests
from scrape_stage_results import TdFScraper
import json
import sys
import os


def submit_stage_to_api(year: int, stage_number: int, api_url: str, force: bool = False):
    """
    Scrape stage and submit to API
    
    Args:
        year: Tour year
        stage_number: Stage number
        api_url: Your API endpoint URL
        force: Force update even if stage is complete
    """
    print(f"\n{'='*70}")
    print(f"Scraping and Submitting TdF {year} Stage {stage_number}")
    print(f"{'='*70}\n")
    
    # Scrape the data
    scraper = TdFScraper()
    
    try:
        stage_data = scraper.get_complete_stage_data(year, stage_number)
    except Exception as e:
        print(f"\nâœ— Scraping failed: {e}")
        import traceback
        traceback.print_exc()
        return None
    
    # Format for API (matches SubmitStageResultsRequest interface)
    payload = {
        'stage_number': stage_data['stage_number'],
        'date': stage_data.get('date'),
        'distance': stage_data.get('distance'),
        'departure_city': stage_data.get('departure_city'),
        'arrival_city': stage_data.get('arrival_city'),
        'stage_type': stage_data.get('stage_type'),
        'difficulty': stage_data.get('difficulty'),
        'won_how': stage_data.get('won_how'),
        'winning_team': stage_data.get('winning_team'),
        'top_20_finishers': stage_data['top_20_finishers'],
        'jerseys': stage_data['jerseys'],
        'combativity': stage_data.get('combativity'),
        'dnf_riders': stage_data.get('dnf_riders', []),
        'dns_riders': stage_data.get('dns_riders', []),
        'force': force,
    }
    
    print(f"\n{'='*70}")
    print("Scraped Data Summary:")
    print(f"{'='*70}")
    print(f"Stage: {stage_data['stage_number']}")
    print(f"Date: {stage_data.get('date', 'N/A')}")
    print(f"Route: {stage_data.get('departure_city', 'N/A')} â†' {stage_data.get('arrival_city', 'N/A')}")
    print(f"Distance: {stage_data.get('distance', 'N/A')} km")
    print(f"Results: {len(stage_data['top_20_finishers'])} riders")
    if stage_data['top_20_finishers']:
        print(f"Winner: {stage_data['top_20_finishers'][0]['rider_name']}")
    print(f"Winning Team: {stage_data.get('winning_team', 'N/A')}")
    print(f"\nJerseys:")
    print(f"  Yellow: {stage_data['jerseys'].get('yellow', 'N/A')}")
    print(f"  Green: {stage_data['jerseys'].get('green', 'N/A')}")
    print(f"  Polka Dot: {stage_data['jerseys'].get('polka_dot', 'N/A')}")
    print(f"  White: {stage_data['jerseys'].get('white', 'N/A')}")
    print(f"\nCombativity: {stage_data.get('combativity', 'N/A')}")
    print(f"DNF: {len(stage_data.get('dnf_riders', []))} riders")
    print(f"DNS: {len(stage_data.get('dns_riders', []))} riders")
    
    # Submit to API
    print(f"\n{'='*70}")
    print(f"Submitting to API: {api_url}")
    print(f"{'='*70}\n")
    
    try:
        response = requests.post(
            api_url,
            json=payload,
            headers={'Content-Type': 'application/json'},
            timeout=30
        )
        
        response.raise_for_status()
        result = response.json()
        
        if result.get('success'):
            print("Successfully submitted to API!")
            print(f"\nAPI Response:")
            data = result.get('data', {})
            print(f"  Stage ID: {data.get('stage_id')}")
            print(f"  Stage Number: {data.get('stage_number')}")
            
            # Show rider matching warnings
            rider_warnings = data.get('rider_warnings', [])
            if rider_warnings:
                print(f"\nâš  Rider Matching Warnings ({len(rider_warnings)}):")
                for warning in rider_warnings[:15]:  # Show first 15
                    if warning['issue'] == 'not_found':
                        print(f"  - NOT FOUND: {warning['rider_name']}")
                    elif warning['issue'] == 'low_confidence':
                        print(f"  - FUZZY MATCH: '{warning['rider_name']}' â†' '{warning.get('matched_to')}' "
                              f"(confidence: {warning.get('similarity_score', 0):.2f})")
                if len(rider_warnings) > 15:
                    print(f"  ... and {len(rider_warnings) - 15} more")
            
            # Show general warnings
            general_warnings = data.get('general_warnings', [])
            if general_warnings:
                print(f"\nâš  General Warnings ({len(general_warnings)}):")
                for warning in general_warnings[:10]:
                    print(f"  - {warning}")
                if len(general_warnings) > 10:
                    print(f"  ... and {len(general_warnings) - 10} more")
            
            if not rider_warnings and not general_warnings:
                print("\n✓ No warnings - all riders matched perfectly!")
                
        else:
            print(f"âœ— API returned error: {result.get('error')}")
            details = result.get('details')
            if details:
                print(f"Details: {details}")
            return None
        
        return result
        
    except requests.exceptions.RequestException as e:
        print(f"\nâœ— API submission failed: {e}")
        if hasattr(e, 'response') and e.response is not None:
            try:
                error_data = e.response.json()
                print(f"Error details: {json.dumps(error_data, indent=2)}")
            except:
                print(f"Response: {e.response.text}")
        return None


if __name__ == "__main__":
    # Usage: python submit_to_api.py [year] [stage_number] [--force]
    
    # Default to your Vercel deployment
    API_URL = os.getenv('STAGE_RESULTS_API_URL', 'http://localhost:3000/api/submit-stage-results')
    
    force = '--force' in sys.argv
    args = [arg for arg in sys.argv[1:] if arg != '--force']
    
    if len(args) >= 2:
        year = int(args[0])
        stage_number = int(args[1])
    else:
        # Default: find latest stage
        year = 2025
        scraper = TdFScraper()
        stage_number = scraper.find_latest_stage(year)
        
        if not stage_number:
            print("No completed stages found!")
            sys.exit(1)
        
        print(f"Found latest stage: {stage_number}")
    
    result = submit_stage_to_api(year, stage_number, API_URL, force=force)
    
    if result:
        print(f"\n{'='*70}")
        print("STAGE SUBMISSION COMPLETE")
        print(f"{'='*70}")
        print("\nNext steps:")
        print("1. Review any warnings above")
        print("2. If data looks good, run: POST /api/admin/process-stage")
        print(f"   with body: {{\"stage_number\": {stage_number}}}")
    else:
        print(f"\n{'='*70}")
        print("âœ— STAGE SUBMISSION FAILED")
        print(f"{'='*70}")
        sys.exit(1)