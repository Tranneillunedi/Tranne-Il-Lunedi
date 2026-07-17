// OneSignal Web Push — Tranne il Lunedì v17.1
// La chiave API privata NON deve mai essere inserita in questo file.
window.OneSignalDeferred = window.OneSignalDeferred || [];
window.tranneOneSignalReady = false;
window.tranneOneSignal = null;
window.tranneOneSignalError = null;

let resolveTranneOneSignal;
window.tranneOneSignalReadyPromise = new Promise((resolve) => {
  resolveTranneOneSignal = resolve;
});

window.OneSignalDeferred.push(async function (OneSignal) {
  try {
    await OneSignal.init({
      appId: "6547826d-804c-4a15-aa8b-3b6627ec28c2",
     serviceWorkerPath: "onesignal/OneSignalSDKWorker.js",
serviceWorkerParam: {
  scope: "/Tranne-Il-Lunedi/onesignal/"
},
      },
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
  throw new Error(`OneSignal non si è avviato. Chiudi e riapri l'app dopo averla aggiornata${detail}.`);
};

window.requestTrannePushPermission = async function () {
  const OneSignal = await window.waitForTranneOneSignal();

  const supportedValue = OneSignal.Notifications?.isPushSupported;
  const supported = typeof supportedValue === 'function'
    ? supportedValue.call(OneSignal.Notifications)
    : supportedValue !== false;

  if (!supported) {
    throw new Error('Questo dispositivo o browser non supporta le notifiche push. Su iPhone apri l’app dalla schermata Home.');
  }

  await OneSignal.Notifications.requestPermission();

if (OneSignal.Notifications.permission) {
  await OneSignal.User.PushSubscription.optIn();
}

return Boolean(
  OneSignal.Notifications.permission &&
  OneSignal.User.PushSubscription.optedIn
);
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
