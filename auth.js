window.SuperTaskAuth = (() => {
  function createAuthService() {
    let client = null;
    let currentState = {
      mode: "disabled",
      status: "disabled",
      user: null,
      session: null,
      message: "Auth not configured. Local mode is active."
    };
    const listeners = new Set();

    function getConfig() {
      const config = window.SUPER_TASK_SUPABASE_CONFIG || {};
      return {
        url: config.url || "",
        anonKey: config.anonKey || ""
      };
    }

    function notify() {
      listeners.forEach(listener => listener(currentState));
    }

    function setState(nextState) {
      currentState = nextState;
      notify();
    }

    function createDisabledState(message) {
      return {
        mode: "disabled",
        status: "disabled",
        user: null,
        session: null,
        message: message || "Auth not configured. Local mode is active."
      };
    }

    function createSupabaseState(session, message) {
      return {
        mode: "supabase",
        status: session?.user ? "signed-in" : "signed-out",
        user: session?.user || null,
        session: session || null,
        message: message || (session?.user
          ? "Signed in. Cloud sync can be layered on next."
          : "Sign in to prepare this app for synced web and Android access.")
      };
    }

    function clearAuthParamsFromUrl() {
      const url = new URL(window.location.href);
      const authKeys = [
        "code",
        "type",
        "token",
        "token_hash",
        "error",
        "error_code",
        "error_description"
      ];

      authKeys.forEach(key => url.searchParams.delete(key));

      // Cleanup implicit-flow fragments if present.
      const hashContainsAuthTokens = /access_token=|refresh_token=|expires_in=|token_type=|provider_token=|provider_refresh_token=|error=/.test(url.hash || "");
      if (hashContainsAuthTokens) {
        url.hash = "";
      }

      const nextSearch = url.searchParams.toString();
      const cleanUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ""}${url.hash || ""}`;
      window.history.replaceState({}, document.title, cleanUrl);
    }

    function readHashParams() {
      const hash = (window.location.hash || "").replace(/^#/, "");
      const params = new URLSearchParams(hash);
      return {
        accessToken: params.get("access_token"),
        refreshToken: params.get("refresh_token"),
        hasAuthHash: /access_token=|refresh_token=|expires_in=|token_type=|provider_token=|provider_refresh_token=|error=/.test(window.location.hash || "")
      };
    }

    async function processAuthCallbackIfPresent() {
      const url = new URL(window.location.href);

      const authError = url.searchParams.get("error_description") || url.searchParams.get("error");
      if (authError) {
        clearAuthParamsFromUrl();
        return authError;
      }

      if (url.searchParams.has("code")) {
        const result = await client.auth.exchangeCodeForSession(window.location.href);
        const errorMessage = result.error?.message || null;
        clearAuthParamsFromUrl();
        return errorMessage;
      }

      const tokenHash = url.searchParams.get("token_hash");
      const authType = url.searchParams.get("type");
      if (tokenHash && authType) {
        const result = await client.auth.verifyOtp({
          token_hash: tokenHash,
          type: authType
        });
        const errorMessage = result.error?.message || null;
        clearAuthParamsFromUrl();
        return errorMessage;
      }

      const hashParams = readHashParams();
      if (hashParams.accessToken && hashParams.refreshToken) {
        const result = await client.auth.setSession({
          access_token: hashParams.accessToken,
          refresh_token: hashParams.refreshToken
        });
        const errorMessage = result.error?.message || null;
        clearAuthParamsFromUrl();
        return errorMessage;
      }

      // Handle stray callback artifacts that can leave a trailing '?'.
      if (window.location.search === "?" || hashParams.hasAuthHash) {
        clearAuthParamsFromUrl();
      }

      return null;
    }

    async function init() {
      const { url, anonKey } = getConfig();
      if (!url || !anonKey || !window.supabase?.createClient) {
        setState(createDisabledState());
        return currentState;
      }

      client = window.supabase.createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });

      const callbackError = await processAuthCallbackIfPresent();

      const sessionResult = await client.auth.getSession();
      const session = sessionResult.data?.session || null;
      const sessionError = callbackError || sessionResult.error?.message;
      setState(createSupabaseState(session, sessionError));

      client.auth.onAuthStateChange((_event, nextSession) => {
        setState(createSupabaseState(nextSession));
      });

      return currentState;
    }

    async function sendMagicLink(email) {
      if (!client) {
        return { ok: false, message: "Supabase auth is not configured yet." };
      }

      const cleanRedirectUrl = `${window.location.origin}${window.location.pathname}`;

      const result = await client.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: cleanRedirectUrl
        }
      });

      if (result.error) {
        return { ok: false, message: result.error.message };
      }

      return {
        ok: true,
        message: `Magic link sent to ${email}. Open it on this device to sign in.`
      };
    }

    async function signOut() {
      if (!client) return { ok: true, message: "Local mode does not require sign out." };
      const result = await client.auth.signOut();
      if (result.error) {
        return { ok: false, message: result.error.message };
      }
      return { ok: true, message: "Signed out." };
    }

    function subscribe(listener) {
      listeners.add(listener);
      listener(currentState);
      return () => listeners.delete(listener);
    }

    function getState() {
      return currentState;
    }

    function getClient() {
      return client;
    }

    return {
      init,
      sendMagicLink,
      signOut,
      subscribe,
      getState,
      getClient
    };
  }

  return { createAuthService };
})();