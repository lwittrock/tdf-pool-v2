"""
TdF Pool - Fixed Selenium Scraper (Based on Actual PCS Structure)

Properly extracts all data based on real procyclingstats.com structure
"""

import json
import time
import unicodedata
import re
from typing import Dict, Optional, List

from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager


class FixedSeleniumScraper:
    """Fixed Selenium scraper based on actual PCS website structure"""
    
    def __init__(self, headless: bool = True):
        print("Initializing browser...")
        
        chrome_options = Options()
        if headless:
            chrome_options.add_argument("--headless=new")
        
        chrome_options.add_argument("--disable-blink-features=AutomationControlled")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--window-size=1920,1080")
        chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
        chrome_options.add_experimental_option('useAutomationExtension', False)
        
        service = Service(ChromeDriverManager().install())
        self.driver = webdriver.Chrome(service=service, options=chrome_options)
        self.driver.execute_cdp_cmd('Network.setUserAgentOverride', {
            "userAgent": 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        
        print("✓ Browser ready!")
    
    def __del__(self):
        if hasattr(self, 'driver'):
            self.driver.quit()
    
    def reformat_rider_name(self, name: str) -> str:
        """Format rider name properly"""
        if not name:
            return ""
        
        # Remove accents
        normalized = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode('utf-8')
        parts = normalized.strip().split()
        
        if len(parts) < 2:
            return name.title()
        
        # Handle surname prefixes
        surname_prefixes = {'van', 'der', 'de', 'den', 'le', 'dos', 'da', 'di', 'del', 'la'}
        
        def proper_case(part):
            lower = part.lower()
            return lower if lower in surname_prefixes else part.title()
        
        # Assume last word is first name
        first_name = proper_case(parts[-1])
        surname = ' '.join(proper_case(p) for p in parts[:-1])
        
        return f"{first_name} {surname}"
    
    def parse_time_gap(self, text: str, is_winner: bool = False) -> str:
        """Parse time gap from text"""
        if is_winner:
            return "0:00"
        
        # Look for +X:XX or +XX
        plus_match = re.search(r'\+\s*(\d+:\d+)', text)
        if plus_match:
            return f"+{plus_match.group(1)}"
        
        # Just numbers (seconds)
        num_match = re.search(r'\+\s*(\d+)″', text)
        if num_match:
            seconds = int(num_match.group(1))
            return f"+0:{seconds:02d}"
        
        # Same time or empty
        return "+0:00"
    
    def scrape_stage(self, year: int, stage_number: int) -> Optional[Dict]:
        """Scrape a stage with all data"""
        
        base_url = f"https://www.procyclingstats.com/race/tour-de-france/{year}"
        stage_url = f"{base_url}/stage-{stage_number}"
        
        print(f"\n{'='*70}")
        print(f"Scraping: TdF {year} Stage {stage_number}")
        print(f"URL: {stage_url}")
        print(f"{'='*70}")
        
        try:
            print("Loading main stage page...")
            self.driver.get(stage_url)
            WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.TAG_NAME, "body"))
            )
            time.sleep(2)
            print("✓ Page loaded")
            
            data = {
                'stage_number': stage_number,
                'date': '',
                'distance': '',
                'departure_city': '',
                'arrival_city': '',
                'stage_type': '',
                'difficulty': '',
                'won_how': '',
                'top_20_finishers': [],
                'jerseys': {'yellow': '', 'green': '', 'polka_dot': '', 'white': ''},
                'combativity': '',
                'team_classification': [],
                'dnf_riders': [],
                'dns_riders': [],
            }
            
            # Extract stage info and results from main page
            self._extract_stage_info(data)
            self._extract_results(data)
            
            # Extract jerseys (by visiting each tab)
            self._extract_jerseys(data, year, stage_number)
            
            # Extract combativity (from separate page)
            self._extract_combativity(data, year, stage_number)
            
            # Extract team classification
            self._extract_team_classification(data, year, stage_number)
            
            # Extract DNF/DNS (from separate page)
            self._extract_dnf_dns(data, year, stage_number)
            
            return data
            
        except Exception as e:
            print(f"✗ Error: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    def _extract_stage_info(self, data: Dict):
        """Extract stage metadata from title and page"""
        try:
            # Get page title: "Stage 1 » Lille Métropole › Lille Métropole (184.9km)"
            page_text = self.driver.page_source
            
            # Extract route from title or heading
            # Pattern: "City1 › City2 (XXkm)"
            route_match = re.search(r'([^›»]+)\s*›\s*([^(]+)\s*\(([^)]+)\)', page_text)
            if route_match:
                data['departure_city'] = route_match.group(1).strip()
                data['arrival_city'] = route_match.group(2).strip()
                data['distance'] = route_match.group(3).strip()
            
            # Date from page
            date_match = re.search(r'(\d{1,2}\s+\w+\s+\d{4})', page_text)
            if date_match:
                data['date'] = date_match.group(1)
            
            print(f"✓ Stage info: {data.get('distance', 'N/A')}, {data.get('departure_city', 'N/A')} → {data.get('arrival_city', 'N/A')}")
            
        except Exception as e:
            print(f"⚠ Stage info: {e}")
    
    def _extract_results(self, data: Dict):
        """Extract top 20 finishers from results table"""
        try:
            # Find main results table
            table = self.driver.find_element(By.CSS_SELECTOR, "table.results")
            rows = table.find_elements(By.TAG_NAME, "tr")
            
            print(f"  Found results table with {len(rows)} rows")
            
            for row in rows:
                if len(data['top_20_finishers']) >= 20:
                    break
                
                try:
                    cells = row.find_elements(By.TAG_NAME, "td")
                    if len(cells) < 4:
                        continue
                    
                    # Position (first cell) - "Rnk" or number
                    pos_text = cells[0].text.strip()
                    if not pos_text or not pos_text[0].isdigit():
                        continue
                    
                    position = int(re.match(r'(\d+)', pos_text).group(1))
                    
                    # Rider name (find link with /rider/)
                    rider_name = ""
                    for cell in cells:
                        try:
                            link = cell.find_element(By.CSS_SELECTOR, "a[href*='/rider/']")
                            rider_name = link.text.strip()
                            break
                        except:
                            continue
                    
                    if not rider_name:
                        continue
                    
                    # Time gap - look in all cells for time format
                    time_gap = "0:00" if position == 1 else "+0:00"
                    row_text = row.text
                    
                    # Parse time from row text
                    time_gap = self.parse_time_gap(row_text, position == 1)
                    
                    data['top_20_finishers'].append({
                        'rider_name': self.reformat_rider_name(rider_name),
                        'position': position,
                        'time_gap': time_gap
                    })
                    
                except Exception:
                    continue
            
            print(f"✓ Extracted {len(data['top_20_finishers'])} finishers")
            if data['top_20_finishers']:
                print(f"  Winner: {data['top_20_finishers'][0]['rider_name']}")
            
        except Exception as e:
            print(f"⚠ Results extraction: {e}")
    
    def _extract_jerseys(self, data: Dict, year: int, stage: int):
        """Extract jersey leaders by clicking tabs (which change URL)"""
        try:
            print("  Fetching jersey leaders...")
            
            classifications = {
                'gc': 'yellow',
                'points': 'green',
                'kom': 'polka_dot',
                'youth': 'white'
            }
            
            for classification, jersey in classifications.items():
                try:
                    # Navigate to classification page
                    class_url = f"https://www.procyclingstats.com/race/tour-de-france/{year}/stage-{stage}-{classification}"
                    self.driver.get(class_url)
                    time.sleep(1.5)
                    
                    # Wait for table to load
                    WebDriverWait(self.driver, 5).until(
                        EC.presence_of_element_located((By.CSS_SELECTOR, "table"))
                    )
                    
                    # Find the results table
                    table = self.driver.find_element(By.CSS_SELECTOR, "table.results")
                    
                    # Find first rider link in table
                    rider_link = table.find_element(By.CSS_SELECTOR, "a[href*='/rider/']")
                    rider_name = self.reformat_rider_name(rider_link.text.strip())
                    data['jerseys'][jersey] = rider_name
                    
                except Exception as e:
                    # Classification might not exist yet
                    pass
            
            # Go back to main stage page
            self.driver.get(f"https://www.procyclingstats.com/race/tour-de-france/{year}/stage-{stage}")
            time.sleep(1)
            
            print(f"✓ Jerseys: Yellow={data['jerseys']['yellow'] or 'N/A'}, Green={data['jerseys']['green'] or 'N/A'}, Polka={data['jerseys']['polka_dot'] or 'N/A'}, White={data['jerseys']['white'] or 'N/A'}")
            
        except Exception as e:
            print(f"⚠ Jersey extraction: {e}")
    
    def _extract_combativity(self, data: Dict, year: int, stage: int):
        """Extract combativity from /results/combative-riders page"""
        try:
            print("  Fetching combativity award...")
            
            # Navigate to combativity page
            combativity_url = f"https://www.procyclingstats.com/race/tour-de-france/{year}/results/combative-riders"
            self.driver.get(combativity_url)
            time.sleep(1.5)
            
            # Find table with combativity awards
            # Look for row with "Stage X" then get rider name
            rows = self.driver.find_elements(By.CSS_SELECTOR, "tbody tr, table tr")
            
            for row in rows:
                row_text = row.text
                # Look for "Stage 1" or "Stage 1 " pattern
                if f"Stage {stage} " in row_text or f"Stage {stage}\t" in row_text or row_text.startswith(f"Stage {stage}"):
                    # Find rider link in this row
                    try:
                        rider_link = row.find_element(By.CSS_SELECTOR, "a[href*='/rider/']")
                        data['combativity'] = self.reformat_rider_name(rider_link.text.strip())
                        break
                    except:
                        continue
            
            print(f"✓ Combativity: {data['combativity'] or 'N/A'}")
            
        except Exception as e:
            print(f"⚠ Combativity extraction: {e}")
    
    def _extract_team_classification(self, data: Dict, year: int, stage: int):
        """Extract team classification from stage-X-teams-gc page, Today tab"""
        try:
            print("  Fetching team classification...")
            
            # Navigate to teams page
            teams_url = f"https://www.procyclingstats.com/race/tour-de-france/{year}/stage-{stage}-teams-gc"
            self.driver.get(teams_url)
            time.sleep(1.5)
            
            # Look for "Today" section or table with stage results
            # The page has tabs "General" and "Today"
            # Try to find and click "Today" tab
            try:
                today_tab = self.driver.find_element(By.XPATH, "//a[contains(text(), 'Today')]")
                today_tab.click()
                time.sleep(1)
            except:
                # Today might already be selected or might not exist
                pass
            
            # Find the table (should be "Team day classification")
            table = self.driver.find_element(By.CSS_SELECTOR, "table")
            rows = table.find_elements(By.TAG_NAME, "tr")
            
            teams = []
            for row in rows[:3]:  # Top 3 teams
                try:
                    cells = row.find_elements(By.TAG_NAME, "td")
                    if len(cells) < 2:
                        continue
                    
                    # Position
                    pos_text = cells[0].text.strip()
                    if not pos_text or not pos_text[0].isdigit():
                        continue
                    position = int(re.match(r'(\d+)', pos_text).group(1))
                    
                    # Team name (second cell usually, or find link)
                    team_name = ""
                    for cell in cells[1:]:  # Skip first cell (position)
                        text = cell.text.strip()
                        # Team names are longer text without special chars
                        if len(text) > 5 and not re.match(r'^[\d:+\s″]+$', text):
                            team_name = text
                            break
                    
                    if team_name:
                        teams.append({
                            'position': position,
                            'team_name': team_name
                        })
                
                except Exception:
                    continue
            
            data['team_classification'] = teams
            
            print(f"✓ Teams: {len(teams)} extracted")
            if teams:
                print(f"  Leading team: {teams[0]['team_name']}")
            
        except Exception as e:
            print(f"⚠ Team classification: {e}")
            data['team_classification'] = []
    
    def _extract_dnf_dns(self, data: Dict, year: int, stage: int):
        """Extract DNF/DNS from /results/dropouts page"""
        try:
            print("  Fetching DNF/DNS riders...")
            
            # Navigate to dropouts page
            dropouts_url = f"https://www.procyclingstats.com/race/tour-de-france/{year}/results/dropouts"
            self.driver.get(dropouts_url)
            time.sleep(1.5)
            
            # Find table with dropouts
            rows = self.driver.find_elements(By.CSS_SELECTOR, "tbody tr, table tr")
            
            for row in rows:
                row_text = row.text
                
                # Check if this row is for our stage
                if f"Stage {stage} " in row_text or f"Stage {stage}\t" in row_text or row_text.startswith(f"Stage {stage}"):
                    # Find rider name
                    try:
                        rider_link = row.find_element(By.CSS_SELECTOR, "a[href*='/rider/']")
                        rider_name = self.reformat_rider_name(rider_link.text.strip())
                        
                        # Determine if DNF or DNS from row text
                        if 'DNS' in row_text:
                            data['dns_riders'].append(rider_name)
                        else:  # DNF, OTL, DSQ
                            data['dnf_riders'].append(rider_name)
                    except:
                        continue
            
            print(f"✓ DNF: {len(data['dnf_riders'])}, DNS: {len(data['dns_riders'])}")
            
        except Exception as e:
            print(f"⚠ DNF/DNS extraction: {e}")


def main():
    """Main function"""
    
    print("""
╔══════════════════════════════════════════════════════════════╗
║   Fixed Selenium Scraper (Based on Real PCS Structure)      ║
╚══════════════════════════════════════════════════════════════╝
    """)
    
    YEAR = 2025
    STAGE = 1
    
    print(f"\nScraping TdF {YEAR} Stage {STAGE}...")
    print("Run browser in background? (y/n): ", end='')
    headless = input().strip().lower() == 'y'
    
    scraper = FixedSeleniumScraper(headless=headless)
    data = scraper.scrape_stage(YEAR, STAGE)
    
    if data:
        print("\n" + "="*70)
        print("✓ SUCCESS!")
        print("="*70)
        
        # Display summary
        print(f"\nStage Info:")
        print(f"  Date: {data.get('date', 'N/A')}")
        print(f"  Distance: {data.get('distance', 'N/A')}")
        print(f"  Route: {data.get('departure_city', 'N/A')} → {data.get('arrival_city', 'N/A')}")
        
        print(f"\nResults:")
        print(f"  Top finishers: {len(data['top_20_finishers'])}")
        if data['top_20_finishers']:
            for i, rider in enumerate(data['top_20_finishers'][:5], 1):
                print(f"    {i}. {rider['rider_name']} ({rider['time_gap']})")
        
        print(f"\nJerseys:")
        for jersey, rider in data['jerseys'].items():
            print(f"  {jersey.title()}: {rider or 'N/A'}")
        
        print(f"\nCombativity: {data.get('combativity', 'N/A')}")
        
        print(f"\nTeam Classification:")
        if data.get('team_classification'):
            for team in data['team_classification']:
                print(f"  {team['position']}. {team['team_name']}")
        else:
            print(f"  N/A")
        
        print(f"\nDNF/DNS:")
        print(f"  DNF: {len(data['dnf_riders'])}")
        if data['dnf_riders']:
            print(f"    {', '.join(data['dnf_riders'][:5])}")
        print(f"  DNS: {len(data['dns_riders'])}")
        if data['dns_riders']:
            print(f"    {', '.join(data['dns_riders'][:5])}")
        
        # Save to file
        filename = f"stage_{YEAR}_{STAGE}_fixed.json"
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        
        print(f"\n✓ Saved to: {filename}")
        
        # Ask if user wants to import to API
        print(f"\nImport this to your API? (y/n): ", end='')
        if input().strip().lower() == 'y':
            try:
                import requests
                
                url = "http://localhost:3000/api/admin/manual-entry"
                data['force'] = True
                
                print("Sending to API...")
                response = requests.post(url, json=data, timeout=30)
                
                if response.status_code == 200:
                    result = response.json()
                    if result.get('success'):
                        print("✓ Stage imported to database!")
                    else:
                        print(f"✗ API error: {result.get('error')}")
                else:
                    print(f"✗ HTTP {response.status_code}")
            
            except Exception as e:
                print(f"✗ Import failed: {e}")
                print(f"Make sure vercel dev is running on port 3000")
    
    else:
        print("\n✗ Scraping failed")


if __name__ == "__main__":
    main()