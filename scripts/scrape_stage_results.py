"""
Tour de France scraper - Complete version with startlist and team data
"""
import cloudscraper
from procyclingstats import Stage, RaceCombativeRiders, RaceStartlist
from selectolax.parser import HTMLParser
from typing import Dict, List, Optional
from datetime import datetime


class TdFScraper:
    """Complete Tour de France scraper with startlist support"""
    
    def __init__(self):
        self.scraper = cloudscraper.create_scraper()
        self.base_url = "https://www.procyclingstats.com"
    
    def get_startlist(self, year: int) -> List[Dict]:
        """
        Get complete Tour de France startlist with all riders and teams
        
        Args:
            year: Tour year (e.g., 2025)
        
        Returns:
            List of riders with their teams, numbers, and nationalities
        """
        url = f"{self.base_url}/race/tour-de-france/{year}/startlist"
        print(f"Fetching startlist from {url}")
        
        try:
            html_content = self.scraper.get(url).text
            startlist = RaceStartlist(url, html_content, update_html=False)
            
            # Get all available fields
            riders_data = startlist.startlist(
                'rider_name',
                'rider_number',
                'team_name',
                'nationality'
            )
            
            # Format rider names and clean data
            formatted_riders = []
            for rider in riders_data:
                formatted_riders.append({
                    'rider_name': self._format_name(rider.get('rider_name')),
                    'rider_number': rider.get('rider_number'),
                    'team_name': rider.get('team_name'),
                    'nationality': rider.get('nationality'),
                })
            
            print(f"  Found {len(formatted_riders)} riders")
            return formatted_riders
            
        except Exception as e:
            print(f"  Warning: Failed to get startlist: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    def get_complete_stage_data(self, year: int, stage_number: int) -> Dict:
        """
        Get COMPLETE stage data including results, jerseys, combativity, DNF/DNS, and winning team
        
        Args:
            year: Tour year (e.g., 2025)
            stage_number: Stage number (1-21)
        
        Returns:
            Complete stage data ready for API submission
        """
        print(f"Scraping TdF {year} Stage {stage_number}...")
        
        # Get main stage data
        stage_data = self._get_stage_data(year, stage_number)
        
        # Get combativity
        combativity = self._get_combativity(year, stage_number)
        
        # Get DNF/DNS from stage results
        dnf_dns = self._get_dnf_dns(stage_data)
        
        # Get winning team from team day classification
        winning_team = self._get_team_classification(year, stage_number)
        
        # Combine everything
        return {
            "stage_number": stage_number,
            "date": stage_data.get('date'),
            "distance": stage_data.get('distance'),
            "departure_city": stage_data.get('departure'),
            "arrival_city": stage_data.get('arrival'),
            "stage_type": stage_data.get('stage_type'),
            "difficulty": self._calculate_difficulty(stage_data.get('profile_score', 0)),
            "won_how": stage_data.get('won_how'),
            "winning_team": winning_team,
            "top_20_finishers": self._format_top_20(stage_data.get('results', [])),
            "jerseys": {
                "yellow": self._format_name(self._get_jersey_leader(stage_data.get('gc', []))),
                "green": self._format_name(self._get_jersey_leader(stage_data.get('points', []))),
                "polka_dot": self._format_name(self._get_jersey_leader(stage_data.get('kom', []))),
                "white": self._format_name(self._get_jersey_leader(stage_data.get('youth', []))),
            },
            "combativity": self._format_name(combativity) if combativity else None,
            "dnf_riders": [self._format_name(name) for name in dnf_dns['dnf']],
            "dns_riders": [self._format_name(name) for name in dnf_dns['dns']],
        }
    
    def _get_stage_data(self, year: int, stage_number: int) -> Dict:
        """Get main stage data (results, jerseys, etc.)"""
        url = f"{self.base_url}/race/tour-de-france/{year}/stage-{stage_number}"
        print(f"  Fetching stage data from {url}")
        
        html_content = self.scraper.get(url).text
        stage = Stage(url, html_content, update_html=False)
        
        # Get parsed data
        stage_data = stage.parse()
        
        # Get full results WITH status field and team
        full_results = stage.results('rider_name', 'rank', 'time', 'status', 'team_name')
        stage_data['results'] = full_results
        
        return stage_data
    
    def _get_team_classification(self, year: int, stage_number: int) -> Optional[str]:
        """
        Get the winning team from team day classification (best combined time for stage)
        
        This is from the complementary results page showing the team that had
        the best combined time for this specific stage (not overall GC).
        
        Returns:
            Name of the winning team for this stage, or None if not available
        """
        url = f"{self.base_url}/race/tour-de-france/{year}/stage-{stage_number}/info/complementary-results"
        print(f"  Fetching team day classification from complementary results")
        
        try:
            html_content = self.scraper.get(url).text
            html = HTMLParser(html_content)
            
            # Look for table with headers: Rnk, Team, Class, Time, Time won/lost
            tables = html.css('table')
            
            for table in tables:
                headers = table.css('th')
                if not headers:
                    continue
                
                header_texts = [h.text(strip=True) for h in headers]
                
                # Check if this is the team day classification table
                # Headers should include 'Team' and 'Time'
                if 'Team' in header_texts and 'Time' in header_texts and 'Rnk' in header_texts:
                    # Get first row (winning team)
                    rows = table.css('tbody tr')
                    if not rows:
                        continue
                    
                    first_row = rows[0]
                    cells = first_row.css('td')
                    
                    if len(cells) >= 2:
                        # Find the Team column index
                        team_col_idx = header_texts.index('Team')
                        team_name = cells[team_col_idx].text(strip=True)
                        
                        if team_name:
                            print(f"    Winning team: {team_name}")
                            return team_name
            
            print(f"    Warning: Team day classification not found")
            return None
            
        except Exception as e:
            print(f"    Warning: Failed to get team day classification: {e}")
            return None
    
    def _get_combativity(self, year: int, stage_number: int) -> Optional[str]:
        """Get combativity award winner for specific stage"""
        url = f"{self.base_url}/race/tour-de-france/{year}/results/combative-riders"
        print(f"  Fetching combativity from {url}")
        
        try:
            html_content = self.scraper.get(url).text
            combative = RaceCombativeRiders(url, html_content, update_html=False)
            
            # Get combative riders data
            combative_data = combative.combative_riders()
            
            # Format: [{'stage_name': 'Stage 1', 'rider_name': '...', ...}, ...]
            stage_name = f"Stage {stage_number}"
            
            for entry in combative_data:
                if entry.get('stage_name') == stage_name:
                    rider_name = entry.get('rider_name')
                    print(f"    Found combativity: {rider_name}")
                    return rider_name
            
            print(f"    Warning: No combativity data found for Stage {stage_number}")
            return None
            
        except Exception as e:
            print(f"    Warning: Failed to get combativity: {e}")
            return None
    
    def _get_dnf_dns(self, stage_data: Dict) -> Dict[str, List[str]]:
        """
        Get DNF and DNS riders from stage results using status field
        
        Stage results include 'status' field with values: DF, DNF, DNS, OTL, DSQ
        """
        print(f"  Extracting DNF/DNS from stage results")
        
        dnf_riders = []
        dns_riders = []
        
        try:
            all_results = stage_data.get('results', [])
            
            for result in all_results:
                rider_name = result.get('rider_name', '')
                status = result.get('status', '')
                
                if not rider_name:
                    continue
                
                # Check status field
                if status == 'DNS':
                    dns_riders.append(rider_name)
                elif status in ('DNF', 'OTL', 'DSQ'):
                    dnf_riders.append(rider_name)
            
            print(f"    Found {len(dnf_riders)} DNF, {len(dns_riders)} DNS")
            
        except Exception as e:
            print(f"    Warning: Failed to extract DNF/DNS: {e}")
        
        return {
            'dnf': dnf_riders,
            'dns': dns_riders
        }
    
    def _format_top_20(self, results: List[Dict]) -> List[Dict]:
        """Format top 20 results for API"""
        formatted = []
        
        for i, result in enumerate(results[:20], 1):
            formatted.append({
                "rider_name": self._format_name(result.get('rider_name', '')),
                "position": result.get('rank', i),
                "time_gap": result.get('time') or result.get('gap') or "0:00"
            })
        
        return formatted
    
    def _get_jersey_leader(self, classification: List[Dict]) -> Optional[str]:
        """Get jersey leader from classification"""
        if classification and len(classification) > 0:
            return classification[0].get('rider_name')
        return None
    
    def _format_name(self, name: Optional[str]) -> Optional[str]:
        """
        Convert 'Surname Firstname(s)' to 'Firstname(s) Surname'
        
        ProcyclingStats provides names in format: "Surname Firstname(s)"
        We need to convert to: "Firstname(s) Surname"
        
        Examples:
            'Yates Simon' -> 'Simon Yates'
            'van den Berg Marijn' -> 'Marijn van den Berg'  
            'Johannessen Tobias Halland' -> 'Tobias Halland Johannessen'
            'Zimmermann Georg' -> 'Georg Zimmermann'
            'HEALY Ben' -> 'Ben Healy'  (combativity is uppercase)
        
        Strategy:
        - If name contains lowercase particles (van, de, den, etc.), those are part of surname
        - Surname = everything up to and INCLUDING the word after the last particle
        - If no particles, surname is just the first word
        - First name = everything after surname
        - Handle ALL CAPS surnames by title-casing them
        """
        if not name:
            return None
        
        name = name.strip()
        parts = name.split()
        
        if len(parts) < 2:
            return name
        
        # Particles that are part of surnames (always lowercase in ProcyclingStats)
        particles = {'van', 'de', 'der', 'den', 'le', 'la', 'del', 'da', 'di', 'dos', 'von', 'zu'}
        
        # Find last particle in the name
        last_particle_idx = -1
        for i, part in enumerate(parts):
            if part.lower() in particles:
                last_particle_idx = i
        
        if last_particle_idx >= 0:
            # Surname includes particles + the word after the last particle
            # e.g., "van den Berg" = particles (van, den) + next word (Berg)
            surname_end_idx = min(last_particle_idx + 2, len(parts))
            surname_parts = parts[:surname_end_idx]
            first_name_parts = parts[surname_end_idx:]
        else:
            # No particles - surname is just the first word
            surname_parts = [parts[0]]
            first_name_parts = parts[1:]
        
        if not first_name_parts:
            return name
        
        # Handle ALL CAPS surnames (from combativity data)
        surname_parts = [p.title() if p.isupper() else p for p in surname_parts]
        first_name_parts = [p.title() if p.isupper() else p for p in first_name_parts]
        
        # Reconstruct as "Firstname Surname"
        first_name = ' '.join(first_name_parts)
        surname = ' '.join(surname_parts)
        
        return f"{first_name} {surname}"
    
    def _calculate_difficulty(self, profile_score: int) -> str:
        """Calculate difficulty based on profile score"""
        if profile_score >= 150:
            return "Very Hard"
        elif profile_score >= 100:
            return "Hard"
        elif profile_score >= 50:
            return "Medium"
        else:
            return "Easy"
    
    def find_latest_stage(self, year: int) -> Optional[int]:
        """Find most recent completed stage"""
        today = datetime.now().date()
        
        # Check stages in reverse order
        for stage_num in range(21, 0, -1):
            try:
                stage_data = self._get_stage_data(year, stage_num)
                
                # Check if has results
                results = stage_data.get('results', [])
                if not results:
                    continue
                
                # Check if date is today or past
                date_str = stage_data.get('date')
                if date_str:
                    stage_date = datetime.strptime(date_str, '%Y-%m-%d').date()
                    if stage_date <= today:
                        print(f"  Latest completed stage: {stage_num}")
                        return stage_num
                        
            except Exception as e:
                # Stage not available yet, continue checking earlier stages
                continue
        
        return None


def scrape_stage(year: int, stage_number: int) -> Dict:
    """Quick function to scrape a single stage"""
    scraper = TdFScraper()
    return scraper.get_complete_stage_data(year, stage_number)


def scrape_latest_stage(year: int = 2025) -> Optional[Dict]:
    """Quick function to scrape the most recent stage"""
    scraper = TdFScraper()
    latest = scraper.find_latest_stage(year)
    
    if latest:
        return scraper.get_complete_stage_data(year, latest)
    return None


def scrape_startlist(year: int = 2025) -> List[Dict]:
    """Quick function to scrape the complete startlist"""
    scraper = TdFScraper()
    return scraper.get_startlist(year)


if __name__ == "__main__":
    # Test the scraper
    print("Testing scraper functionality:")
    print("\n" + "="*70)
    print("1. Testing startlist scraping")
    print("="*70)
    
    scraper = TdFScraper()
    startlist = scraper.get_startlist(2025)
    
    if startlist:
        print(f"\nStartlist preview (first 5 riders):")
        import json
        print(json.dumps(startlist[:5], indent=2))
    
    print("\n" + "="*70)
    print("2. Testing stage scraping")
    print("="*70)
    
    stage_data = scraper.get_complete_stage_data(2025, 10)
    print(f"\nStage data preview:")
    print(f"Winner: {stage_data['top_20_finishers'][0]['rider_name']}")
    print(f"Winning team: {stage_data['winning_team']}")