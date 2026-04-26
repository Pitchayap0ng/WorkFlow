// --- CONFIGURATION ---
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

// --- NOTIFICATION ---
function alertCenter(msg, icon = "success") {
    Swal.fire({
        icon: icon, title: msg, position: 'center', showConfirmButton: false, timer: 1800,
        background: '#1c1c1e', color: '#fff', backdrop: `rgba(0,0,0,0.8)`
    });
}

// --- AUTH ---
async function doLogin() {
    const id = document.getElementById('l-id').value.trim(), pw = document.getElementById('l-pw').value;
    if(!id || !pw) return alertCenter("กรุณากรอกข้อมูล", "warning");
    try {
        let email = id;
        if (!id.includes('@')) {
            const snap = await db.ref('usernames/' + id.toLowerCase()).once('value');
            if (!snap.exists()) return alertCenter("ไม่พบชื่อผู้ใช้งาน", "error");
            email = snap.val().email;
        }
        await auth.signInWithEmailAndPassword(email, pw);
        alertCenter("เข้าสู่ระบบสำเร็จ");
    } catch (e) { alertCenter("Login Failed", "error"); }
}

async function confirmLogout() {
    const res = await Swal.fire({
        title: 'ออกจากระบบ?',
        icon: 'warning', background: '#1c1c1e', color: '#fff',
        showCancelButton: true, confirmButtonText: 'ตกลง', cancelButtonText: 'ยกเลิก'
    });
    if (res.isConfirmed) auth.signOut();
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
    renderSchedule();
}

// --- ADMIN MANAGE (แก้ไขให้ดึงข้อมูลได้ชัวร์) ---
function loadAdmin() {
    const list = document.getElementById('user-list');
    db.ref('users').on('value', s => {
        const users = s.val();
        if(!users) {
            list.innerHTML = '<p class="text-center opacity-20 py-10">No users found</p>';
            return;
        }
        list.innerHTML = Object.keys(users).map(uid => `
            <div onclick="adminEdit('${uid}')" class="glass-card p-4 flex justify-between items-center active:scale-[0.98] transition">
                <div class="flex items-center gap-4">
                    <img src="${users[uid].photoURL || ''}" class="w-10 h-10 rounded-full object-cover bg-zinc-800">
                    <div>
                        <p class="font-bold text-sm">${users[uid].displayName || users[uid].username || 'No Name'}</p>
                        <p class="text-[9px] opacity-40 uppercase tracking-widest">${users[uid].role || 'staff'}</p>
                    </div>
                </div>
                <i class="fa-solid fa-chevron-right opacity-20"></i>
            </div>`).join('');
    });
}

async function adminEdit(uid) {
    const snap = await db.ref('users/' + uid).once('value');
    const u = snap.val();
    const { value: res } = await Swal.fire({
        title: 'จัดการพนักงาน',
        background: '#1c1c1e', color: '#fff',
        html: `
            <div class="space-y-3 text-left">
                <label class="text-[10px] ml-1 opacity-40 uppercase">Salary & OT</label>
                <div class="grid grid-cols-2 gap-2">
                    <input id="ad-sal" type="number" class="bg-white/5 p-4 rounded-xl text-white border border-white/5 outline-none" value="${u.salary || 0}" placeholder="Salary">
                    <input id="ad-ot" type="number" class="bg-white/5 p-4 rounded-xl text-white border border-white/5 outline-none" value="${u.otRate || 0}" placeholder="OT Rate">
                </div>
                <label class="text-[10px] ml-1 opacity-40 uppercase mt-4 block">Permission</label>
                <select id="ad-role" class="w-full bg-[#2c2c2e] p-4 rounded-xl text-white outline-none border border-white/5">
                    <option value="staff" ${u.role === 'staff' ? 'selected' : ''}>Staff (User)</option>
                    <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                </select>
            </div>`,
        showCancelButton: true,
        confirmButtonText: 'บันทึก',
        preConfirm: () => ({ 
            salary: parseFloat(document.getElementById('ad-sal').value) || 0, 
            otRate: parseFloat(document.getElementById('ad-ot').value) || 0, 
            role: document.getElementById('ad-role').value 
        })
    });
    if (res) {
        await db.ref('users/' + uid).update(res);
        alertCenter("อัปเดตข้อมูลพนักงานสำเร็จ");
    }
}

// --- WEEKLY SCHEDULE (แก้ Error Undefined) ---
function renderSchedule() {
    const list = document.getElementById('week-list');
    if(!list) return;
    list.innerHTML = DAYS.map(d => {
        const shiftData = (userData.shifts && userData.shifts[d]) ? userData.shifts[d] : {};
        const s = {
            in: shiftData.in || '08:30',
            out: shiftData.out || '17:30',
            isOff: shiftData.isOff || false
        };
        return `
        <div class="glass-card p-5 ${s.isOff ? 'opacity-30' : ''}">
            <div class="flex justify-between items-center mb-4 text-sm font-bold">
                <span class="text-blue-400 uppercase">${d}</span>
                <button onclick="toggleDayOff('${d}', ${!s.isOff})" class="text-[10px] px-3 py-1 rounded-full border ${s.isOff ? 'border-red-500 text-red-500' : 'border-zinc-700 text-zinc-400'}">
                    ${s.isOff ? 'STOP' : 'WORK'}
                </button>
            </div>
            <div class="grid grid-cols-2 gap-4">
                <input type="time" id="in-${d}" class="time-pill w-full text-center text-lg" value="${s.in}">
                <input type="time" id="out-${d}" class="time-pill w-full text-center text-lg" value="${s.out}">
            </div>
        </div>`;
    }).join('');
}

async function saveWeekly() {
    const updates = {};
    DAYS.forEach(d => {
        updates[`${d}/in`] = document.getElementById(`in-${d}`).value || '08:30';
        updates[`${d}/out`] = document.getElementById(`out-${d}`).value || '17:30';
    });
    await db.ref(`users/${currentUser.uid}/shifts`).update(updates);
    alertCenter("บันทึกตารางงานแล้ว");
}

async function toggleDayOff(d, s) {
    await db.ref(`users/${currentUser.uid}/shifts/${d}/isOff`).set(s);
}

// --- ATTENDANCE & CALENDAR ---
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
                <div class="grid grid-cols-2 gap-2 mb-2"><input id="sw-in" type="time" class="time-pill w-full" value="${log?log.checkIn:'08:30'}"><input id="sw-out" type="time" class="time-pill w-full" value="${log?log.checkOut:'17:30'}"></div>
                <div class="grid grid-cols-1"><input id="sw-oth" type="number" step="0.5" class="time-pill w-full mt-2" placeholder="OT (Hours)" value="${log?log.otHours:0}"></div>`,
            preConfirm: () => ({ checkIn: document.getElementById('sw-in').value, checkOut: document.getElementById('sw-out').value, otHours: parseFloat(document.getElementById('sw-oth').value)||0 })
        });
        if (res) {
            if (log) await db.ref(`attendance/${currentUser.uid}/${log.id}`).update(res);
            else await db.ref(`attendance/${currentUser.uid}`).push({ ...res, date: ds, isOff: false });
            alertCenter("บันทึกแล้ว");
        }
    } else if (action === false) {
        await db.ref(`attendance/${currentUser.uid}/${log.id}`).remove();
        alertCenter("ลบแล้ว");
    }
}

function calculate() {
    const daily = (userData.salary || 0) / 30, otRate = userData.otRate || 0;
    let total = 0;
    logs.forEach(l => {
        if (new Date(l.date).getMonth() === new Date().getMonth()) {
            if (l.checkIn && !l.isOff) total += daily;
            total += (l.otHours || 0) * otRate;
        }
    });
    document.getElementById('salary-view').innerText = total.toLocaleString(undefined, {minimumFractionDigits: 2});
}

// --- UTILS ---
function tapIn() {
    const d = new Date().toISOString().split('T')[0], t = new Date().toTimeString().slice(0, 5);
    if(logs.find(l => l.date === d)) return alertCenter("บันทึกวันนี้ไปแล้ว", "warning");
    db.ref(`attendance/${currentUser.uid}`).push({ date: d, checkIn: t, checkOut: '', isOff: false, otHours: 0 });
    alertCenter("Check In: " + t);
}

function tapOut() {
    const d = new Date().toISOString().split('T')[0], t = new Date().toTimeString().slice(0, 5);
    const log = logs.find(l => l.date === d);
    if(log && !log.checkOut) {
        db.ref(`attendance/${currentUser.uid}/${log.id}`).update({ checkOut: t });
        alertCenter("Check Out: " + t);
    } else alertCenter("ไม่พบข้อมูลเช็คอิน", "error");
}

function go(id, btn) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}
function moveMonth(v) { viewDate.setMonth(viewDate.getMonth() + v); renderCal(); }

async function editProfile() {
    const { value: res } = await Swal.fire({
        title: 'Profile Settings',
        background: '#1c1c1e', color: '#fff',
        html: `<div class="mb-4" onclick="document.getElementById('file-input').click()"><img src="${userData.photoURL || ''}" class="w-20 h-20 rounded-full mx-auto border-2 border-blue-500 object-cover"><p class="text-[10px] mt-2 opacity-40">Tap to Change</p></div><input id="sw-name" class="w-full bg-white/5 p-4 rounded-xl border border-white/5 text-white" value="${userData.displayName || ''}" placeholder="Name">`,
        showCancelButton: true, preConfirm: () => document.getElementById('sw-name').value
    });
    if (res) {
        await db.ref('users/' + currentUser.uid).update({ displayName: res });
        alertCenter("อัปเดตชื่อสำเร็จ");
    }
}

async function handleFileUpload(input) {
    const file = input.files[0]; if (!file) return;
    const fd = new FormData(); fd.append("image", file);
    try {
        const r = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, { method: "POST", body: fd });
        const res = await r.json();
        if (res.success) {
            await db.ref('users/' + currentUser.uid).update({ photoURL: res.data.url });
            alertCenter("เปลี่ยนรูปโปรไฟล์สำเร็จ");
        }
    } catch (e) { alertCenter("Upload Failed", "error"); }
}
