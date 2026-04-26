const firebaseConfig = {
    apiKey: "AIzaSyA11zPbXEFs-sdIHKaxhkprkoGSGP1whfg",
    authDomain: "ims-fei.firebaseapp.com",
    databaseURL: "https://ims-fei-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "ims-fei",
    storageBucket: "ims-fei.firebasestorage.app",
    appId: "1:791711191329:web:0a4ba03cd5f11eb71bae60"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth(), db = firebase.database();
const IMGBB_KEY = "8a72c60399b9c276904659cf219a03c9";

let currentUser = null, userData = {}, logs = [], viewDate = new Date();
const DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

// --- AUTH & LOGIN ---
async function doLogin() {
    const id = document.getElementById('l-id').value.trim(), pw = document.getElementById('l-pw').value;
    if(!id || !pw) return;
    try {
        let email = id;
        if (!id.includes('@')) {
            const snap = await db.ref('usernames/' + id.toLowerCase()).once('value');
            if (!snap.exists()) return alert("Username not found");
            email = snap.val().email;
        }
        await auth.signInWithEmailAndPassword(email, pw);
    } catch (e) { alert("Login Error: " + e.message); }
}

auth.onAuthStateChanged(u => {
    currentUser = u;
    document.getElementById('auth-ui').classList.toggle('hidden', !!u);
    document.getElementById('app-ui').classList.toggle('hidden', !u);
    if (u) {
        db.ref('users/' + u.uid).on('value', s => {
            userData = s.val() || {};
            updateUI();
            if (userData.role === 'admin') {
                document.getElementById('nav-admin').classList.remove('hidden');
                loadAdmin();
            }
        });
        db.ref('attendance/' + u.uid).on('value', s => {
            const d = s.val();
            logs = d ? Object.keys(d).map(k => ({ id: k, ...d[k] })) : [];
            renderCal();
            calculate();
        });
    }
});

function updateUI() {
    document.getElementById('u-display').innerText = userData.displayName || 'User';
    document.getElementById('u-photo').src = userData.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
    document.getElementById('rider-card').classList.toggle('hidden', userData.jobType !== 'rider');
    renderSchedule();
}

// --- PROFILE EDIT (FULL SPEC) ---
async function editProfile() {
    const { value: res } = await Swal.fire({
        title: 'Edit My Profile',
        background: '#1c1c1e', color: '#fff',
        html: `
            <div class="mb-6" onclick="document.getElementById('file-input').click()">
                <img src="${userData.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" class="w-24 h-24 rounded-full mx-auto border-4 border-blue-500/50 object-cover cursor-pointer">
                <p class="text-[9px] mt-2 opacity-50 uppercase font-bold">Tap to change photo</p>
            </div>
            <div class="space-y-2 text-left">
                <label class="text-[9px] opacity-30 font-bold ml-2 uppercase">Basic Info</label>
                <input id="sw-name" class="w-full bg-white/5 p-4 rounded-xl outline-none" value="${userData.displayName || ''}" placeholder="Display Name">
                <input id="sw-phone" class="w-full bg-white/5 p-4 rounded-xl outline-none" value="${userData.phone || ''}" placeholder="Phone Number">
                
                <label class="text-[9px] opacity-30 font-bold ml-2 uppercase">Account Info</label>
                <input id="sw-email" class="w-full bg-white/5 p-4 rounded-xl outline-none" value="${currentUser.email}" readonly opacity-50>
                <input id="sw-pass" type="password" class="w-full bg-white/5 p-4 rounded-xl outline-none" placeholder="New Password (Leave blank to keep)">
                
                <label class="text-[9px] opacity-30 font-bold ml-2 uppercase">Financial Info (Private)</label>
                <div class="grid grid-cols-2 gap-2">
                    <input id="sw-sal" type="number" class="bg-white/5 p-4 rounded-xl outline-none" value="${userData.salary || 0}" placeholder="Salary">
                    <input id="sw-ot" type="number" class="bg-white/5 p-4 rounded-xl outline-none" value="${userData.otRate || 0}" placeholder="OT Rate/Hr">
                </div>
            </div>`,
        showCancelButton: true,
        confirmButtonText: 'Save All',
        preConfirm: () => {
            return {
                displayName: document.getElementById('sw-name').value,
                phone: document.getElementById('sw-phone').value,
                salary: parseFloat(document.getElementById('sw-sal').value) || 0,
                otRate: parseFloat(document.getElementById('sw-ot').value) || 0,
                newPass: document.getElementById('sw-pass').value
            }
        }
    });

    if (res) {
        // Update Firebase DB
        const updates = { 
            displayName: res.displayName, 
            phone: res.phone, 
            salary: res.salary, 
            otRate: res.otRate 
        };
        await db.ref('users/' + currentUser.uid).update(updates);

        // Update Password if provided
        if (res.newPass) {
            currentUser.updatePassword(res.newPass).then(() => {
                Swal.fire({ title: 'Success', text: 'Profile & Password updated', icon: 'success', background: '#1c1c1e', color: '#fff' });
            }).catch(e => alert(e.message));
        } else {
            Swal.fire({ title: 'Success', text: 'Profile updated', icon: 'success', background: '#1c1c1e', color: '#fff' });
        }
    }
}

// --- CALENDAR LOGIC (NEW) ---
async function manageLog(ds) {
    const log = logs.find(l => l.date === ds);
    const { value: action } = await Swal.fire({
        title: ds,
        background: '#1c1c1e', color: '#fff',
        showDenyButton: !!log,
        showCancelButton: true,
        confirmButtonText: log ? 'Update Entry' : 'Add Entry',
        denyButtonText: 'Delete',
        denyButtonColor: '#ef4444'
    });

    if (action === true) {
        const { value: res } = await Swal.fire({
            background: '#1c1c1e', color: '#fff',
            title: 'Shift Details',
            html: `
                <div class="space-y-3 text-left">
                    <div>
                        <label class="text-[9px] opacity-30 font-bold ml-1 uppercase">Time In/Out</label>
                        <div class="grid grid-cols-2 gap-2 mt-1">
                            <input id="sw-in" type="time" class="bg-white/5 p-3 rounded-xl" value="${log ? log.checkIn : '08:30'}">
                            <input id="sw-out" type="time" class="bg-white/5 p-3 rounded-xl" value="${log ? log.checkOut : '17:30'}">
                        </div>
                    </div>
                    <div>
                        <label class="text-[9px] opacity-30 font-bold ml-1 uppercase">OT Hours & Bills</label>
                        <div class="grid grid-cols-2 gap-2 mt-1">
                            <input id="sw-oth" type="number" step="0.5" class="bg-white/5 p-3 rounded-xl" placeholder="OT Hours" value="${log ? (log.otHours || 0) : 0}">
                            <input id="sw-bill" type="number" class="bg-white/5 p-3 rounded-xl" placeholder="Bills" value="${log ? (log.delivery || 0) : 0}">
                        </div>
                    </div>
                </div>`,
            preConfirm: () => ({
                checkIn: document.getElementById('sw-in').value,
                checkOut: document.getElementById('sw-out').value,
                otHours: parseFloat(document.getElementById('sw-oth').value) || 0,
                delivery: parseInt(document.getElementById('sw-bill').value) || 0
            })
        });
        if (res) {
            if (log) await db.ref(`attendance/${currentUser.uid}/${log.id}`).update(res);
            else await db.ref(`attendance/${currentUser.uid}`).push({ ...res, date: ds, isOff: false });
        }
    } else if (action === false) {
        await db.ref(`attendance/${currentUser.uid}/${log.id}`).remove();
    }
}

// --- REMAINDING LOGIC (STAY SAME BUT CLEANER) ---
function renderCal() {
    const y = viewDate.getFullYear(), m = viewDate.getMonth();
    document.getElementById('mon-view').innerText = `${MONTHS[m]} ${y + 543}`;
    const total = new Date(y, m + 1, 0).getDate(), start = new Date(y, m, 1).getDay();
    const grid = document.getElementById('cal-grid');
    if(!grid) return; grid.innerHTML = '';
    for (let i = 0; i < start; i++) grid.innerHTML += '<div></div>';
    for (let d = 1; d <= total; d++) {
        const ds = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const log = logs.find(l => l.date === ds);
        let cls = log ? (log.isOff ? 'st-off' : 'st-normal') : 'bg-white/5 opacity-50';
        grid.innerHTML += `<div onclick="manageLog('${ds}')" class="day-node ${cls}">${d}</div>`;
    }
}

function calculate() {
    const daily = (userData.salary || 15000) / 30;
    const otRate = userData.otRate || 0;
    let total = 0, todayB = 0;
    logs.forEach(l => {
        if (new Date(l.date).getMonth() === new Date().getMonth()) {
            if (l.checkIn && !l.isOff) total += daily;
            total += (l.otHours || 0) * otRate;
            total += (l.delivery || 0) * 15;
            if (l.date === new Date().toISOString().split('T')[0]) todayB = l.delivery || 0;
        }
    });
    document.getElementById('salary-view').innerText = total.toLocaleString(undefined, {minimumFractionDigits: 2});
    document.getElementById('today-bills').innerText = todayB;
}

// Utils
function go(id, btn) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}
function moveMonth(v) { viewDate.setMonth(viewDate.getMonth() + v); renderCal(); }
function confirmLogout() { if(confirm("Logout?")) auth.signOut(); }
function tapIn() {
    const d = new Date().toISOString().split('T')[0], t = new Date().toTimeString().slice(0, 5);
    if(!logs.find(l => l.date === d)) db.ref(`attendance/${currentUser.uid}`).push({ date: d, checkIn: t, checkOut: '', isOff: false, delivery: 0, otHours: 0 });
}
function tapOut() {
    const d = new Date().toISOString().split('T')[0], t = new Date().toTimeString().slice(0, 5);
    const log = logs.find(l => l.date === d);
    if(log && !log.checkOut) db.ref(`attendance/${currentUser.uid}/${log.id}`).update({ checkOut: t });
}
async function handleFileUpload(input) {
    const file = input.files[0]; if (!file) return;
    const fd = new FormData(); fd.append("image", file);
    try {
        const r = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, { method: "POST", body: fd });
        const res = await r.json();
        if (res.success) await db.ref('users/' + currentUser.uid).update({ photoURL: res.data.url });
    } catch (e) { alert("Upload Failed"); }
}
function renderSchedule() {
    const list = document.getElementById('week-list');
    if(!list) return;
    list.innerHTML = DAYS.map(d => {
        const s = (userData.shifts && userData.shifts[d]) ? userData.shifts[d] : { in: '08:30', out: '17:30', isOff: false };
        return `<div class="glass-card p-4 flex justify-between items-center ${s.isOff ? 'opacity-30' : ''}">
            <div class="font-bold text-[11px] uppercase tracking-tighter">${d}</div>
            <div class="flex gap-2 items-center">
                <input type="time" class="time-pill" value="${s.in}" onchange="db.ref('users/${currentUser.uid}/shifts/${d}/in').set(this.value)">
                <button onclick="db.ref('users/${currentUser.uid}/shifts/${d}/isOff').set(${!s.isOff})" class="p-2 text-blue-500 active:scale-90 transition"><i class="fa-solid ${s.isOff ? 'fa-toggle-off opacity-30' : 'fa-toggle-on'} text-xl"></i></button>
            </div></div>`;
    }).join('');
}
function loadAdmin() {
    const l = document.getElementById('user-list');
    db.ref('users').on('value', s => {
        const u = s.val(); if(!u) return;
        l.innerHTML = Object.keys(u).map(k => `
            <div class="glass-card p-4 flex justify-between items-center">
                <div class="flex items-center gap-3">
                    <img src="${u[k].photoURL || ''}" class="w-10 h-10 rounded-full bg-zinc-800 object-cover">
                    <p class="font-bold text-sm">${u[k].displayName || u[k].username}</p>
                </div>
                <button onclick="adminEdit('${k}')" class="text-blue-500 text-xs font-bold uppercase">Manage</button>
            </div>`).join('');
    });
}
