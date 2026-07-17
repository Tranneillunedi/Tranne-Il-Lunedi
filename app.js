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
let currentIsAdmin = false;

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

function updateAdminVisibility(isAdmin) {
  currentIsAdmin = Boolean(isAdmin);
  const adminNavItem = document.getElementById('adminNavItem');
  adminNavItem.classList.toggle('hidden', !currentIsAdmin);
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
    if (!currentIsAdmin) {
      await showPage('home');
      return;
    }
    await renderAdmin();
  }

  if (name === 'account') {
    await renderAccount();
    if (!currentCustomer() || !customerToken()) {
      Object.entries(pages).forEach(([key, element]) => {
        element.classList.toggle('hidden', key !== 'home');
      });
      navItems.forEach(item => {
        item.classList.toggle('active', item.dataset.go === 'home');
      });
    }
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

async function renderAdmin() {
  if (!currentIsAdmin || !customerToken()) return;

  const { data, error } = await supabaseClient.rpc('get_day_bookings_for_admin', {
    p_access_token: customerToken(),
    p_booking_date: adminSelectedDate
  });

  if (error) {
    console.error(error);
    alert('Accesso amministratore non autorizzato.');
    return;
  }

  const bookings = (data || []).map(row => ({
    id: row.booking_id,
    name: `${row.first_name} ${row.last_name}`,
    phone: row.phone,
    service: row.service,
    price: Number(row.price),
    date: row.booking_date,
    time: String(row.booking_time).slice(0, 5),
    source: row.booking_source || 'customer',
    notes: row.notes || ''
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
          cell.innerHTML = `<strong>${booking.name}</strong><span>${booking.service} · ${booking.phone || 'senza telefono'}</span>${booking.source === 'salon' ? '<small class="booking-origin">SALONE</small>' : ''}`;
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
        <p>${booking.service} · ${booking.price} € · ${booking.phone || 'senza telefono'}</p>
        ${booking.source === 'salon' ? '<span class="booking-origin">Inserita dal salone</span>' : ''}
        ${booking.notes ? `<p>Note: ${booking.notes}</p>` : ''}
      </div>
      <button class="delete-booking" type="button" aria-label="Elimina prenotazione">×</button>
    `;

    item.querySelector('.delete-booking').addEventListener('click', async () => {
      if (!confirm(`Cancellare la prenotazione di ${booking.name}?`)) return;

      const { error } = await supabaseClient.rpc('cancel_booking_for_admin', {
        p_access_token: customerToken(),
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

document.getElementById('clearBookings').textContent = 'Esci';
document.getElementById('clearBookings').addEventListener('click', () => {
  localStorage.removeItem('tranneIlLunediCustomer');
  localStorage.removeItem('tranneIlLunediAccessToken');
  updateAdminVisibility(false);
  showPage('home');
  renderAccount();
});

const loginForm = document.getElementById('loginForm');
const showRegisterBtn = document.getElementById('showRegisterBtn');
const hideRegisterBtn = document.getElementById('hideRegisterBtn');
const accountForm = document.getElementById('accountForm');
const accountLoggedOut = document.getElementById('accountLoggedOut');
const loginOverlay = document.getElementById('loginOverlay');
const accountLoggedIn = document.getElementById('accountLoggedIn');
const customerBookings = document.getElementById('customerBookings');
const changeTimeModal = document.getElementById('changeTimeModal');
const changeTimeSlots = document.getElementById('changeTimeSlots');
let bookingBeingChanged = null;
let selectedNewTime = '';


showRegisterBtn.addEventListener('click', () => {
  accountForm.classList.remove('hidden');
  showRegisterBtn.classList.add('hidden');
  document.getElementById('accountFirstName').focus();
});

hideRegisterBtn.addEventListener('click', () => {
  accountForm.classList.add('hidden');
  showRegisterBtn.classList.remove('hidden');
  document.getElementById('loginPhone').focus();
});

loginForm.addEventListener('submit', async event => {
  event.preventDefault();

  const phone = document.getElementById('loginPhone').value.trim();
  const pin = document.getElementById('loginPin').value.trim();

  if (normalizePhone(phone).length < 8) {
    alert('Inserisci un numero di telefono valido.');
    return;
  }

  if (!/^\d{4,6}$/.test(pin)) {
    alert('Il PIN deve contenere da 4 a 6 cifre.');
    return;
  }

  const { data, error } = await supabaseClient.rpc('login_customer_with_pin', {
    p_phone: phone,
    p_pin: pin
  });

  if (error) {
    alert('Numero o PIN non corretti. Se non sei ancora cliente, premi “Registrati”.');
    return;
  }

  const record = data?.[0];
  if (!record) {
    alert('Numero non trovato. Se non sei ancora cliente, premi “Registrati”.');
    return;
  }

  localStorage.setItem('tranneIlLunediCustomer', JSON.stringify({
    firstName: record.first_name,
    lastName: record.last_name,
    phone: record.phone,
    isAdmin: Boolean(record.is_admin)
  }));
  localStorage.setItem('tranneIlLunediAccessToken', record.customer_access_token);
  updateAdminVisibility(Boolean(record.is_admin));

  notify('Accesso effettuato.', 'success');
  loginForm.reset();
  await renderAccount();
  await showPage('home');
});

accountForm.addEventListener('submit', async event => {
  event.preventDefault();

  const customer = {
    firstName: document.getElementById('accountFirstName').value.trim(),
    lastName: document.getElementById('accountLastName').value.trim(),
    phone: document.getElementById('accountPhone').value.trim()
  };
  const pin = document.getElementById('accountPin').value.trim();
  const pinConfirm = document.getElementById('accountPinConfirm').value.trim();

  if (normalizePhone(customer.phone).length < 8) {
    alert('Inserisci un numero di telefono valido.');
    return;
  }

  if (!/^\d{4,6}$/.test(pin)) {
    alert('Il PIN deve contenere da 4 a 6 cifre.');
    return;
  }

  if (pin !== pinConfirm) {
    alert('I due PIN non coincidono.');
    return;
  }

  const { data, error } = await supabaseClient.rpc('register_customer_with_pin', {
    p_first_name: customer.firstName,
    p_last_name: customer.lastName,
    p_phone: customer.phone,
    p_pin: pin
  });

  if (error) {
    alert(error.message || 'Registrazione non riuscita.');
    return;
  }

  const record = data?.[0];
  localStorage.setItem('tranneIlLunediCustomer', JSON.stringify({
    firstName: record.first_name,
    lastName: record.last_name,
    phone: record.phone,
    isAdmin: Boolean(record.is_admin)
  }));
  localStorage.setItem('tranneIlLunediAccessToken', record.customer_access_token);
  updateAdminVisibility(Boolean(record.is_admin));

  notify('Registrazione completata e sincronizzata.', 'success');
  accountForm.reset();
  accountForm.classList.add('hidden');
  showRegisterBtn.classList.remove('hidden');
  await renderAccount();
  await showPage('home');
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('tranneIlLunediCustomer');
  localStorage.removeItem('tranneIlLunediAccessToken');
  updateAdminVisibility(false);
  showPage('home');
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

  accountLoggedOut.classList.add('hidden');
  accountLoggedIn.classList.toggle('hidden', !customer);
  loginOverlay.classList.toggle('hidden', Boolean(customer));
  document.body.classList.toggle('login-required', !customer);

  if (!customer) {
    updateAdminVisibility(false);
    return;
  }

  updateAdminVisibility(Boolean(customer.isAdmin));

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


let closedForSelectedDate = false;
let blockedTimesForSelectedDate = new Set();

function allHalfHourTimes() {
  const values = [];
  for (let hour = 9; hour < 20; hour++) {
    for (const minutes of ['00', '30']) {
      values.push(`${String(hour).padStart(2, '0')}:${minutes}`);
    }
  }
  return values;
}

function fillBlockTimeSelects() {
  const start = document.getElementById('blockStart');
  const end = document.getElementById('blockEnd');
  if (!start || !end || start.options.length) return;

  allHalfHourTimes().forEach(value => {
    start.add(new Option(value, value));
    end.add(new Option(value, value));
  });

  start.value = '09:00';
  end.value = '10:00';
}

async function loadBookingRules(date) {
  closedForSelectedDate = false;
  blockedTimesForSelectedDate = new Set();

  if (!date) return;

  const { data, error } = await supabaseClient.rpc('get_booking_rules_for_date', {
    p_booking_date: date
  });

  if (error) {
    console.error(error);
    return;
  }

  const row = data?.[0];
  closedForSelectedDate = Boolean(row?.is_closed);

  (row?.blocked_times || []).forEach(time => {
    blockedTimesForSelectedDate.add(String(time).slice(0, 5));
  });
}

const loadAvailabilityOriginal = loadAvailability;
loadAvailability = async function(date) {
  await loadBookingRules(date);

  if (closedForSelectedDate) {
    availability = {};
    makeSlots();

    document.querySelectorAll('#slots .slot').forEach(button => {
      button.disabled = true;
      button.classList.add('unavailable');
    });

    notify('Il salone è chiuso in questa data.', 'error');
    return;
  }

  await loadAvailabilityOriginal(date);

  document.querySelectorAll('#slots .slot').forEach(button => {
    if (blockedTimesForSelectedDate.has(button.dataset.value)) {
      button.disabled = true;
      button.classList.add('unavailable');
    }
  });
};

async function renderClosuresAndBlocks() {
  if (!currentIsAdmin || !customerToken()) return;

  const { data, error } = await supabaseClient.rpc('get_admin_closures_and_blocks', {
    p_access_token: customerToken()
  });

  if (error) {
    console.error(error);
    return;
  }

  const closureList = document.getElementById('closureList');
  const timeBlockList = document.getElementById('timeBlockList');

  if (!closureList || !timeBlockList) return;

  closureList.innerHTML = '';
  timeBlockList.innerHTML = '';

  const closures = (data || []).filter(item => item.item_type === 'closure');
  const blocks = (data || []).filter(item => item.item_type === 'block');

  if (!closures.length) {
    closureList.innerHTML = '<div class="empty-state">Nessuna chiusura programmata.</div>';
  }

  closures.forEach(item => {
    const element = document.createElement('div');
    element.className = 'management-item';
    element.innerHTML = `
      <div>
        <strong>${item.start_date} → ${item.end_date}</strong>
        <span>${item.reason || 'Chiusura'}</span>
      </div>
      <button class="management-delete" type="button" aria-label="Elimina">×</button>
    `;

    element.querySelector('button').addEventListener('click', async () => {
      if (!confirm('Eliminare questa chiusura?')) return;

      const { error } = await supabaseClient.rpc('delete_admin_closure', {
        p_access_token: customerToken(),
        p_id: item.item_id
      });

      if (error) return alert(error.message);
      await renderClosuresAndBlocks();
    });

    closureList.appendChild(element);
  });

  if (!blocks.length) {
    timeBlockList.innerHTML = '<div class="empty-state">Nessuna fascia bloccata.</div>';
  }

  blocks.forEach(item => {
    const element = document.createElement('div');
    element.className = 'management-item';
    element.innerHTML = `
      <div>
        <strong>${item.start_date} · ${String(item.start_time).slice(0, 5)}–${String(item.end_time).slice(0, 5)}</strong>
        <span>${item.reason || 'Fascia bloccata'}</span>
      </div>
      <button class="management-delete" type="button" aria-label="Elimina">×</button>
    `;

    element.querySelector('button').addEventListener('click', async () => {
      if (!confirm('Eliminare questo blocco orario?')) return;

      const { error } = await supabaseClient.rpc('delete_admin_time_block', {
        p_access_token: customerToken(),
        p_id: item.item_id
      });

      if (error) return alert(error.message);
      await renderClosuresAndBlocks();
    });

    timeBlockList.appendChild(element);
  });
}

document.getElementById('saveClosureBtn')?.addEventListener('click', async () => {
  const start = document.getElementById('closureStart').value;
  const end = document.getElementById('closureEnd').value || start;
  const reason = document.getElementById('closureReason').value.trim();

  if (!start || !end) return alert('Seleziona le date.');
  if (end < start) return alert('La data finale non può precedere quella iniziale.');

  const { error } = await supabaseClient.rpc('create_admin_closure', {
    p_access_token: customerToken(),
    p_start_date: start,
    p_end_date: end,
    p_reason: reason
  });

  if (error) return alert(error.message);

  document.getElementById('closureReason').value = '';
  notify('Chiusura salvata.', 'success');
  await renderClosuresAndBlocks();
});

document.getElementById('saveTimeBlockBtn')?.addEventListener('click', async () => {
  const date = document.getElementById('blockDate').value;
  const start = document.getElementById('blockStart').value;
  const end = document.getElementById('blockEnd').value;
  const reason = document.getElementById('blockReason').value.trim();

  if (!date) return alert('Seleziona la data.');
  if (end <= start) return alert('L’orario finale deve essere successivo a quello iniziale.');

  const { error } = await supabaseClient.rpc('create_admin_time_block', {
    p_access_token: customerToken(),
    p_block_date: date,
    p_start_time: start,
    p_end_time: end,
    p_reason: reason
  });

  if (error) return alert(error.message);

  document.getElementById('blockReason').value = '';
  notify('Fascia oraria bloccata.', 'success');
  await renderClosuresAndBlocks();
});

fillBlockTimeSelects();

const renderAdminOriginal = renderAdmin;
renderAdmin = async function() {
  await renderAdminOriginal();
  await renderClosuresAndBlocks();
};

let deferredPrompt;
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredPrompt = event;
  installBtn.classList.remove('hidden');
  if (typeof installGuideModal !== 'undefined' && !installGuideModal.classList.contains('hidden')) {
    directInstallBtn.classList.remove('hidden');
  }
});

installBtn.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBtn.classList.add('hidden');
});


async function openInitialPage() {
  const customer = currentCustomer();
  updateAdminVisibility(Boolean(customer?.isAdmin));
  await showPage('home');
  await renderAccount();
}

openInitialPage();


const splashScreen = document.getElementById('splashScreen');
const installGuideModal = document.getElementById('installGuideModal');
const iosInstallSteps = document.getElementById('iosInstallSteps');
const androidInstallSteps = document.getElementById('androidInstallSteps');
const genericInstallSteps = document.getElementById('genericInstallSteps');
const directInstallBtn = document.getElementById('directInstallBtn');
const installDeviceMessage = document.getElementById('installDeviceMessage');
const notificationPrompt = document.getElementById('notificationPrompt');

const INSTALL_TUTORIAL_KEY = 'tranneIlLunediInstallTutorialSeenV14';
const NOTIFICATION_LATER_KEY = 'tranneIlLunediNotificationLaterUntilV14';

function isStandaloneApp() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
}

function installDeviceType() {
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}

function closeInstallTutorial(markSeen = true) {
  installGuideModal.classList.add('hidden');
  document.body.classList.remove('tutorial-open');
  if (markSeen) localStorage.setItem(INSTALL_TUTORIAL_KEY, '1');
  scheduleNotificationPrompt(900);
}

function openInstallTutorial(force = false) {
  if (isStandaloneApp() && !force) return;

  iosInstallSteps.classList.add('hidden');
  androidInstallSteps.classList.add('hidden');
  genericInstallSteps.classList.add('hidden');
  directInstallBtn.classList.add('hidden');

  const device = installDeviceType();

  if (device === 'ios') {
    iosInstallSteps.classList.remove('hidden');
    installDeviceMessage.textContent = 'Su iPhone bastano pochi tocchi.';
  } else if (device === 'android') {
    androidInstallSteps.classList.remove('hidden');
    installDeviceMessage.textContent = 'Su Android puoi installarla come una vera app.';
    if (deferredPrompt) directInstallBtn.classList.remove('hidden');
  } else {
    genericInstallSteps.classList.remove('hidden');
    installDeviceMessage.textContent = 'Cerca l’opzione di installazione nel menu del browser.';
    if (deferredPrompt) directInstallBtn.classList.remove('hidden');
  }

  notificationPrompt.classList.add('hidden');
  installGuideModal.classList.remove('hidden');
  document.body.classList.add('tutorial-open');
}

function canUseNotifications() {
  return 'Notification' in window && 'serviceWorker' in navigator;
}

function shouldShowNotificationPrompt() {
  if (!canUseNotifications()) return false;
  if (Notification.permission !== 'default') return false;
  const laterUntil = Number(localStorage.getItem(NOTIFICATION_LATER_KEY) || 0);
  return Date.now() >= laterUntil;
}

function openNotificationPrompt(force = false) {
  if (!force && !shouldShowNotificationPrompt()) return;
  if (!canUseNotifications()) {
    if (force) alert('Questo browser non supporta le notifiche.');
    return;
  }
  if (Notification.permission === 'denied') {
    if (force) alert('Le notifiche sono bloccate nelle impostazioni del browser.');
    return;
  }
  installGuideModal.classList.add('hidden');
  notificationPrompt.classList.remove('hidden');
  document.body.classList.add('tutorial-open');
}

function closeNotificationPrompt(days = 7) {
  notificationPrompt.classList.add('hidden');
  document.body.classList.remove('tutorial-open');
  localStorage.setItem(
    NOTIFICATION_LATER_KEY,
    String(Date.now() + days * 24 * 60 * 60 * 1000)
  );
}

function scheduleNotificationPrompt(delay = 1800) {
  if (!shouldShowNotificationPrompt()) return;
  setTimeout(() => {
    if (installGuideModal.classList.contains('hidden')) {
      openNotificationPrompt();
    }
  }, delay);
}


function startVisualOnboarding() {
  setTimeout(() => splashScreen?.classList.add('hide'), 1200);
  setTimeout(() => startOnboardingTutorials(), 1650);
}

function startOnboardingTutorials() {
  if (!isStandaloneApp() && localStorage.getItem(INSTALL_TUTORIAL_KEY) !== '1') {
    setTimeout(() => openInstallTutorial(), 2200);
  } else {
    scheduleNotificationPrompt(3000);
  }
}

document.getElementById('closeInstallGuide').addEventListener('click', () => closeInstallTutorial(true));
document.getElementById('installGuideDone').addEventListener('click', () => closeInstallTutorial(true));

installGuideModal.addEventListener('click', event => {
  if (event.target === installGuideModal) closeInstallTutorial(true);
});

directInstallBtn.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBtn.classList.add('hidden');
  closeInstallTutorial(true);
});

document.getElementById('acceptNotifications').addEventListener('click', async () => {
  if (!canUseNotifications()) {
    alert('Questo browser non supporta le notifiche.');
    return;
  }

  const permission = await Notification.requestPermission();
  notificationPrompt.classList.add('hidden');
  document.body.classList.remove('tutorial-open');

  if (permission === 'granted') {
    localStorage.removeItem(NOTIFICATION_LATER_KEY);
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification('Tranne il Lunedì', {
      body: 'Notifiche attivate correttamente.',
      icon: 'assets/icon-192.png',
      badge: 'assets/icon-192.png'
    });
    notify('Notifiche attivate.', 'success');
  } else {
    closeNotificationPrompt(30);
  }
});

document.getElementById('declineNotifications').addEventListener('click', () => closeNotificationPrompt(7));
document.getElementById('closeNotificationPrompt').addEventListener('click', () => closeNotificationPrompt(7));

window.addEventListener('appinstalled', () => {
  localStorage.setItem(INSTALL_TUTORIAL_KEY, '1');
  closeInstallTutorial(true);
});

document.getElementById('reopenInstallTutorial')?.addEventListener('click', () => openInstallTutorial(true));
document.getElementById('reopenNotificationPrompt')?.addEventListener('click', () => openNotificationPrompt(true));

startVisualOnboarding();



window.addEventListener('load', () => {
  setTimeout(() => {
    const promptElement = document.getElementById('notificationPrompt');
    const installElement = document.getElementById('installGuideModal');

    if (
      promptElement &&
      promptElement.classList.contains('hidden') &&
      (!installElement || installElement.classList.contains('hidden')) &&
      'Notification' in window &&
      Notification.permission === 'default' &&
      sessionStorage.getItem('tranneIlLunediNotificationShownThisSession') !== '1'
    ) {
      sessionStorage.setItem('tranneIlLunediNotificationShownThisSession', '1');
      promptElement.classList.remove('hidden');
    }
  }, 4200);
});
// notification tutorial fallback v15

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(console.error);
  });
}


// =========================================================
// VERSIONE 16 — PRENOTAZIONI INSERITE DAL SALONE
// =========================================================
const manualBookingModal = document.getElementById('manualBookingModal');
const manualBookingForm = document.getElementById('manualBookingForm');
const manualDate = document.getElementById('manualDate');
const manualTime = document.getElementById('manualTime');
let adminRefreshTimer = null;

function fillManualTimes() {
  manualTime.innerHTML = '<option value="">Seleziona orario</option>';
  allHalfHourTimes().forEach(time => {
    const option = document.createElement('option');
    option.value = time;
    option.textContent = time;
    manualTime.appendChild(option);
  });
}

function openManualBookingModal() {
  manualBookingForm.reset();
  manualDate.value = adminSelectedDate || localISO(new Date());
  fillManualTimes();
  manualBookingModal.classList.remove('hidden');
  document.body.classList.add('tutorial-open');
  document.getElementById('manualFirstName').focus();
}

function closeManualBookingModal() {
  manualBookingModal.classList.add('hidden');
  document.body.classList.remove('tutorial-open');
}

document.getElementById('openManualBooking')?.addEventListener('click', openManualBookingModal);
document.getElementById('closeManualBooking')?.addEventListener('click', closeManualBookingModal);
manualBookingModal?.addEventListener('click', event => {
  if (event.target === manualBookingModal) closeManualBookingModal();
});

manualBookingForm?.addEventListener('submit', async event => {
  event.preventDefault();
  const saveButton = document.getElementById('saveManualBooking');
  saveButton.disabled = true;
  saveButton.textContent = 'Salvataggio…';

  const { data, error } = await supabaseClient.rpc('create_booking_for_admin', {
    p_access_token: customerToken(),
    p_first_name: document.getElementById('manualFirstName').value.trim(),
    p_last_name: document.getElementById('manualLastName').value.trim(),
    p_phone: document.getElementById('manualPhone').value.trim(),
    p_service: document.getElementById('manualService').value,
    p_booking_date: manualDate.value,
    p_booking_time: manualTime.value,
    p_notes: document.getElementById('manualNotes').value.trim()
  });

  saveButton.disabled = false;
  saveButton.textContent = 'Salva prenotazione';

  if (error) {
    console.error(error);
    alert(error.message || 'Impossibile salvare la prenotazione.');
    return;
  }

  adminSelectedDate = manualDate.value;
  adminCalendar.setSelected(adminSelectedDate);
  closeManualBookingModal();
  notify('Cliente aggiunto in agenda.', 'success');
  await renderAdmin();
});

// Aggiornamento automatico dell'agenda mentre l'Area Salone è aperta.
// Il controllo periodico è affidabile anche se Realtime non è abilitato sulla tabella.
setInterval(() => {
  if (currentIsAdmin && !pages.admin.classList.contains('hidden') && document.visibilityState === 'visible') {
    clearTimeout(adminRefreshTimer);
    adminRefreshTimer = setTimeout(() => renderAdmin(), 250);
  }
}, 15000);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && currentIsAdmin && !pages.admin.classList.contains('hidden')) {
    renderAdmin();
  }
});
