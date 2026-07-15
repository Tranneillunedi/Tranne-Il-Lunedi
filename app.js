const supabaseClient = window.supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_PUBLISHABLE_KEY
);

const pages = {
  home: document.getElementById('home'),
  booking: document.getElementById('booking'),
  admin: document.getElementById('admin'),
  account: document.getElementById('account'),
  success: document.getElementById('success')
};

const navItems = document.querySelectorAll('.nav-item');
const serviceSelect = document.getElementById('service');
const dateInput = document.getElementById('date');
const timeInput = document.getElementById('time');
const slotsContainer = document.getElementById('slots');
const form = document.getElementById('bookingForm');
const summary = document.getElementById('summary');
const installBtn = document.getElementById('installBtn');
const syncStatus = document.getElementById('syncStatus');

const monthNames = [
  'Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
  'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'
];

let availability = {};
let adminPinSession = sessionStorage.getItem('tranneIlLunediAdminPin') || '';

function notify(message, type = '') {
  syncStatus.textContent = message;
  syncStatus.className = `sync-status ${type}`;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => syncStatus.classList.add('hidden'), 3200);
}

function localISO(date) {
  const copy = new Date(date);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().split('T')[0];
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function currentCustomer() {
  return JSON.parse(localStorage.getItem('tranneIlLunediCustomer') || 'null');
}

function customerToken() {
  return localStorage.getItem('tranneIlLunediAccessToken') || '';
}

async function showPage(name) {
  Object.entries(pages).forEach(([key, element]) => {
    element.classList.toggle('hidden', key !== name);
  });
  navItems.forEach(item => {
    item.classList.toggle('active', item.dataset.go === name);
  });

  if (name === 'booking') {
    const customer = currentCustomer();
    if (customer) {
      document.getElementById('name').value = `${customer.firstName} ${customer.lastName}`;
      document.getElementById('phone').value = customer.phone;
    }
  }

  if (name === 'admin') {
    renderAdminAccess();
  }

  if (name === 'account') {
    await renderAccount();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('[data-go]').forEach(button => {
  button.addEventListener('click', () => showPage(button.dataset.go));
});

document.querySelectorAll('.service-card').forEach(card => {
  card.addEventListener('click', () => {
    serviceSelect.value = `${card.dataset.service}|${card.dataset.price}`;
    showPage('booking');
  });
});

function makeSlots() {
  slotsContainer.innerHTML = '';
  for (let hour = 9; hour < 20; hour++) {
    ['00', '30'].forEach(minutes => {
      const value = `${String(hour).padStart(2, '0')}:${minutes}`;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'slot';
      button.textContent = value;
      button.dataset.value = value;

      if ((availability[value] || 0) >= 2) {
        button.disabled = true;
        button.classList.add('unavailable');
      }

      button.addEventListener('click', () => {
        document.querySelectorAll('#slots .slot').forEach(s => s.classList.remove('selected'));
        button.classList.add('selected');
        timeInput.value = value;
      });
      slotsContainer.appendChild(button);
    });
  }
}

async function loadAvailability(date) {
  availability = {};
  if (!date) {
    makeSlots();
    return;
  }

  const { data, error } = await supabaseClient.rpc('get_day_availability', {
    p_booking_date: date
  });

  if (error) {
    console.error(error);
    notify('Esegui prima il file SQL della versione 4 su Supabase.', 'error');
    makeSlots();
    return;
  }

  (data || []).forEach(row => {
    availability[String(row.booking_time).slice(0, 5)] = Number(row.occupied);
  });
  makeSlots();
}

makeSlots();

function createCalendar(config) {
  const grid = document.getElementById(config.gridId);
  const title = document.getElementById(config.titleId);
  let cursor = new Date();
  cursor.setDate(1);
  let selected = config.initialDate || '';

  function render() {
    grid.innerHTML = '';
    title.textContent = `${monthNames[cursor.getMonth()]} ${cursor.getFullYear()}`;

    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const startOffset = (first.getDay() + 6) % 7;
    const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();

    for (let i = 0; i < startOffset; i++) {
      const empty = document.createElement('button');
      empty.type = 'button';
      empty.className = 'calendar-day empty';
      grid.appendChild(empty);
    }

    const todayISO = localISO(new Date());

    for (let day = 1; day <= days; day++) {
      const date = new Date(cursor.getFullYear(), cursor.getMonth(), day, 12);
      const iso = localISO(date);
      const weekday = date.getDay();
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'calendar-day';
      button.textContent = day;

      if (iso === todayISO) button.classList.add('today');
      if (iso === selected) button.classList.add('selected');

      const closed = weekday === 0 || weekday === 1;
      const past = config.disablePast && iso < todayISO;
      button.disabled = closed || past;

      button.addEventListener('click', async () => {
        selected = iso;
        render();
        await config.onSelect(iso);
      });

      grid.appendChild(button);
    }
  }

  document.getElementById(config.prevId).addEventListener('click', () => {
    cursor.setMonth(cursor.getMonth() - 1);
    render();
  });

  document.getElementById(config.nextId).addEventListener('click', () => {
    cursor.setMonth(cursor.getMonth() + 1);
    render();
  });

  render();

  return {
    setSelected(iso) {
      selected = iso;
      const d = new Date(`${iso}T12:00:00`);
      cursor = new Date(d.getFullYear(), d.getMonth(), 1);
      render();
    }
  };
}

const bookingCalendar = createCalendar({
  gridId: 'calendarGrid',
  titleId: 'calendarTitle',
  prevId: 'prevMonth',
  nextId: 'nextMonth',
  disablePast: true,
  onSelect: async iso => {
    dateInput.value = iso;
    timeInput.value = '';
    await loadAvailability(iso);
  }
});

let adminSelectedDate = localISO(new Date());
const todayDay = new Date().getDay();
if (todayDay === 0) {
  const d = new Date(); d.setDate(d.getDate() + 2); adminSelectedDate = localISO(d);
} else if (todayDay === 1) {
  const d = new Date(); d.setDate(d.getDate() + 1); adminSelectedDate = localISO(d);
}

const adminCalendar = createCalendar({
  gridId: 'adminCalendarGrid',
  titleId: 'adminCalendarTitle',
  prevId: 'adminPrevMonth',
  nextId: 'adminNextMonth',
  initialDate: adminSelectedDate,
  disablePast: false,
  onSelect: async iso => {
    adminSelectedDate = iso;
    await renderAdmin();
  }
});

form.addEventListener('submit', async event => {
  event.preventDefault();

  if (!customerToken()) {
    alert('Prima registrati o accedi dalla sezione Profilo.');
    showPage('account');
    return;
  }

  if (!dateInput.value) {
    alert('Seleziona una data dal calendario.');
    return;
  }
  if (!timeInput.value) {
    alert('Seleziona un orario.');
    return;
  }

  const [service] = serviceSelect.value.split('|');

  const { data, error } = await supabaseClient.rpc('create_booking', {
    p_access_token: customerToken(),
    p_service: service,
    p_booking_date: dateInput.value,
    p_booking_time: timeInput.value
  });

  if (error) {
    console.error(error);
    alert(error.message || 'Non è stato possibile creare la prenotazione.');
    await loadAvailability(dateInput.value);
    return;
  }

  const booking = data?.[0];
  const customer = currentCustomer();
  const dateFormatted = new Intl.DateTimeFormat('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date(`${booking.booking_date}T12:00:00`));

  summary.innerHTML = `
    <strong>${customer.firstName} ${customer.lastName}</strong><br>
    ${booking.service} — ${Number(booking.price)} €<br>
    ${dateFormatted} alle ${String(booking.booking_time).slice(0, 5)}<br>
    Telefono: ${customer.phone}
  `;

  adminSelectedDate = booking.booking_date;
  adminCalendar.setSelected(booking.booking_date);
  form.reset();
  dateInput.value = '';
  timeInput.value = '';
  availability = {};
  makeSlots();
  showPage('success');
});

function formatLongDate(iso) {
  return new Intl.DateTimeFormat('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date(`${iso}T12:00:00`));
}

function renderAdminAccess() {
  const loginBox = document.getElementById('adminLoginBox');
  const content = document.getElementById('adminContent');
  loginBox.classList.toggle('hidden', Boolean(adminPinSession));
  content.classList.toggle('hidden', !adminPinSession);
  if (adminPinSession) renderAdmin();
}

document.getElementById('adminLoginBtn').addEventListener('click', async () => {
  const pin = document.getElementById('adminPin').value.trim();
  if (!pin) return;

  const { error } = await supabaseClient.rpc('get_day_bookings_admin', {
    p_admin_pin: pin,
    p_booking_date: adminSelectedDate
  });

  if (error) {
    alert('PIN non corretto oppure SQL versione 4 non ancora eseguito.');
    return;
  }

  adminPinSession = pin;
  sessionStorage.setItem('tranneIlLunediAdminPin', pin);
  renderAdminAccess();
});

async function renderAdmin() {
  if (!adminPinSession) return;

  const { data, error } = await supabaseClient.rpc('get_day_bookings_admin', {
    p_admin_pin: adminPinSession,
    p_booking_date: adminSelectedDate
  });

  if (error) {
    console.error(error);
    sessionStorage.removeItem('tranneIlLunediAdminPin');
    adminPinSession = '';
    renderAdminAccess();
    alert('Sessione amministratore non valida.');
    return;
  }

  const bookings = (data || []).map(row => ({
    id: row.booking_id,
    name: `${row.first_name} ${row.last_name}`,
    phone: row.phone,
    service: row.service,
    price: Number(row.price),
    date: row.booking_date,
    time: String(row.booking_time).slice(0, 5)
  })).sort((a, b) => a.time.localeCompare(b.time));

  document.getElementById('agendaDateTitle').textContent = formatLongDate(adminSelectedDate);
  document.getElementById('dailyCount').textContent = bookings.length;
  document.getElementById('dailyRevenue').textContent =
    `${bookings.reduce((sum, b) => sum + b.price, 0)} €`;

  const now = new Date();
  const todayISO = localISO(now);
  const currentTime = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const next = bookings.find(b => adminSelectedDate > todayISO || (adminSelectedDate === todayISO && b.time >= currentTime));
  document.getElementById('nextClient').textContent = next ? `${next.name} · ${next.time}` : '—';

  const timeline = document.getElementById('agendaTimeline');
  timeline.innerHTML = '';

  for (let hour = 9; hour < 20; hour++) {
    ['00', '30'].forEach(minutes => {
      const time = `${String(hour).padStart(2, '0')}:${minutes}`;
      const row = document.createElement('div');
      row.className = 'agenda-row';

      const timeLabel = document.createElement('div');
      timeLabel.className = 'agenda-time';
      timeLabel.textContent = time;
      row.appendChild(timeLabel);

      const atTime = bookings.filter(b => b.time === time);
      for (let slot = 0; slot < 2; slot++) {
        const cell = document.createElement('div');
        cell.className = 'agenda-slot';
        const booking = atTime[slot];
        if (booking) {
          cell.classList.add('filled');
          cell.innerHTML = `<strong>${booking.name}</strong><span>${booking.service} · ${booking.phone}</span>`;
        } else {
          cell.innerHTML = `<span>Libero</span>`;
        }
        row.appendChild(cell);
      }

      timeline.appendChild(row);
    });
  }

  const list = document.getElementById('bookingList');
  list.innerHTML = '';

  if (!bookings.length) {
    list.innerHTML = '<div class="empty-state">Nessuna prenotazione per questa giornata.</div>';
    return;
  }

  bookings.forEach(booking => {
    const item = document.createElement('article');
    item.className = 'booking-item';
    item.innerHTML = `
      <div class="booking-time">${booking.time}</div>
      <div>
        <strong>${booking.name}</strong>
        <p>${booking.service} · ${booking.price} € · ${booking.phone}</p>
      </div>
      <button class="delete-booking" type="button" aria-label="Elimina prenotazione">×</button>
    `;

    item.querySelector('.delete-booking').addEventListener('click', async () => {
      if (!confirm(`Cancellare la prenotazione di ${booking.name}?`)) return;

      const { error } = await supabaseClient.rpc('cancel_booking_admin', {
        p_admin_pin: adminPinSession,
        p_booking_id: booking.id
      });

      if (error) {
        alert(error.message);
        return;
      }
      await renderAdmin();
    });

    list.appendChild(item);
  });
}

document.getElementById('clearBookings').textContent = 'Esci area salone';
document.getElementById('clearBookings').addEventListener('click', () => {
  sessionStorage.removeItem('tranneIlLunediAdminPin');
  adminPinSession = '';
  document.getElementById('adminPin').value = '';
  renderAdminAccess();
});

const accountForm = document.getElementById('accountForm');
const accountLoggedOut = document.getElementById('accountLoggedOut');
const accountLoggedIn = document.getElementById('accountLoggedIn');
const customerBookings = document.getElementById('customerBookings');
const changeTimeModal = document.getElementById('changeTimeModal');
const changeTimeSlots = document.getElementById('changeTimeSlots');
let bookingBeingChanged = null;
let selectedNewTime = '';

accountForm.addEventListener('submit', async event => {
  event.preventDefault();

  const customer = {
    firstName: document.getElementById('accountFirstName').value.trim(),
    lastName: document.getElementById('accountLastName').value.trim(),
    phone: document.getElementById('accountPhone').value.trim()
  };

  if (normalizePhone(customer.phone).length < 8) {
    alert('Inserisci un numero di telefono valido.');
    return;
  }

  const { data, error } = await supabaseClient.rpc('register_customer', {
    p_first_name: customer.firstName,
    p_last_name: customer.lastName,
    p_phone: customer.phone
  });

  if (error) {
    alert(error.message);
    return;
  }

  const record = data?.[0];
  localStorage.setItem('tranneIlLunediCustomer', JSON.stringify({
    firstName: record.first_name,
    lastName: record.last_name,
    phone: record.phone
  }));
  localStorage.setItem('tranneIlLunediAccessToken', record.customer_access_token);

  notify('Registrazione completata e sincronizzata.', 'success');
  await renderAccount();
  await showPage('home');
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('tranneIlLunediCustomer');
  localStorage.removeItem('tranneIlLunediAccessToken');
  renderAccount();
});

async function getMyBookings() {
  if (!customerToken()) return [];

  const { data, error } = await supabaseClient.rpc('get_my_bookings', {
    p_access_token: customerToken()
  });

  if (error) {
    console.error(error);
    notify('Impossibile caricare le prenotazioni.', 'error');
    return [];
  }

  return (data || []).map(row => ({
    id: row.booking_id,
    service: row.service,
    price: Number(row.price),
    date: row.booking_date,
    time: String(row.booking_time).slice(0, 5),
    status: row.status
  }));
}

async function renderAccount() {
  const customer = currentCustomer();

  accountLoggedOut.classList.toggle('hidden', Boolean(customer));
  accountLoggedIn.classList.toggle('hidden', !customer);

  if (!customer) return;

  document.getElementById('accountWelcome').textContent = `Ciao, ${customer.firstName}`;
  document.getElementById('accountProfileName').textContent =
    `${customer.firstName} ${customer.lastName}`;
  document.getElementById('accountProfilePhone').textContent = customer.phone;

  const bookings = (await getMyBookings())
    .filter(b => b.status === 'confirmed')
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));

  customerBookings.innerHTML = '';

  if (!bookings.length) {
    customerBookings.innerHTML =
      '<div class="empty-state">Non hai ancora prenotazioni.</div>';
    return;
  }

  bookings.forEach(booking => {
    const card = document.createElement('article');
    card.className = 'booking-item customer-booking-card';
    card.innerHTML = `
      <div class="booking-time">${booking.time}</div>
      <div>
        <strong>${booking.service} · ${booking.price} €</strong>
        <p>${formatLongDate(booking.date)}</p>
        <div class="customer-booking-actions">
          <button class="change-time-btn" type="button">Cambia orario</button>
        </div>
      </div>
    `;

    card.querySelector('.change-time-btn').addEventListener('click', () => {
      openChangeTimeModal(booking);
    });

    customerBookings.appendChild(card);
  });
}

async function openChangeTimeModal(booking) {
  bookingBeingChanged = booking;
  selectedNewTime = '';
  changeTimeSlots.innerHTML = '';

  const { data, error } = await supabaseClient.rpc('get_day_availability', {
    p_booking_date: booking.date
  });

  if (error) {
    alert(error.message);
    return;
  }

  const counts = {};
  (data || []).forEach(row => {
    counts[String(row.booking_time).slice(0,5)] = Number(row.occupied);
  });

  for (let hour = 9; hour < 20; hour++) {
    ['00', '30'].forEach(minutes => {
      const value = `${String(hour).padStart(2, '0')}:${minutes}`;
      const count = counts[value] || 0;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'slot';
      button.textContent = value;

      const adjustedCount = value === booking.time ? count - 1 : count;
      if (adjustedCount >= 2) {
        button.disabled = true;
        button.classList.add('unavailable');
      }

      if (value === booking.time) {
        button.classList.add('selected');
        selectedNewTime = value;
      }

      button.addEventListener('click', () => {
        changeTimeSlots.querySelectorAll('.slot')
          .forEach(slot => slot.classList.remove('selected'));
        button.classList.add('selected');
        selectedNewTime = value;
      });

      changeTimeSlots.appendChild(button);
    });
  }

  changeTimeModal.classList.remove('hidden');
}

document.getElementById('closeChangeTime').addEventListener('click', () => {
  changeTimeModal.classList.add('hidden');
});

changeTimeModal.addEventListener('click', event => {
  if (event.target === changeTimeModal) {
    changeTimeModal.classList.add('hidden');
  }
});

document.getElementById('confirmTimeChange').addEventListener('click', async () => {
  if (!bookingBeingChanged || !selectedNewTime) {
    alert('Seleziona un nuovo orario.');
    return;
  }

  const { error } = await supabaseClient.rpc('change_booking_time', {
    p_access_token: customerToken(),
    p_booking_id: bookingBeingChanged.id,
    p_new_time: selectedNewTime
  });

  if (error) {
    alert(error.message);
    return;
  }

  changeTimeModal.classList.add('hidden');
  bookingBeingChanged = null;
  notify('Orario aggiornato correttamente.', 'success');
  await renderAccount();
});

let deferredPrompt;
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredPrompt = event;
  installBtn.classList.remove('hidden');
});

installBtn.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBtn.classList.add('hidden');
});


async function openInitialPage() {
  if (currentCustomer() && customerToken()) {
    await showPage('home');
  } else {
    await showPage('account');
  }
}

openInitialPage();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(console.error);
  });
}
