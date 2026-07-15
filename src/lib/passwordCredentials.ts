/** Chromium Password Credential Management helpers (save / autofill prompts). */

type PasswordCredentialLike = {
  id: string;
  password?: string;
};

function hasPasswordCredentialApi(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PasswordCredential === "function" &&
    !!navigator.credentials?.store
  );
}

/** Offer Chrome/Edge "Save password?" after a successful SPA login. */
export async function offerSavePassword(_form: HTMLFormElement | null, email: string, password: string): Promise<void> {
  if (!hasPasswordCredentialApi() || !password || !email.trim()) return;
  try {
    const PasswordCredentialCtor = window.PasswordCredential as unknown as {
      new (data: { id: string; password: string; name?: string }): PasswordCredentialLike;
    };
    // Prefer the object form — DOM type="text" (show password) can make form-based capture fail.
    const cred = new PasswordCredentialCtor({
      id: email.trim(),
      password,
      name: email.trim(),
    });
    await navigator.credentials.store(cred as Credential);
  } catch {
    /* Browser declined or API unavailable — ignore */
  }
}

/** Try to pull a saved password for this origin into the login form. */
export async function tryAutofillPassword(): Promise<{ email: string; password: string } | null> {
  if (typeof navigator === "undefined" || !navigator.credentials?.get) return null;
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
