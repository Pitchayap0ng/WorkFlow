// --- CONFIG (ใช้ตามรูปที่คุณส่งมา) ---
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
const DAYS = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];
const MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

// --- 1. NOTIFICATION ---
function alertCenter(msg, icon = "success") {
    Swal.fire({
        icon: icon, title: msg, position: 'center', showConfirmButton: false, timer: 1500,
        background: '#1c1c1e', color: '#fff'
    });
}

// --- 2. AUTH ---
async function doLogin() {
    const id = document.getElementById('l-id').value.trim(), pw = document.getElementById('l-pw').value;
    if(!id || !pw) return alertCenter("กรุณากรอกข้อมูล", "warning");
    try {
        let email = id;
        if (!id.includes('@')) {
            const snap = await db.ref('usernames/' + id.toLowerCase()).once('value');
            if (!snap.exists()) return alertCenter("ไม่พบ User นี้", "error");
            email = snap.val().email;
        }
        await auth.signInWithEmailAndPassword(email, pw);
    } catch (e) { alertCenter("รหัสผ่านไม่ถูกต้อง", "error"); }
}

async function confirmLogout() {
    const res = await Swal.fire({
        title: 'ออกจากระบบ?', icon: 'warning', background: '#1c1c1e', color: '#fff',
        showCancelButton: true, confirmButtonText: 'ตกลง', cancelButtonText: 'ยกเลิก'
    });
    if (res.isConfirmed) auth.signOut();
}

auth.onAuthStateChanged(u => {
    currentUser = u;
    document.getElementById('auth-ui').classList.toggle('hidden', !!u);
    document.getElementById('app-ui').classList.toggle('hidden', !u);
    if (u) {
        // ฟังข้อมูลพนักงานคนนี้
        db.ref('users/' + u.uid).on('value', s => {
            userData = s.val() || {};
            updateUI();
            if (userData.role === 'admin') {
                document.getElementById('nav-admin').classList.remove('hidden');
                loadAdmin(); // เรียกโหลดรายชื่อพนักงาน
            }
        });
        // ฟังประวัติการเข้างาน
        db.ref('attendance/' + u.uid).on('value', s => {
            const d = s.val();
            logs = d ? Object.keys(d).map(k => ({ id: k, ...d[k] })) : [];
            renderCal();
            calculate();
        });
    }
});

// --- 3. UI ---
function updateUI() {
    document.getElementById('u-display').innerText = userData.displayName || userData.username || 'User';
    document.getElementById('u-photo').src = userData.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
    document.getElementById('rider-card').classList.toggle('hidden', userData.jobType !== 'rider');
    renderSchedule();
}

// --- 4. ADMIN & LOADING FIX ---
function loadAdmin() {
    const list = document.getElementById('user-list');
    db.ref('users').on('value', s => {
        const users = s.val();
        if(!users) {
            list.innerHTML = '<p class="text-center opacity-20 py-10">No users found.</p>';
            return;
        }
        list.innerHTML = Object.keys(users).map(uid => `
            <div onclick="adminEdit('${uid}')" class="glass-card p-4 flex justify-between items-center active:scale-[0.98] transition">
                <div class="flex items-center gap-4">
                    <img src="${users[uid].photoURL || ''}" class="w-10 h-10 rounded-full object-cover bg-zinc-800">
                    <div>
                        <p class="font-bold text-sm text-white">${users[uid].displayName || users[uid].username}</p>
                        <p class="text-[9px] opacity-40 uppercase tracking-widest">${users[uid].role || 'staff'} • ${users[uid].jobType || 'staff'}</p>
                    </div>
                </div>
                <i class="fa-solid fa-chevron-right opacity-20 text-[10px]"></i>
            </div>`).join('');
    });
}

async function adminEdit(uid) {
    const snap = await db.ref('users/' + uid).once('value');
    const u = snap.val();
    const { value: res } = await Swal.fire({
        title: 'Manage Employee',
        background: '#1c1c1e', color: '#fff',
        html: `
            <div class="space-y-3 text-left">
                <div class="grid grid-cols-2 gap-2">
                    <input id="ad-sal" type="number" class="time-pill w-full" value="${u.salary || 0}" placeholder="Salary">
                    <input id="ad-ot" type="number" class="time-pill w-full" value="${u.otRate || 0}" placeholder="OT Rate">
                </div>
                <select id="ad-job" class="time-pill w-full bg-[#2c2c2e]">
                    <option value="staff" ${u.jobType === 'staff'?'selected':''}>Staff (ทั่วไป)</option>
                    <option value="rider" ${u.jobType === 'rider'?'selected':''}>Rider (มีระบบบิล)</option>
                </select>
                <select id="ad-role" class="time-pill w-full bg-[#2c2c2e]">
                    <option value="staff" ${u.role === 'staff'?'selected':''}>User</option>
                    <option value="admin" ${u.role === 'admin'?'selected':''}>Admin</option>
                </select>
            </div>`,
        showCancelButton: true,
        preConfirm: () => ({
            salary: parseFloat(document.getElementById('ad-sal').value) || 0,
            otRate: parseFloat(document.getElementById('ad-ot').value) || 0,
            jobType: document.getElementById('ad-job').value,
            role: document.getElementById('ad-role').value
        })
    });
    if (res) {
        await db.ref('users/' + uid).update(res);
        alertCenter("บันทึกสำเร็จ");
    }
}

// --- 5. RIDER LOGIC ---
async function addDelivery(val) {
    const d = new Date().toISOString().split('T')[0];
    const log = logs.find(l => l.date === d);
    if(!log) return alertCenter("ต้อง Check-In ก่อน", "warning");
    let current = log.delivery || 0;
    let newVal = Math.max(0, current + val);
    await db.ref(`attendance/${currentUser.uid}/${log.id}`).update({ delivery: newVal });
}

// --- 6. SCHEDULE & ATTENDANCE ---
function renderSchedule() {
    const list = document.getElementById('week-list'); if(!list) return;
    list.innerHTML = DAYS.map(d => {
        const s = (userData.shifts && userData.shifts[d]) ? userData.shifts[d] : { in: '08:30', out: '17:30', isOff: false };
        return `
        <div class="glass-card p-4 ${s.isOff ? 'opacity-30' : ''}">
            <div class="flex justify-between items-center mb-3 text-[11px] font-bold">
                <span class="text-blue-400 uppercase">${d}</span>
                <button onclick="toggleDayOff('${d}', ${!s.isOff})" class="${s.isOff?'text-red-500':'text-zinc-500'}">${s.isOff?'OFF':'ON'}</button>
            </div>
            <div class="grid grid-cols-2 gap-3">
                <input type="time" id="in-${d}" class="time-pill" value="${s.in || '08:30'}">
                <input type="time" id="out-${d}" class="time-pill" value="${s.out || '17:30'}">
            </div>
        </div>`;
    }).join('');
}

async function saveWeekly() {
    const updates = {};
    DAYS.forEach(d => {
        updates[`${d}/in`] = document.getElementById(`in-${d}`).value;
        updates[`${d}/out`] = document.getElementById(`out-${d}`).value;
    });
    await db.ref(`users/${currentUser.uid}/shifts`).update(updates);
    alertCenter("บันทึกตารางแล้ว");
}

async function toggleDayOff(d, s) {
    await db.ref(`users/${currentUser.uid}/shifts/${d}/isOff`).set(s);
}

// --- 7. CALENDAR & SALARY ---
function renderCal() {
    const y = viewDate.getFullYear(), m = viewDate.getMonth();
    document.getElementById('mon-view').innerText = `${MONTHS[m]} ${y + 543}`;
    const total = new Date(y, m + 1, 0).getDate(), start = (new Date(y, m, 1).getDay() + 6) % 7;
    const grid = document.getElementById('cal-grid'); if(!grid) return; grid.innerHTML = '';
    for (let i = 0; i < start; i++) grid.innerHTML += '<div></div>';
    for (let d = 1; d <= total; d++) {
        const ds = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const log = logs.find(l => l.date === ds);
        grid.innerHTML += `<div onclick="manageLog('${ds}')" class="day-node mx-auto ${log ? (log.isOff ? 'st-off' : 'st-normal') : 'bg-white/5 opacity-50'}">${d}</div>`;
    }
}

async function manageLog(ds) {
    const log = logs.find(l => l.date === ds);
    const { value: action } = await Swal.fire({
        title: ds, background: '#1c1c1e', color: '#fff', showDenyButton: !!log,
        showCancelButton: true, confirmButtonText: log ? 'Update' : 'Add', denyButtonText: 'Delete'
    });
    if (action === true) {
        const { value: res } = await Swal.fire({
            background: '#1c1c1e', color: '#fff',
            html: `
                <div class="grid grid-cols-2 gap-2"><input id="sw-in" type="time" class="time-pill w-full" value="${log?log.checkIn:'08:30'}"><input id="sw-out" type="time" class="time-pill w-full" value="${log?log.checkOut:'17:30'}"></div>
                <input id="sw-oth" type="number" step="0.5" class="time-pill w-full mt-2" placeholder="OT (ชั่วโมง)" value="${log?log.otHours:0}">
                <input id="sw-bill" type="number" class="time-pill w-full mt-2" placeholder="จำนวนบิล" value="${log?log.delivery:0}">`,
            preConfirm: () => ({ 
                checkIn: document.getElementById('sw-in').value, 
                checkOut: document.getElementById('sw-out').value, 
                otHours: parseFloat(document.getElementById('sw-oth').value)||0,
                delivery: parseInt(document.getElementById('sw-bill').value)||0
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

function calculate() {
    const daily = (userData.salary || 0) / 30, otRate = userData.otRate || 0, billRate = 15;
    let total = 0, todayB = 0;
    logs.forEach(l => {
        if (new Date(l.date).getMonth() === new Date().getMonth()) {
            if (l.checkIn && !l.isOff) total += daily;
            total += (l.otHours || 0) * otRate;
            total += (l.delivery || 0) * billRate;
            if (l.date === new Date().toISOString().split('T')[0]) todayB = l.delivery || 0;
        }
    });
    document.getElementById('salary-view').innerText = total.toLocaleString(undefined, {minimumFractionDigits: 2});
    if(document.getElementById('today-bills')) document.getElementById('today-bills').innerText = todayB;
}

// --- 8. UTILS ---
function tapIn() {
    const d = new Date().toISOString().split('T')[0], t = new Date().toTimeString().slice(0, 5);
    if(logs.find(l => l.date === d)) return alertCenter("บันทึกไปแล้ว", "warning");
    db.ref(`attendance/${currentUser.uid}`).push({ date: d, checkIn: t, checkOut: '', isOff: false, delivery: 0, otHours: 0 });
    alertCenter("Check In สำเร็จ");
}

function tapOut() {
    const d = new Date().toISOString().split('T')[0], t = new Date().toTimeString().slice(0, 5);
    const log = logs.find(l => l.date === d);
    if(log && !log.checkOut) {
        db.ref(`attendance/${currentUser.uid}/${log.id}`).update({ checkOut: t });
        alertCenter("Check Out สำเร็จ");
    } else alertCenter("ไม่พบข้อมูล", "error");
}

function go(id, btn) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}
function moveMonth(v) { viewDate.setMonth(viewDate.getMonth() + v); renderCal(); }

async function editProfile() {
    const { value: name } = await Swal.fire({
        title: 'Edit Name', background: '#1c1c1e', color: '#fff',
        input: 'text', inputValue: userData.displayName || '',
        showCancelButton: true
    });
    if (name) await db.ref('users/' + currentUser.uid).update({ displayName: name });
}

async function handleFileUpload(input) {
    const file = input.files[0]; if (!file) return;
    const fd = new FormData(); fd.append("image", file);
    try {
        const r = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, { method: "POST", body: fd });
        const res = await r.json();
        if (res.success) await db.ref('users/' + currentUser.uid).update({ photoURL: res.data.url });
    } catch (e) { alertCenter("Upload Failed", "error"); }
}
