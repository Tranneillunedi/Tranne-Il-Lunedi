// OneSignal Web Push — Tranne il Lunedì v21
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
const ONESIGNAL_WORKER_PATH = '/Tranne-Il-Lunedi/onesignal/OneSignalSDKWorker.js';
const ONESIGNAL_WORKER_SCOPE = '/Tranne-Il-Lunedi/onesignal/';

window.OneSignalDeferred.push(async function (OneSignal) {
  try {
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

  const timeout = new Promise((resolve) => {
    setTimeout(() => resolve(null), timeoutMs);
  });

  const OneSignal = await Promise.race([
    window.tranneOneSignalReadyPromise,
    timeout
  ]);

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
    optedIn: Boolean(subscription?.optedIn),
    subscriptionId: subscription?.id || null,
    token: subscription?.token || null
  };
}

async function waitForPushSubscription(OneSignal, timeoutMs = 15000) {
  const current = readPushState(OneSignal);
  if (current.optedIn && current.subscriptionId && current.token) return current;

  return new Promise((resolve, reject) => {
    const subscription = OneSignal.User.PushSubscription;
    let intervalId;

    const cleanup = () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
      try {
        subscription.removeEventListener('change', onChange);
      } catch (_) {
        // Alcune versioni del browser non espongono removeEventListener.
      }
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
    } catch (_) {
      // Il controllo periodico sottostante rimane attivo come fallback.
    }

    intervalId = setInterval(finishIfReady, 500);
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('Permesso concesso, ma il browser non ha creato la sottoscrizione push.'));
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

  await OneSignal.User.PushSubscription.optIn();
  const state = await waitForPushSubscription(OneSignal);

  console.log('OneSignal stato:', state);
  return true;
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
