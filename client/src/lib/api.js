// Base URL of the API server. VITE_API_URL is public and baked into the build, so it must never hold a secret.
// Empty (local development) means same-origin /api paths, which the Vite dev proxy forwards to the server.
function resolveBase(value) {
  const trimmed = String(value ?? "")
    .trim()
    .replace(/\/+$/, "");
  if (!trimmed) return "";
  // A bare host such as "my-api.onrender.com" would be treated as a relative path, so add the scheme.
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export const API_BASE = resolveBase(import.meta.env.VITE_API_URL);

export const apiUrl = (path) => `${API_BASE}${path}`;
