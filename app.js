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

let currentUser = null, userData = {}, logs = [], viewDate = new Date();
let adminTargetId = null;

const DAYS = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];
const MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const HOLIDAYS = { "01-01": "ปีใหม่", "04-13": "สงกรานต์", "05-01": "วันแรงงาน", "07-28": "วันเฉลิมฯ ร.10", "12-05": "วันพ่อ", "12-31": "สิ้นปี" };

window.onload = () => {
    const saved = localStorage.getItem('remembered_user');
    if (saved) { document.getElementById('l-id').value = saved; document.getElementById('remember-me').checked = true; }
};

function alertCenter(msg, icon = "success") {
    Swal.fire({ icon: icon, title: msg, position: 'center', showConfirmButton: false, timer: 1500, background: '#1c1c1e', color: '#fff' });
}

// --- AUTH SYSTEM ---
function toggleAuth(mode) {
    document.getElementById('auth-login').classList.toggle('hidden', mode === 'reg');
    document.getElementById('auth-reg').classList.toggle('hidden', mode === 'login');
}

async function doLogin() {
    const id = document.getElementById('l-id').value.trim(), pw = document.getElementById('l-pw').value, remember = document.getElementById('remember-me').checked;
    try {
        let email = id;
        if (!id.includes('@')) {
            const snap = await db.ref('usernames/' + id.toLowerCase()).once('value');
            if (!snap.exists()) return alertCenter("ไม่พบ User", "error");
            email = snap.val().email;
        }
        await auth.signInWithEmailAndPassword(email, pw);
        if (remember) localStorage.setItem('remembered_user', id); else localStorage.removeItem('remembered_user');
        alertCenter("เข้าสู่ระบบสำเร็จ");
    } catch (e) { alertCenter("รหัสผ่านไม่ถูกต้อง", "error"); }
}

async function doRegister() {
    const u = document.getElementById('r-user').value.trim().toLowerCase(), e = document.getElementById('r-email').value.trim(), p = document.getElementById('r-pw').value;
    try {
        const cred = await auth.createUserWithEmailAndPassword(e, p);
        await db.ref('users/' + cred.user.uid).set({ username: u, email: e, role: 'staff', jobType: 'staff' });
        await db.ref('usernames/' + u).set({ email: e, uid: cred.user.uid });
        alertCenter("สมัครสำเร็จ"); toggleAuth('login');
    } catch (err) { alertCenter(err.message, "error"); }
}

async function confirmLogout() {
    const res = await Swal.fire({ title: 'ออกจากระบบ?', background: '#1c1c1e', color: '#fff', showCancelButton: true });
    if (res.isConfirmed) {
        document.getElementById('l-pw').value = "";
        await auth.signOut();
        alertCenter("ออกจากระบบสำเร็จ");
    }
}

// --- PROFILE & RIDER LOGIC ---
async function editProfile() {
    const { value: name } = await Swal.fire({
        title: 'แก้ไขชื่อ', input: 'text', inputValue: userData.displayName || '',
        background: '#1c1c1e', color: '#fff', showCancelButton: true
    });
    if (name) {
        await db.ref('users/' + currentUser.uid).update({ displayName: name });
        alertCenter("อัปเดตแล้ว");
    }
}

async function addDelivery(v) {
    const tid = adminTargetId || currentUser.uid;
    const d = new Date().toISOString().split('T')[0];
    let log = logs.find(l => l.date === d);
    if (!log) {
        await db.ref(`attendance/${tid}`).push({ date: d, checkIn: '--:--', delivery: Math.max(0, v) });
    } else {
        await db.ref(`attendance/${tid}/${log.id}`).update({ delivery: Math.max(0, (log.delivery || 0) + v) });
    }
}

async function bulkDelivery() {
    const tid = adminTargetId || currentUser.uid;
    const d = new Date().toISOString().split('T')[0];
    const log = logs.find(l => l.date === d);
    const { value: num } = await Swal.fire({ title: 'เพิ่มบิล', input: 'number', background: '#1c1c1e', color: '#fff' });
    if (num) {
        if (!log) await db.ref(`attendance/${tid}`).push({ date: d, checkIn: '--:--', delivery: parseInt(num) });
        else await db.ref(`attendance/${tid}/${log.id}`).update({ delivery: (log.delivery || 0) + parseInt(num) });
    }
}

// --- ADMIN CONTROL & STATE SYNC ---
auth.onAuthStateChanged(u => {
    currentUser = u;
    document.getElementById('auth-ui').classList.toggle('hidden', !!u);
    document.getElementById('app-ui').classList.toggle('hidden', !u);
    if (u) {
        db.ref('users/' + u.uid).on('value', s => {
            userData = s.val() || {};
            if (!adminTargetId) { updateUI(userData); renderSchedule(userData); }
            document.getElementById('nav-admin').classList.toggle('hidden', userData.role !== 'admin');
            if (userData.role === 'admin') loadAdminList();
        });
        db.ref('attendance/' + u.uid).on('value', s => {
            if (!adminTargetId) {
                const d = s.val();
                logs = d ? Object.keys(d).map(k => ({ id: k, ...d[k] })) : [];
                renderCal(); calculate();
            }
        });
    }
});

function updateUI(data) {
    document.getElementById('u-display').innerText = data.displayName || data.username || 'User';
    document.getElementById('u-photo').src = data.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
    document.getElementById('rider-card').classList.toggle('hidden', data.jobType !== 'rider');
    document.getElementById('today-bills').innerText = logs.find(l => l.date === new Date().toISOString().split('T')[0])?.delivery || 0;
}

function loadAdminList() {
    db.ref('users').once('value', s => {
        const users = s.val();
        document.getElementById('user-list').innerHTML = Object.keys(users).map(uid => `
            <div onclick="enterAdminView('${uid}', '${users[uid].username}')" class="glass-card p-4 flex justify-between items-center mb-2">
                <div class="flex items-center gap-3">
                    <img src="${users[uid].photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" class="w-10 h-10 rounded-full">
                    <div><p class="font-bold text-sm">${users[uid].displayName || users[uid].username}</p><p class="text-[9px] opacity-40 uppercase">${users[uid].role}</p></div>
                </div>
                <i class="fa-solid fa-chevron-right opacity-30"></i>
            </div>`).join('');
    });
}

function enterAdminView(uid, name) {
    adminTargetId = uid;
    document.getElementById('remote-banner').classList.remove('hidden');
    document.getElementById('remote-name').innerText = name;
    db.ref('users/' + uid).on('value', s => { const d = s.val(); updateUI(d); renderSchedule(d); });
    db.ref('attendance/' + uid).on('value', s => {
        const d = s.val(); logs = d ? Object.keys(d).map(k => ({ id: k, ...d[k] })) : [];
        renderCal(); calculate();
    });
    go('p-home');
}

function exitAdminView() {
    adminTargetId = null;
    document.getElementById('remote-banner').classList.add('hidden');
    updateUI(userData); renderSchedule(userData);
    db.ref('attendance/' + currentUser.uid).once('value', s => {
        const d = s.val(); logs = d ? Object.keys(d).map(k => ({ id: k, ...d[k] })) : [];
        renderCal(); calculate();
    });
}

async function changeStaffRole() {
    if (!adminTargetId) return;
    const { value: res } = await Swal.fire({
        title: 'จัดการพนักงาน', background: '#1c1c1e', color: '#fff',
        html: `<select id="s-role" class="time-pill mb-2"><option value="staff">Staff</option><option value="admin">Admin</option></select>
               <select id="s-job" class="time-pill"><option value="staff">งานออฟฟิศ</option><option value="rider">Rider</option></select>`,
        preConfirm: () => ({ role: document.getElementById('s-role').value, jobType: document.getElementById('s-job').value })
    });
    if (res) await db.ref('users/' + adminTargetId).update(res);
}

// --- CALENDAR & WEEKLY ---
function renderSchedule(data) {
    document.getElementById('week-list').innerHTML = DAYS.map(d => {
        const isOff = data.shifts?.[d]?.isOff;
        return `<div class="glass-card p-4 flex justify-between items-center ${isOff?'opacity-40':''}">
            <span class="text-xs font-bold">${d}</span>
            <div class="flex items-center gap-3">
                <input type="time" class="bg-white/5 p-1 rounded text-[10px]" value="${data.shifts?.[d]?.in || '08:30'}">
                <div onclick="toggleWeekOff('${d}')" class="day-off-toggle ${isOff?'active':''}"></div>
            </div>
        </div>`;
    }).join('');
}

async function toggleWeekOff(day) {
    const tid = adminTargetId || currentUser.uid;
    const current = userData.shifts?.[day]?.isOff || false;
    await db.ref(`users/${tid}/shifts/${day}`).update({ isOff: !current });
}

function renderCal() {
    const y = viewDate.getFullYear(), m = viewDate.getMonth();
    document.getElementById('mon-view').innerText = `${MONTHS[m]} ${y + 543}`;
    const grid = document.getElementById('cal-grid'); grid.innerHTML = '';
    const total = new Date(y, m + 1, 0).getDate();
    for (let d = 1; d <= total; d++) {
        const ds = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const log = logs.find(l => l.date === ds);
        const status = log ? (log.isOff ? 'st-off' : 'st-normal') : (HOLIDAYS[`${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`] ? 'st-holiday' : 'bg-white/5 opacity-40');
        grid.innerHTML += `<div onclick="manageLog('${ds}')" class="day-node ${status}">${d}</div>`;
    }
}

async function manageLog(ds) {
    const tid = adminTargetId || currentUser.uid;
    const log = logs.find(l => l.date === ds);
    const { value: action } = await Swal.fire({ title: ds, background: '#1c1c1e', color: '#fff', showDenyButton: !!log, confirmButtonText: 'แก้ไข/เพิ่ม', denyButtonText: 'ลบ' });
    if (action === true) {
        const { value: res } = await Swal.fire({
            background: '#1c1c1e', color: '#fff',
            html: `<input id="sw-in" type="time" class="time-pill mb-2" value="${log?.checkIn || '08:30'}"><input id="sw-bill" type="number" class="time-pill" value="${log?.delivery || 0}">`,
            preConfirm: () => ({ date: ds, checkIn: document.getElementById('sw-in').value, delivery: parseInt(document.getElementById('sw-bill').value)||0 })
        });
        if (res) log ? await db.ref(`attendance/${tid}/${log.id}`).update(res) : await db.ref(`attendance/${tid}`).push(res);
    } else if (action === false) await db.ref(`attendance/${tid}/${log.id}`).remove();
}

function calculate() {
    let total = 0; logs.forEach(l => { if (l.checkIn !== '--:--') total += 500; });
    document.getElementById('salary-view').innerText = total.toLocaleString();
}

function go(id, btn) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    if(btn) { document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); }
}

function moveMonth(v) { viewDate.setMonth(viewDate.getMonth() + v); renderCal(); }
function tapIn() { addDelivery(0); alertCenter("ลงเวลาเข้าสำเร็จ"); }
function tapOut() { alertCenter("ลงเวลาออกสำเร็จ"); }
