# Dropship Comparator: Second-Hand Electronics

## Overview
A specialized system to find arbitrage opportunities between Facebook Marketplace (local/low-fee) and eBay (global/high-fee).

## Tech Stack
- **Frontend**: Vite + React + Lucide Icons + Framer Motion (for animations).
- **Backend**: Python (FastAPI) + Playwright (for FB scraping) + eBay SDK.
- **Database**: SQLite (local) to store search history and price trends.

## Core Modules
1. **eBay Finder**: Uses eBay's Finding API to get "Sold" and "Current" listings.
2. **FB Scraper**: A resilient scraper for Facebook Marketplace listings using location-based searches.
3. ** arbitrage Engine**:
    - Formula: `Profit = (eBay_Price * (1 - eBay_Fees)) - (FB_Price + Shipping_Cost + Packing_Materials)`
    - Flags deals with >20% margin.

## UI/UX Design
- **Premium Dark Mode**: Utilizing deep blues and grays with neon accents.
- **Dynamic Charts**: Visualizing price discrepancies.
- **Glassmorphism**: Elegant card layouts for listing comparisons.

---
*Note: I am ready to start building this, but I need access to a workspace directory for the new project.*
