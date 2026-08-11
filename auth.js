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

    async function init() {
      const { url, anonKey } = getConfig();
      if (!url || !anonKey || !window.supabase?.createClient) {
        setState(createDisabledState());
        return currentState;
      }

      client = window.supabase.createClient(url, anonKey);

      const sessionResult = await client.auth.getSession();
      const session = sessionResult.data?.session || null;
      const sessionError = sessionResult.error?.message;
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

      const result = await client.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.href
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

    return {
      init,
      sendMagicLink,
      signOut,
      subscribe,
      getState
    };
  }

  return { createAuthService };
})();