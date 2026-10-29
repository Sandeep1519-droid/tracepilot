// Detect an access gate before handing the page to the model. Never solve or
// click through challenges, and never count an unavailable site as a product bug.
export function pageBlocker(title: string, text: string, status?: number) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (
    /robot check|captcha|verify (?:that )?you are (?:a )?human/i.test(title) ||
    (compact.length < 3000 &&
      /enter the characters you see below|verify (?:that )?you are (?:a )?human|automated access to amazon/i.test(
        compact,
      )) ||
    (/amazon/i.test(title) &&
      compact.length < 1200 &&
      /^Click the button below to continue shopping\b/i.test(compact))
  )
    return "Website access check blocked this browser session. Testing stopped without solving or clicking through the challenge; the requested behavior remains unverified.";
  if (
    status &&
    (status === 401 || status === 403 || status === 429 || status >= 500)
  )
    return `Website unavailable to this browser (HTTP ${status}). The requested behavior remains unverified.`;
  return undefined;
}
