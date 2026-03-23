const VALID_EMAIL = "admin@stlr.io";
const VALID_PASSWORD = "stlr2026";
const AUTH_KEY = "stlr_auth";

export function login(email: string, password: string): boolean {
  if (email === VALID_EMAIL && password === VALID_PASSWORD) {
    sessionStorage.setItem(AUTH_KEY, "authenticated");
    return true;
  }
  return false;
}

export function logout(): void {
  sessionStorage.removeItem(AUTH_KEY);
}

export function isAuthenticated(): boolean {
  return sessionStorage.getItem(AUTH_KEY) === "authenticated";
}
