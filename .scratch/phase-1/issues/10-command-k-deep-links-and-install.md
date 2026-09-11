# 10 — Command K, deep links and install

**What to build:** On desktop, Command K opens a palette that jumps to any page, to a Stock Line (opening the yard filtered to it) or to a Customer. In the yard, "Sell from this Batch" opens the Sell form with the Stock Line and Batch preselected. On mobile the More sheet holds Customers, Public Link, Settings and Sign out, and the app can be added to the home screen with an icon and name.

**Blocked by:** 05 — Customers

**Status:** ready-for-agent

- [ ] Palette lists pages, Stock Lines with Available and Customers with phone; keyboard navigable; absent on mobile
- [ ] Yard row action deep-links into the Sell form with Batch preselected and the FIFO Listing still visible
- [ ] Dashboard Stale panel and palette Stock Line results both open the yard with the right filters in the URL
- [ ] Web app manifest with name, icons and theme colour; no service worker
- [ ] More sheet on mobile wired to Customers, Public Link, Settings, Sign out
- [ ] Playwright: palette jump to a Stock Line lands on the filtered yard
