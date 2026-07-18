/**
 * Helpers so Chrome/Edge can offer “Save password?” after SPA login.
 *
 * Modern Chrome often ignores PasswordCredential.store() for sites that never
 * do a real same-origin form POST. We:
 *  1) POST username+password to a same-origin no-op endpoint (iframe)
 *  2) also call navigator.credentials.store when available
 */

type PasswordCredentialLike = {
  id: string;
  password?: string;
};

/** Same-origin endpoint that only exists so the browser can observe a login POST. */
export const BROWSER_PASSWORD_SAVE_PATH = "/api/auth/browser-password-save";

export function canOfferBrowserPasswordSave(): { ok: boolean; reason?: string } {
  if (typeof window === "undefined") return { ok: false, reason: "not-in-browser" };
  if (!window.isSecureContext) {
    return {
      ok: false,
      reason:
        "Password save needs a secure origin (https://… or http://localhost). Open the app that way, not via a raw LAN IP over HTTP.",
    };
  }
  return { ok: true };
}

function hasPasswordCredentialApi(): boolean {
  return typeof window !== "undefined" && typeof window.PasswordCredential === "function" && !!navigator.credentials?.store;
}

/**
 * Fire a same-origin POST Chrome can treat as a successful login form submit.
 * Uses a hidden iframe so the SPA does not navigate away.
 */
function postLoginFormViaIframe(email: string, password: string): Promise<void> {
  return new Promise((resolve) => {
    const iframeName = `pwsave_${Date.now()}`;
    const iframe = document.createElement("iframe");
    iframe.name = iframeName;
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = "position:absolute;width:0;height:0;border:0;opacity:0;pointer-events:none";
    document.body.appendChild(iframe);

    const form = document.createElement("form");
    form.method = "POST";
    form.action = BROWSER_PASSWORD_SAVE_PATH;
    form.target = iframeName;
    form.autocomplete = "on";
    form.style.display = "none";

    const user = document.createElement("input");
    user.type = "email";
    user.name = "username";
    user.autocomplete = "username";
    user.value = email.trim();

    const pass = document.createElement("input");
    pass.type = "password";
    pass.name = "password";
    pass.autocomplete = "current-password";
    pass.value = password;

    form.appendChild(user);
    form.appendChild(pass);
    document.body.appendChild(form);

    const cleanup = () => {
      try {
        form.remove();
        iframe.remove();
      } catch {
        /* ignore */
      }
      resolve();
    };

    iframe.addEventListener("load", () => {
      window.setTimeout(cleanup, 150);
    });
    // Fallback if load never fires (204 with empty body sometimes skips load in some engines)
    window.setTimeout(cleanup, 1200);

    form.submit();
  });
}

async function storeViaCredentialApi(form: HTMLFormElement | null, email: string, password: string): Promise<void> {
  if (!hasPasswordCredentialApi()) return;
  try {
    const PasswordCredentialCtor = window.PasswordCredential as unknown as {
      new (data: HTMLFormElement | { id: string; password: string; name?: string }): PasswordCredentialLike;
    };
    const cred = form
      ? new PasswordCredentialCtor(form)
      : new PasswordCredentialCtor({ id: email.trim(), password, name: email.trim() });
    await navigator.credentials.store(cred as Credential);
  } catch {
    /* ignore */
  }
}

/**
 * Offer the native save-password UI after a successful SPA login.
 * Resolves after enough time for Chrome to show the bubble before route change.
 */
export async function offerSavePassword(
  form: HTMLFormElement | null,
  email: string,
  password: string,
): Promise<{ offered: boolean; reason?: string }> {
  if (!password || !email.trim()) return { offered: false, reason: "empty" };

  const gate = canOfferBrowserPasswordSave();
  if (!gate.ok) return { offered: false, reason: gate.reason };

  // Keep password input as type=password in the live form (Chrome ignores type=text).
  const pwdInput = form?.querySelector<HTMLInputElement>('input[name="password"], #password');
  if (pwdInput) pwdInput.type = "password";

  await postLoginFormViaIframe(email, password);
  await storeViaCredentialApi(form, email, password);

  // Short pause only — do not block login UX for long.
  await new Promise((r) => window.setTimeout(r, 200));
  return { offered: true };
}

/** Try to pull a saved password for this origin into the login form. */
export async function tryAutofillPassword(): Promise<{ email: string; password: string } | null> {
  if (typeof navigator === "undefined" || !navigator.credentials?.get) return null;
  if (!window.isSecureContext) return null;
  try {
    const cred = (await navigator.credentials.get({
      password: true,
      mediation: "optional",
    } as CredentialRequestOptions)) as PasswordCredentialLike | null;
    if (!cred?.id || !cred.password) return null;
    return { email: cred.id, password: cred.password };
  } catch {
    return null;
  }
}

/** After logout, stop silent auto sign-in so the account chooser shows next time. */
export async function preventSilentCredentialAccess(): Promise<void> {
  try {
    await navigator.credentials?.preventSilentAccess?.();
  } catch {
    /* ignore */
  }
}
