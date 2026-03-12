import { useEffect } from "react";

/**
 * White-label branding component.
 *
 * Reads VITE_PRIMARY_COLOR and VITE_ACCENT_COLOR env vars (OKLCH format)
 * and overrides the CSS custom properties at runtime so each client
 * deployment can have a unique color theme without code changes.
 *
 * Also reads VITE_APP_TITLE to set the document title.
 *
 * Env var format examples (OKLCH):
 *   VITE_PRIMARY_COLOR=oklch(0.55 0.15 240)    # blue (default)
 *   VITE_PRIMARY_COLOR=oklch(0.55 0.20 145)    # green
 *   VITE_PRIMARY_COLOR=oklch(0.55 0.22 30)     # red/orange
 *   VITE_PRIMARY_COLOR=oklch(0.50 0.20 280)    # purple
 *
 * For convenience, also accepts hex colors which are converted to OKLCH.
 */

// Simple hex to OKLCH approximation via sRGB → linear → OKLab → OKLCH
function hexToOklch(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  // sRGB to linear
  const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);

  // Linear sRGB to OKLab (approximate via LMS)
  const l_ = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m_ = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s_ = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const l = Math.cbrt(l_);
  const m = Math.cbrt(m_);
  const s = Math.cbrt(s_);

  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const bOk = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;

  const C = Math.sqrt(a * a + bOk * bOk);
  let H = (Math.atan2(bOk, a) * 180) / Math.PI;
  if (H < 0) H += 360;

  return `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${H.toFixed(1)})`;
}

function parseColor(value: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.startsWith("oklch(")) return trimmed;
  if (trimmed.startsWith("#") && (trimmed.length === 7 || trimmed.length === 4)) {
    // Expand shorthand hex
    const full =
      trimmed.length === 4
        ? `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`
        : trimmed;
    return hexToOklch(full);
  }
  return null;
}

// Generate a lighter version for foreground (white-ish text on primary)
function makeForeground(oklch: string): string {
  return "oklch(0.98 0 0)";
}

// Generate a muted/lighter version for sidebar accent
function makeLighter(oklch: string, lightnessBoost: number): string {
  const match = oklch.match(/oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/);
  if (!match) return oklch;
  const l = Math.min(1, parseFloat(match[1]) + lightnessBoost);
  const c = parseFloat(match[2]) * 0.4; // reduce chroma for subtlety
  const h = match[3];
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h})`;
}

export default function ThemeBranding() {
  useEffect(() => {
    const primaryRaw = import.meta.env.VITE_PRIMARY_COLOR || "";
    const accentRaw = import.meta.env.VITE_ACCENT_COLOR || "";
    const appTitle = import.meta.env.VITE_APP_TITLE || "";

    const primary = parseColor(primaryRaw);
    const accent = parseColor(accentRaw);

    if (primary) {
      const fg = makeForeground(primary);
      const root = document.documentElement;

      // Primary color overrides
      root.style.setProperty("--primary", primary);
      root.style.setProperty("--primary-foreground", fg);
      root.style.setProperty("--ring", primary);

      // Sidebar primary
      root.style.setProperty("--sidebar-primary", primary);
      root.style.setProperty("--sidebar-primary-foreground", fg);
      root.style.setProperty("--sidebar-ring", primary);

      // Chart colors derived from primary hue
      const match = primary.match(/oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/);
      if (match) {
        const hue = parseFloat(match[3]);
        root.style.setProperty("--chart-1", `oklch(0.7 0.15 ${hue})`);
        root.style.setProperty("--chart-2", `oklch(0.6 0.15 ${hue})`);
        root.style.setProperty("--chart-3", `oklch(0.5 0.15 ${((hue + 30) % 360).toFixed(1)})`);
        root.style.setProperty("--chart-4", `oklch(0.55 0.18 ${((hue + 60) % 360).toFixed(1)})`);
        root.style.setProperty("--chart-5", `oklch(0.65 0.12 ${((hue + 90) % 360).toFixed(1)})`);
      }
    }

    if (accent) {
      const accentFg = makeForeground(accent);
      const root = document.documentElement;

      root.style.setProperty("--accent", accent);
      root.style.setProperty("--accent-foreground", accentFg);
      root.style.setProperty("--sidebar-accent", makeLighter(accent, 0.3));
      root.style.setProperty("--sidebar-accent-foreground", accent);
    }

    // Set document title
    if (appTitle) {
      document.title = appTitle;
    }
  }, []);

  return null;
}
