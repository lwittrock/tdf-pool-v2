"""
Submit Tour de France startlist to API (UPDATED)
Uses new /api/submit-startlist endpoint
"""
import requests
from scrape_stage_results import TdFScraper
import json
import sys
import os


def submit_startlist_to_api(year: int, api_url: str):
    """
    Scrape TdF startlist and submit to API
    
    Args:
        year: Tour year
        api_url: Your API endpoint URL for startlist
    """
    print(f"\n{'='*70}")
    print(f"Scraping and Submitting TdF {year} Startlist")
    print(f"{'='*70}\n")
    
    # Scrape the startlist
    scraper = TdFScraper()
    
    try:
        startlist = scraper.get_startlist(year)
    except Exception as e:
        print(f"\n✗ Scraping failed: {e}")
        import traceback
        traceback.print_exc()
        return None
    
    if not startlist:
        print("\n✗ No riders found in startlist")
        return None
    
    print(f"\n{'='*70}")
    print("Scraped Startlist Summary:")
    print(f"{'='*70}")
    print(f"Total riders: {len(startlist)}")
    
    # Count teams
    teams = set(r['team_name'] for r in startlist if r['team_name'])
    print(f"Total teams: {len(teams)}")
    
    # Show preview
    print(f"\nFirst 5 riders:")
    for rider in startlist[:5]:
        print(f"  {rider['rider_number']:3d} - {rider['rider_name']:30s} ({rider['team_name']})")
    
    # Format for API (matches SubmitStartlistRequest interface)
    payload = {
        'year': year,
        'riders': [
            {
                'rider_number': r['rider_number'],
                'rider_name': r['rider_name'],
                'team_name': r['team_name']
            }
            for r in startlist
        ]
    }
    
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
            print("✓ Successfully submitted to API!")
            print(f"\nAPI Response:")
            data = result.get('data', {})
            print(f"  Riders inserted: {data.get('riders_inserted', 0)}")
            print(f"  Riders updated: {data.get('riders_updated', 0)}")
            
            # Show warnings if any
            warnings = data.get('warnings', [])
            if warnings:
                print(f"\n⚠ Warnings ({len(warnings)}):")
                for warning in warnings[:10]:  # Show first 10
                    print(f"  - {warning}")
                if len(warnings) > 10:
                    print(f"  ... and {len(warnings) - 10} more")
        else:
            print(f"✗ API returned error: {result.get('error')}")
            return None
        
        return result
        
    except requests.exceptions.RequestException as e:
        print(f"\n✗ API submission failed: {e}")
        if hasattr(e, 'response') and e.response is not None:
            try:
                error_data = e.response.json()
                print(f"Error details: {json.dumps(error_data, indent=2)}")
            except:
                print(f"Response: {e.response.text}")
        return None


if __name__ == "__main__":
    # Usage: python submit_startlist.py [year]
    
    # Default to your Vercel deployment
    API_URL = os.getenv('STARTLIST_API_URL', 'http://localhost:3000/api/submit-startlist')
    
    if len(sys.argv) >= 2:
        year = int(sys.argv[1])
    else:
        year = 2025
        print(f"Using default year: {year}")
    
    result = submit_startlist_to_api(year, API_URL)
    
    if result:
        print(f"\n{'='*70}")
        print("✓ STARTLIST SUBMISSION COMPLETE")
        print(f"{'='*70}")
    else:
        print(f"\n{'='*70}")
        print("✗ STARTLIST SUBMISSION FAILED")
        print(f"{'='*70}")
        sys.exit(1)