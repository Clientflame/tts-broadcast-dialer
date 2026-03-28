/**
 * Copy text to clipboard — works on both HTTP and HTTPS.
 * Uses navigator.clipboard when available (HTTPS), falls back to
 * textarea + execCommand for HTTP (self-hosted without SSL).
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // Prefer modern API when in secure context
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to legacy approach
    }
  }

  // Legacy fallback — works on HTTP
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "-9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    const ok = document.execCommand("copy");
    return ok;
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}
