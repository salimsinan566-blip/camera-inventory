/**
 * Smart Dynamic Invoice Pagination Engine
 * Calculates optimal distribution of invoice items across pages
 * so that up to 18-20 items fit on a single page, and multi-page
 * invoices fill intermediate pages completely without leaving huge gaps.
 */
export function getInvoicePages(allItems, hasNotes = false) {
  if (!allItems || allItems.length === 0) return [[]];

  // Up to 17-20 items comfortably fit on a single page with 15mm top margin, totals, QR, and yellow closing line
  const SINGLE_PAGE_MAX = hasNotes ? 17 : 20;

  if (allItems.length <= SINGLE_PAGE_MAX) {
    return [allItems];
  }

  // Multi-page invoices (more than 17-20 items):
  // Page 1 and intermediate pages have no totals box, so they can take up to 22 items.
  // The last page must have room for the totals box + footer, so it can take up to 15 items.
  const LAST_PAGE_MAX = hasNotes ? 13 : 15;
  const INTERMEDIATE_PAGE_MAX = 22;

  const pages = [];
  let remaining = [...allItems];

  while (remaining.length > 0) {
    if (remaining.length <= LAST_PAGE_MAX) {
      pages.push(remaining);
      break;
    }

    if (remaining.length <= INTERMEDIATE_PAGE_MAX + LAST_PAGE_MAX) {
      // Split remaining across 2 pages so both pages look well-filled
      const page1Count = Math.ceil(remaining.length / 2);
      pages.push(remaining.slice(0, page1Count));
      pages.push(remaining.slice(page1Count));
      break;
    }

    const take = Math.min(INTERMEDIATE_PAGE_MAX, remaining.length - LAST_PAGE_MAX);
    pages.push(remaining.slice(0, take));
    remaining = remaining.slice(take);
  }

  return pages;
}
