// OneSignal Web Push — Tranne il Lunedì v27
// La chiave API privata NON deve mai essere inserita in questo file.
window.OneSignalDeferred = window.OneSignalDeferred || [];
window.tranneOneSignalReady = false;
window.tranneOneSignal = null;
window.tranneOneSignalError = null;

let resolveTranneOneSignal;
window.tranneOneSignalReadyPromise = new Promise((resolve) => {
  resolveTranneOneSignal = resolve;
});

const ONESIGNAL_APP_ID = '6547826d-804c-4a15-aa8b-3b6627ec28c2';
// Il percorso è relativo alla pagina GitHub Pages, già dentro /Tranne-Il-Lunedi/.
// Non ripetere 'Tranne-Il-Lunedi', altrimenti il browser cerca una cartella duplicata.
const ONESIGNAL_WORKER_PATH = 'onesignal/OneSignalSDKWorker.js';
const ONESIGNAL_WORKER_SCOPE = '/Tranne-Il-Lunedi/onesignal/';

async function ensureOneSignalWorker() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Il browser non supporta i service worker.');
  }

  // Registrazione preventiva verificata sul sito: evita che l'SDK riceva
  // una vecchia risposta 404 durante la propria registrazione automatica.
  const workerUrl = new URL(ONESIGNAL_WORKER_PATH, document.baseURI).pathname;
  const registration = await navigator.serviceWorker.register(workerUrl, {
    scope: ONESIGNAL_WORKER_SCOPE,
    updateViaCache: 'none'
  });

  await registration.update().catch(() => {});

  if (!registration.active) {
    const worker = registration.installing || registration.waiting;
    if (worker) {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout attivazione worker OneSignal.')), 15000);
        const check = () => {
          if (worker.state === 'activated' || registration.active) {
            clearTimeout(timeout);
            resolve();
          } else if (worker.state === 'redundant') {
            clearTimeout(timeout);
            reject(new Error('Il worker OneSignal è diventato redundant.'));
          }
        };
        worker.addEventListener('statechange', check);
        check();
      });
    }
  }

  return registration;
}

window.OneSignalDeferred.push(async function (OneSignal) {
  try {
    OneSignal.Debug?.setLogLevel?.('warn');

    await ensureOneSignalWorker();

    await OneSignal.init({
      appId: ONESIGNAL_APP_ID,
      serviceWorkerPath: ONESIGNAL_WORKER_PATH,
      serviceWorkerParam: { scope: ONESIGNAL_WORKER_SCOPE },
      autoResubscribe: true,
      notifyButton: { enable: false },
      welcomeNotification: { disable: true },
      allowLocalhostAsSecureOrigin: false
    });

    window.tranneOneSignal = OneSignal;
    window.tranneOneSignalReady = true;
    resolveTranneOneSignal(OneSignal);
    window.dispatchEvent(new CustomEvent('tranne:onesignal-ready'));
  } catch (error) {
    console.error('Errore inizializzazione OneSignal:', error);
    window.tranneOneSignalError = error;
    resolveTranneOneSignal(null);
    window.dispatchEvent(new CustomEvent('tranne:onesignal-error', { detail: error }));
  }
});

window.waitForTranneOneSignal = async function (timeoutMs = 15000) {
  if (window.tranneOneSignalReady && window.tranneOneSignal) {
    return window.tranneOneSignal;
  }

  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs));
  const OneSignal = await Promise.race([window.tranneOneSignalReadyPromise, timeout]);
  if (OneSignal) return OneSignal;

  const detail = window.tranneOneSignalError?.message
    ? ` (${window.tranneOneSignalError.message})`
    : '';
  throw new Error(`OneSignal non si è avviato${detail}.`);
};

function readPushState(OneSignal) {
  const subscription = OneSignal.User?.PushSubscription;
  return {
    permission: Boolean(OneSignal.Notifications?.permission),
    permissionNative: typeof Notification !== 'undefined' ? Notification.permission : 'non disponibile',
    optedIn: Boolean(subscription?.optedIn),
    subscriptionId: subscription?.id || null,
    token: subscription?.token || null,
    oneSignalId: OneSignal.User?.onesignalId || null,
    externalId: OneSignal.User?.externalId || null
  };
}

async function collectPushDiagnostics(OneSignal) {
  const state = readPushState(OneSignal);
  const result = {
    page: location.href,
    origin: location.origin,
    secureContext: window.isSecureContext,
    standalone: window.matchMedia?.('(display-mode: standalone)')?.matches || Boolean(navigator.standalone),
    userAgent: navigator.userAgent,
    workerPath: ONESIGNAL_WORKER_PATH,
    workerScope: ONESIGNAL_WORKER_SCOPE,
    workerResolvedUrl: new URL(ONESIGNAL_WORKER_PATH, location.href).href,
    ...state,
    registrations: [],
    nativeSubscription: null
  };

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    result.registrations = registrations.map((registration) => ({
      scope: registration.scope,
      active: registration.active?.scriptURL || null,
      waiting: registration.waiting?.scriptURL || null,
      installing: registration.installing?.scriptURL || null
    }));

    const oneSignalRegistration = registrations.find(
      (registration) => new URL(registration.scope).pathname === ONESIGNAL_WORKER_SCOPE
    );

    if (oneSignalRegistration) {
      const nativeSubscription = await oneSignalRegistration.pushManager.getSubscription();
      result.nativeSubscription = nativeSubscription
        ? {
            endpoint: nativeSubscription.endpoint || null,
            hasP256dh: Boolean(nativeSubscription.getKey?.('p256dh')),
            hasAuth: Boolean(nativeSubscription.getKey?.('auth'))
          }
        : null;
    }
  } catch (error) {
    result.diagnosticError = `${error.name || 'Error'}: ${error.message || String(error)}`;
  }

  return result;
}

function formatDiagnostics(diagnostics) {
  const workers = diagnostics.registrations.length
    ? diagnostics.registrations
        .map((item) => `• ${item.scope}\n  ${item.active || item.waiting || item.installing || 'nessun worker attivo'}`)
        .join('\n')
    : 'nessun service worker registrato';

  return [
    'DIAGNOSTICA PUSH v27',
    `Permesso browser: ${diagnostics.permissionNative}`,
    `Permesso OneSignal: ${diagnostics.permission}`,
    `Opted-in: ${diagnostics.optedIn}`,
    `Subscription ID: ${diagnostics.subscriptionId || 'assente'}`,
    `Token OneSignal: ${diagnostics.token ? 'presente' : 'assente'}`,
    `Subscription browser: ${diagnostics.nativeSubscription ? 'presente' : 'assente'}`,
    `Modalità PWA: ${diagnostics.standalone ? 'sì' : 'no'}`,
    `Contesto HTTPS: ${diagnostics.secureContext ? 'sì' : 'no'}`,
    `Worker URL: ${diagnostics.workerResolvedUrl}`,
    `Worker attesi: ${ONESIGNAL_WORKER_SCOPE}`,
    `Worker registrati:\n${workers}`,
    diagnostics.diagnosticError ? `Errore diagnostica: ${diagnostics.diagnosticError}` : ''
  ].filter(Boolean).join('\n\n');
}

async function waitForPushSubscription(OneSignal, timeoutMs = 20000) {
  const current = readPushState(OneSignal);
  if (current.optedIn && current.subscriptionId && current.token) return current;

  return new Promise((resolve, reject) => {
    const subscription = OneSignal.User.PushSubscription;
    let intervalId = null;
    let timeoutId = null;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
      try {
        subscription.removeEventListener('change', onChange);
      } catch (_) {}
    };

    const finishIfReady = () => {
      const state = readPushState(OneSignal);
      if (state.optedIn && state.subscriptionId && state.token) {
        cleanup();
        resolve(state);
        return true;
      }
      return false;
    };

    const onChange = () => finishIfReady();

    try {
      subscription.addEventListener('change', onChange);
    } catch (_) {}

    intervalId = setInterval(finishIfReady, 500);
    timeoutId = setTimeout(async () => {
      cleanup();
      const diagnostics = await collectPushDiagnostics(OneSignal);
      console.error('Diagnostica OneSignal:', diagnostics);
      reject(new Error(formatDiagnostics(diagnostics)));
    }, timeoutMs);

    finishIfReady();
  });
}

window.requestTrannePushPermission = async function () {
  const OneSignal = await window.waitForTranneOneSignal();

  const supportedValue = OneSignal.Notifications?.isPushSupported;
  const supported = typeof supportedValue === 'function'
    ? supportedValue.call(OneSignal.Notifications)
    : supportedValue !== false;

  if (!supported) {
    throw new Error('Questo dispositivo o browser non supporta le notifiche push.');
  }

  await OneSignal.Notifications.requestPermission();

  if (!OneSignal.Notifications.permission) {
    throw new Error('Il permesso notifiche non è stato concesso.');
  }

  try {
    await OneSignal.User.PushSubscription.optIn();
  } catch (error) {
    const diagnostics = await collectPushDiagnostics(OneSignal);
    console.error('Errore optIn OneSignal:', error, diagnostics);
    throw new Error(`${error.name || 'Errore opt-in'}: ${error.message || String(error)}\n\n${formatDiagnostics(diagnostics)}`);
  }

  const state = await waitForPushSubscription(OneSignal);
  console.log('OneSignal stato:', state);
  return true;
};

window.getTrannePushDiagnostics = async function () {
  const OneSignal = await window.waitForTranneOneSignal(10000);
  return collectPushDiagnostics(OneSignal);
};

window.syncTranneOneSignalProfile = async function (customer) {
  if (!customer) return;

  try {
    const OneSignal = await window.waitForTranneOneSignal(8000);
    const phone = String(customer.phone || '').replace(/\D/g, '');
    const externalId = phone ? `cliente_${phone}` : null;

    if (externalId) await OneSignal.login(externalId);
    await OneSignal.User.addTags({
      role: customer.isAdmin ? 'admin' : 'customer',
      salon: 'tranne_il_lunedi'
    });
  } catch (error) {
    console.warn('Profilo OneSignal non sincronizzato:', error);
  }
};

window.logoutTranneOneSignal = async function () {
  try {
    const OneSignal = await window.waitForTranneOneSignal(5000);
    await OneSignal.logout();
  } catch (error) {
    console.warn('Logout OneSignal non completato:', error);
  }
};

window.getTrannePushStatus = async function () {
  try {
    const OneSignal = await window.waitForTranneOneSignal(10000);
    return { ready: true, ...readPushState(OneSignal) };
  } catch (error) {
    return {
      ready: false,
      permission: false,
      optedIn: false,
      subscriptionId: null,
      token: null,
      error: error.message
    };
  }
};
