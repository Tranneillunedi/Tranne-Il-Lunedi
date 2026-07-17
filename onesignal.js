// OneSignal Web Push — Tranne il Lunedì v17
// La chiave API privata NON deve mai essere inserita in questo file.
window.OneSignalDeferred = window.OneSignalDeferred || [];
window.tranneOneSignalReady = false;
window.tranneOneSignal = null;

OneSignalDeferred.push(async function (OneSignal) {
  try {
    await OneSignal.init({
      appId: "6547826d-804c-4a15-aa8b-3b6627ec28c2",
      serviceWorkerPath: "onesignal/OneSignalSDKWorker.js",
      serviceWorkerParam: {
        scope: "/Tranne-Il-Lunedi/onesignal/"
      },
      autoResubscribe: true,
      notifyButton: { enable: false },
      welcomeNotification: { disable: true }
    });

    window.tranneOneSignal = OneSignal;
    window.tranneOneSignalReady = true;
    window.dispatchEvent(new CustomEvent('tranne:onesignal-ready'));
  } catch (error) {
    console.error('Errore inizializzazione OneSignal:', error);
    window.dispatchEvent(new CustomEvent('tranne:onesignal-error', { detail: error }));
  }
});

window.requestTrannePushPermission = async function () {
  if (!window.tranneOneSignalReady || !window.tranneOneSignal) {
    throw new Error('OneSignal non è ancora pronto. Riprova tra pochi secondi.');
  }

  const OneSignal = window.tranneOneSignal;
  if (!OneSignal.Notifications.isPushSupported()) {
    throw new Error('Questo browser non supporta le notifiche push.');
  }

  await OneSignal.Notifications.requestPermission();
  return Boolean(OneSignal.Notifications.permission);
};

window.syncTranneOneSignalProfile = async function (customer) {
  if (!window.tranneOneSignalReady || !window.tranneOneSignal || !customer) return;

  try {
    const OneSignal = window.tranneOneSignal;
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
  if (!window.tranneOneSignalReady || !window.tranneOneSignal) return;
  try {
    await window.tranneOneSignal.logout();
  } catch (error) {
    console.warn('Logout OneSignal non completato:', error);
  }
};
