const API_BASE = "https://anon-messaging-app-1.onrender.com";


// Simple frontend logic using fetch and localStorage for token persistence
const api = {
  token: localStorage.getItem('token') || null,
  setToken(t){ this.token = t; localStorage.setItem('token', t); },
  clear(){ this.token = null; localStorage.removeItem('token'); },
  headers(){ return this.token ? { 'Authorization': 'Bearer ' + this.token, 'Content-Type':'application/json' } : { 'Content-Type':'application/json' }; },
  async post(path, body){ const res = await fetch((API_BASE || '') + path, { method:'POST', headers:this.headers(), body: JSON.stringify(body) }); if(!res.ok) throw await res.json(); return res.json(); },
  async get(path){ const res = await fetch((API_BASE || '') + path, { method:'GET', headers:this.headers() }); if(!res.ok) throw await res.json(); return res.json(); }
};

// DOM elems
const signupBtn = document.getElementById('signup-btn');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const signupPhone = document.getElementById('signup-phone');
const signupPassword = document.getElementById('signup-password');
const signupCode = document.getElementById('signup-code');
const loginPhone = document.getElementById('login-phone');
const loginPassword = document.getElementById('login-password');
const mePhoneSpan = document.getElementById('me-phone');
const authDiv = document.getElementById('auth');
const mainDiv = document.getElementById('main');
const recipientsUL = document.getElementById('recipients');
const toSelect = document.getElementById('to-select');
const messageBody = document.getElementById('message-body');
const anonymousCheckbox = document.getElementById('anonymous-checkbox');
const sendBtn = document.getElementById('send-btn');
const messagesList = document.getElementById('messages-list');
const refreshUsersBtn = document.getElementById('refresh-users');
const refreshMessagesBtn = document.getElementById('refresh-messages');

function showMain(){ authDiv.classList.add('hidden'); mainDiv.classList.remove('hidden'); }
function showAuth(){ authDiv.classList.remove('hidden'); mainDiv.classList.add('hidden'); }

async function signup(){
  try {
    const phone = signupPhone.value.trim();
    const password = signupPassword.value.trim();
    const invite_code = signupCode.value.trim();
    const res = await api.post('/signup', { phone, password, invite_code });
    api.setToken(res.token);
    await fetchMeAndUsers();
    showMain();
  } catch(err){
    alert('Signup error: ' + (err.error || JSON.stringify(err)));
  }
}

async function login(){
  try {
    const phone = loginPhone.value.trim();
    const password = loginPassword.value.trim();
    const res = await api.post('/login', { phone, password });
    api.setToken(res.token);
    await fetchMeAndUsers();
    showMain();
  } catch(err){
    alert('Login error: ' + (err.error || JSON.stringify(err)));
  }
}

function maskPhone(p){
  if(!p) return '';
  return p.length>5 ? p.slice(0,3)+'...'+p.slice(-2) : p;
}

async function fetchMeAndUsers(){
  try {
    const me = await api.get('/me');
    mePhoneSpan.textContent = maskPhone(me.phone);
    // load recipients
    const users = await api.get('/users');
    recipientsUL.innerHTML = '';
    toSelect.innerHTML = "<option value=''>-- select --</option>";
    users.forEach(u => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.textContent = u.masked || maskPhone(u.phone);
      btn.onclick = () => { toSelect.value = u.id; };
      li.appendChild(btn);
      recipientsUL.appendChild(li);
      const opt = document.createElement('option');
      opt.value = u.id; opt.textContent = u.masked || maskPhone(u.phone);
      toSelect.appendChild(opt);
    });
    await fetchMessages();
  } catch(err){
    console.error(err); showAuth();
  }
}

async function fetchMessages(){
  try {
    const me = await api.get('/me');
    const msgs = await api.get('/messages/' + me.id);
    messagesList.innerHTML = '';
    msgs.forEach(m => {
      const li = document.createElement('li');
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = (m.anonymous ? 'Anonymous' : 'From: ' + (m.from || 'unknown')) + ' • ' + new Date(m.created_at).toLocaleString();
      const body = document.createElement('div');
      body.className = 'body'; body.textContent = m.body;
      li.appendChild(meta); li.appendChild(body);
      messagesList.appendChild(li);
    });
  } catch(err){
    console.error(err);
  }
}

async function sendMessage(){
  try {
    const to = toSelect.value;
    const body = messageBody.value.trim();
    const anonymous = anonymousCheckbox.checked;
    if(!to || !body) return alert('Choose recipient and write a message.');
    await api.post('/messages', { to_user: Number(to), body, anonymous });
    messageBody.value = '';
    alert('Message sent.');
  } catch(err){
    alert('Send error: ' + (err.error || JSON.stringify(err)));
  }
}

signupBtn.onclick = signup;
loginBtn.onclick = login;
logoutBtn.onclick = () => { api.clear(); showAuth(); };
sendBtn.onclick = sendMessage;
refreshUsersBtn.onclick = fetchMeAndUsers;
refreshMessagesBtn.onclick = fetchMessages;

// Try auto-login if token present
if(api.token){
  (async ()=>{
    try { await fetchMeAndUsers(); showMain(); } catch(e){ console.log('auto-login failed', e); }
  })();
}
