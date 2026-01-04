#!/usr/bin/env python3
"""
Overleaf Template Scraper
Downloads all templates from Overleaf gallery organized by category and license.

Requirements:
    pip install requests beautifulsoup4 lxml

Note: This scraper collects template metadata and GitHub links where available.
For actual template downloads, you'll need Overleaf credentials due to their
requirement to "Open as Template" before downloading.
"""

import os
import json
import time
import requests
from bs4 import BeautifulSoup
from pathlib import Path
from urllib.parse import urljoin, urlparse
from typing import Dict, List, Optional


class OverleafTemplateScraper:
    def __init__(self, output_dir: str = "./overleaf_templates"):
        self.base_url = "https://www.overleaf.com"
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })

    def get_template_pages(self, max_pages: Optional[int] = None) -> List[str]:
        """Get all template gallery page URLs."""
        print("Discovering template pages...")
        pages = []

        # Start with page 1
        for page_num in range(1, (max_pages or 911) + 1):
            page_url = f"{self.base_url}/latex/templates?page={page_num}"
            pages.append(page_url)

        print(f"Found {len(pages)} pages to scrape")
        return pages

    def scrape_template_list_page(self, page_url: str) -> List[Dict]:
        """Scrape a single template listing page."""
        print(f"Scraping {page_url}")
        templates = []

        try:
            response = self.session.get(page_url, timeout=30)
            response.raise_for_status()
            soup = BeautifulSoup(response.content, 'lxml')

            # Find all template cards
            template_links = soup.find_all('a', href=lambda x: x and '/latex/templates/' in x and len(x.split('/')) >= 5)

            for link in template_links:
                href = link.get('href')
                if href and '/latex/templates/' in href and href.count('/') >= 4:
                    full_url = urljoin(self.base_url, href)
                    if full_url not in [t['url'] for t in templates]:
                        templates.append({
                            'url': full_url,
                            'title': link.get_text(strip=True) or 'Unknown'
                        })

            print(f"  Found {len(templates)} templates on this page")

        except Exception as e:
            print(f"  Error scraping page: {e}")

        return templates

    def scrape_template_details(self, template_url: str) -> Dict:
        """Scrape detailed information from a template page."""
        print(f"  Fetching details: {template_url}")
        details = {
            'url': template_url,
            'title': '',
            'author': '',
            'license': '',
            'description': '',
            'last_updated': '',
            'tags': [],
            'github_url': None,
            'view_source_url': None
        }

        try:
            response = self.session.get(template_url, timeout=30)
            response.raise_for_status()
            soup = BeautifulSoup(response.content, 'lxml')

            # Extract title
            title = soup.find('h1')
            if title:
                details['title'] = title.get_text(strip=True)

            # Extract license (look for CC BY, LPPL, etc.)
            license_text = soup.find(string=lambda x: x and ('CC BY' in x or 'LPPL' in x or 'MIT' in x or 'Public Domain' in x))
            if license_text:
                details['license'] = license_text.strip()

            # Look for metadata section
            metadata = soup.find_all(['dt', 'dd'])
            for i in range(0, len(metadata)-1, 2):
                key = metadata[i].get_text(strip=True).lower()
                value = metadata[i+1].get_text(strip=True)

                if 'author' in key:
                    details['author'] = value
                elif 'license' in key:
                    details['license'] = value
                elif 'updated' in key or 'modified' in key:
                    details['last_updated'] = value

            # Find GitHub link
            github_link = soup.find('a', href=lambda x: x and 'github.com' in x)
            if github_link:
                details['github_url'] = github_link.get('href')

            # Find description/abstract
            abstract = soup.find(['p', 'div'], class_=lambda x: x and 'abstract' in x.lower() if x else False)
            if abstract:
                details['description'] = abstract.get_text(strip=True)

            # Find tags/categories
            tags = soup.find_all('a', href=lambda x: x and '/latex/templates/tagged/' in x)
            details['tags'] = [tag.get_text(strip=True) for tag in tags]

        except Exception as e:
            print(f"    Error fetching template details: {e}")

        return details

    def save_template_metadata(self, template: Dict, category: str = "general"):
        """Save template metadata to JSON file."""
        category_dir = self.output_dir / category
        category_dir.mkdir(exist_ok=True)

        # Use template ID from URL as filename
        template_id = template['url'].split('/')[-1]
        filename = category_dir / f"{template_id}.json"

        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(template, f, indent=2, ensure_ascii=False)

    def scrape_all_templates(self, max_pages: Optional[int] = 10, delay: float = 1.0):
        """
        Scrape all templates from Overleaf.

        Args:
            max_pages: Maximum number of gallery pages to scrape (None for all 911 pages)
            delay: Delay between requests in seconds
        """
        print("Starting Overleaf template scraper...")
        print(f"Output directory: {self.output_dir}")

        # Get all gallery pages
        gallery_pages = self.get_template_pages(max_pages)

        all_templates = []
        templates_by_license = {
            'CC BY': [],
            'CC BY-SA': [],
            'CC BY-NC': [],
            'CC BY-NC-SA': [],
            'LPPL': [],
            'MIT': [],
            'Public Domain': [],
            'Other': []
        }

        # Scrape each gallery page
        for page_url in gallery_pages:
            templates = self.scrape_template_list_page(page_url)

            # Get details for each template
            for template_basic in templates:
                template_details = self.scrape_template_details(template_basic['url'])
                all_templates.append(template_details)

                # Categorize by license
                license_key = 'Other'
                for key in templates_by_license.keys():
                    if key in template_details.get('license', ''):
                        license_key = key
                        break

                templates_by_license[license_key].append(template_details)

                # Save individual template metadata
                self.save_template_metadata(template_details, license_key)

                time.sleep(delay)  # Be respectful

            time.sleep(delay)

        # Save summary
        summary = {
            'total_templates': len(all_templates),
            'by_license': {k: len(v) for k, v in templates_by_license.items()},
            'templates': all_templates
        }

        summary_file = self.output_dir / 'summary.json'
        with open(summary_file, 'w', encoding='utf-8') as f:
            json.dump(summary, f, indent=2, ensure_ascii=False)

        print("\n" + "="*60)
        print("SCRAPING COMPLETE!")
        print("="*60)
        print(f"Total templates: {summary['total_templates']}")
        print("\nBy license:")
        for license_type, count in summary['by_license'].items():
            if count > 0:
                print(f"  {license_type}: {count}")
        print(f"\nCommercially usable (CC BY, CC BY-SA, LPPL, MIT, Public Domain): "
              f"{sum(summary['by_license'][k] for k in ['CC BY', 'CC BY-SA', 'LPPL', 'MIT', 'Public Domain'])}")
        print(f"\nMetadata saved to: {self.output_dir}")
        print("\nNOTE: To download actual template files, you'll need to:")
        print("1. Use the GitHub URLs where available")
        print("2. Or manually open templates in Overleaf with credentials")

        return summary


def main():
    import argparse

    parser = argparse.ArgumentParser(description='Scrape Overleaf template gallery')
    parser.add_argument('--max-pages', type=int, default=10,
                      help='Maximum number of pages to scrape (default: 10, use 911 for all)')
    parser.add_argument('--delay', type=float, default=1.0,
                      help='Delay between requests in seconds (default: 1.0)')
    parser.add_argument('--output', type=str, default='./overleaf_templates',
                      help='Output directory (default: ./overleaf_templates)')

    args = parser.parse_args()

    scraper = OverleafTemplateScraper(output_dir=args.output)
    scraper.scrape_all_templates(max_pages=args.max_pages, delay=args.delay)


if __name__ == '__main__':
    main()
