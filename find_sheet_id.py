import urllib.request
import re

url = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSaxVpAyok-Ku0ffP77Kgg4T6P3gyfo09s8kppAb04bHRgmlfQ2tkkFG-Mou3cA0LMOr8Yo0Gch7OJB/pubhtml'
try:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as resp:
        html = resp.read().decode('utf-8', errors='ignore')
    
    print('HTML length:', len(html))
    title = re.search(r'<title>(.*?)</title>', html, re.I)
    if title:
        print('Title:', title.group(1))

    # Look for spreadsheet ID
    matches = re.findall(r'https://docs\.google\.com/spreadsheets/d/[a-zA-Z0-9_-]+', html)
    print('Direct spreadsheet links found:', set(matches))

    # Look for any id or key in script tags
    keys = re.findall(r'key["\']?\s*:\s*["\']([a-zA-Z0-9_-]{20,})["\']', html)
    print('Keys found:', keys[:5])

    # Look for docid
    docids = re.findall(r'docid["\']?\s*:\s*["\']([a-zA-Z0-9_-]{20,})["\']', html)
    print('Docids found:', docids[:5])
except Exception as e:
    print('Error:', e)
