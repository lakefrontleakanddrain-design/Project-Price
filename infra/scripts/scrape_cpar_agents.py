"""
Scrapes the Central Panhandle Association of REALTORS public agent directory.
Source: https://www.cpar.us/agents/user/
Outputs: cpar_agents.csv in the same folder as this script.
"""

import csv
import re
import time
import os
from urllib.request import urlopen, Request
from html.parser import HTMLParser

BASE_URL = "https://www.cpar.us/index.php?src=directory&view=rets_agents&submenu=rets_agents&srctype=rets_agents_lister&category=User&pos={pos},15,2014"
FIRST_PAGE = "https://www.cpar.us/agents/user/"
PAGE_SIZE = 15
TOTAL = 2014
OUTPUT = os.path.join(os.path.dirname(__file__), "cpar_agents.csv")
DELAY = 2.0  # seconds between requests — increased to avoid rate limiting

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; research-bot/1.0)",
    "Accept": "text/html",
}


class TableParser(HTMLParser):
    pass  # No longer used — kept to avoid import error if referenced elsewhere


def fetch_page(url):
    req = Request(url, headers=HEADERS)
    with urlopen(req, timeout=15) as resp:
        return resp.read().decode("utf-8", errors="replace")


def decode_obfuscated_email(html_fragment):
    """
    Emails are obfuscated as:
      document.write( 'user' + '@' + 'domain' + '.' + 'tld' )
    Reconstruct by joining all single-quoted tokens.
    """
    tokens = re.findall(r"'([^']*)'", html_fragment)
    return "".join(tokens) if tokens else ""


def parse_agents(html):
    agents = []
    # Each agent is a <tr> block; split on row boundaries
    rows = re.split(r"<tr(?:\s[^>]*)?>", html)
    for row in rows:
        # Must contain agent name link
        name_match = re.search(
            r'<a\s+href="agents/user/[^"]+">([^<]+)</a>', row
        )
        if not name_match:
            continue

        full_name_raw = name_match.group(1).strip()

        # Brokerage is in a <div> after the name div, before </td>
        brokerage_match = re.search(
            r'</h5></div>\s*<div>([^<]+)</div>', row
        )
        brokerage = brokerage_match.group(1).strip() if brokerage_match else ""

        # Phone
        phone_match = re.search(r'href="tel:([^"]+)"', row)
        phone = phone_match.group(1).strip() if phone_match else ""

        # Email — reconstructed from obfuscated document.write block
        email_block_match = re.search(
            r"<span[^>]*>Email:</span>.*?document\.write\(([^<]+)\)", row, re.S
        )
        if email_block_match:
            email = decode_obfuscated_email(email_block_match.group(1))
        else:
            # Fallback: plain text email
            plain = re.search(r"Email:</span>\s*([\w.+\-]+@[\w.\-]+\.\w+)", row)
            email = plain.group(1).strip() if plain else ""

        # Website
        website_match = re.search(r'href="(https?://[^"]+)"[^>]*>\s*(?:http|www)', row)
        website = website_match.group(1).strip() if website_match else ""

        agents.append({
            "full_name": full_name_raw,
            "brokerage": brokerage,
            "phone": phone,
            "email": email,
            "website": website,
        })
    return agents


def main():
    all_agents = []
    pages = list(range(0, TOTAL, PAGE_SIZE))
    total_pages = len(pages)

    print(f"Scraping {TOTAL} agents across {total_pages} pages...")

    for i, pos in enumerate(pages):
        url = FIRST_PAGE if pos == 0 else BASE_URL.format(pos=pos)
        try:
            html = fetch_page(url)
            agents = parse_agents(html)
            all_agents.extend(agents)
            print(f"  Page {i+1}/{total_pages} — {len(agents)} agents found (total so far: {len(all_agents)})")
        except Exception as e:
            print(f"  ERROR on page {i+1} (pos={pos}): {e}")
        time.sleep(DELAY)

    # Deduplicate by email
    seen = set()
    unique = []
    for a in all_agents:
        key = a["email"].lower() if a["email"] else a["full_name"].lower()
        if key not in seen:
            seen.add(key)
            unique.append(a)

    with open(OUTPUT, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["full_name", "brokerage", "phone", "email", "website"])
        writer.writeheader()
        writer.writerows(unique)

    with_email = sum(1 for a in unique if a["email"])
    print(f"\nDone. {len(unique)} unique agents saved to {OUTPUT}")
    print(f"  {with_email} have email addresses")
    print(f"  {len(unique) - with_email} have no email listed")


if __name__ == "__main__":
    main()
