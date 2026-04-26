// --- Firebase Configuration ---
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

// --- Auth & Init ---
async function doLogin() {
    const id = document.getElementById('l-id').value.trim(), pw = document.getElementById('l-pw').value;
    if(!id || !pw) return toast("กรุณากรอกข้อมูล", "warning");
    try {
        let email = id;
        if (!id.includes('@')) {
            const snap = await db.ref('usernames/' + id.toLowerCase()).once('value');
            if (!snap.exists()) return toast("ไม่พบผู้ใช้งาน", "error");
            email = snap.val().email;
        }
        await auth.signInWithEmailAndPassword(email, pw);
    } catch (e) { toast("เข้าสู่ระบบไม่สำเร็จ", "error"); }
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
                loadAdminList();
            }
        });
        db.ref('attendance/' + u.uid).on('value', s => {
            const d = s.val();
            logs = d ? Object.keys(d).map(k => ({ id: k, ...d[k] })) : [];
            renderCal();
            calculateSalary();
        });
    }
});

function updateUI() {
    document.getElementById('u-display').innerText = userData.displayName || 'User';
    document.getElementById('u-photo').src = userData.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
    document.getElementById('rider-card').classList.toggle('hidden', userData.jobType !== 'rider');
    renderSchedule();
}

// --- Profile & Admin Edit ---
async function editProfile() {
    const { value: res } = await Swal.fire({
        title: 'แก้ไขโปรไฟล์',
        background: '#1c1c1e', color: '#fff',
        html: `<input id="sw-name" class="w-full bg-white/5 p-4 rounded-xl mb-4" value="${userData.displayName || ''}" placeholder="ชื่อเล่น">`,
        showCancelButton: true,
        confirmButtonText: 'บันทึก',
        preConfirm: () => ({ displayName: document.getElementById('sw-name').value })
    });
    if (res) await db.ref('users/' + currentUser.uid).update(res);
}

function loadAdminList() {
    const list = document.getElementById('user-list');
    db.ref('users').on('value', s => {
        const users = s.val();
        if (!users) return;
        list.innerHTML = Object.keys(users).map(uid => `
            <div onclick="adminManageUser('${uid}')" class="glass-card p-4 flex items-center justify-between mb-2">
                <div class="flex items-center gap-3">
                    <img src="${users[uid].photoURL || ''}" class="w-10 h-10 rounded-full bg-zinc-800">
                    <div><p class="font-bold text-sm">${users[uid].displayName || users[uid].username}</p></div>
                </div>
                <i class="fa-solid fa-chevron-right opacity-20"></i>
            </div>`).join('');
    });
}

async function adminManageUser(targetUid) {
    const snap = await db.ref('users/' + targetUid).once('value');
    const u = snap.val();
    const { value: res } = await Swal.fire({
        title: 'จัดการพนักงาน',
        background: '#1c1c1e', color: '#fff',
        html: `
            <input id="adm-sal" type="number" class="w-full bg-white/5 p-4 rounded-xl mb-2" value="${u.salary || 15000}" placeholder="เงินเดือน">
            <select id="adm-role" class="w-full bg-white/5 p-4 rounded-xl text-white">
                <option value="staff" ${u.role==='staff'?'selected':''}>Staff</option>
                <option value="admin" ${u.role==='admin'?'selected':''}>Admin</option>
            </select>`,
        showCancelButton: true,
        preConfirm: () => ({ salary: parseFloat(document.getElementById('adm-sal').value), role: document.getElementById('adm-role').value })
    });
    if (res) await db.ref('users/' + targetUid).update(res);
}

// --- Attendance & Logic ---
async function manageLog(ds) {
    const log = logs.find(l => l.date === ds);
    const { value: action } = await Swal.fire({
        title: ds,
        background: '#1c1c1e', color: '#fff',
        showDenyButton: !!log,
        showCancelButton: true,
        confirmButtonText: log ? 'แก้ไข' : 'เพิ่ม',
        denyButtonText: 'ลบ',
        denyButtonColor: '#ef4444'
    });

    if (action === true) {
        const { value: res } = await Swal.fire({
            background: '#1c1c1e', color: '#fff',
            html: `
                <input id="sw-in" type="time" class="w-full bg-white/5 p-3 mb-2 rounded-xl" value="${log ? log.checkIn : '08:30'}">
                <input id="sw-out" type="time" class="w-full bg-white/5 p-3 mb-2 rounded-xl" value="${log ? log.checkOut : '17:30'}">
                <input id="sw-bill" type="number" class="w-full bg-white/5 p-3 rounded-xl" value="${log ? (log.delivery || 0) : 0}">`,
            preConfirm: () => ({ checkIn: document.getElementById('sw-in').value, checkOut: document.getElementById('sw-out').value, delivery: parseInt(document.getElementById('sw-bill').value) || 0 })
        });
        if (res) {
            if (log) await db.ref(`attendance/${currentUser.uid}/${log.id}`).update(res);
            else await db.ref(`attendance/${currentUser.uid}`).push({ ...res, date: ds, isOff: false });
        }
    } else if (action === false) {
        await db.ref(`attendance/${currentUser.uid}/${log.id}`).remove();
    }
}

function calculateSalary() {
    const daily = (userData.salary || 15000) / 30;
    let total = 0, todayB = 0;
    logs.forEach(l => {
        if (new Date(l.date).getMonth() === new Date().getMonth()) {
            if (l.checkIn && !l.isOff) total += daily;
            total += (l.delivery || 0) * 15;
            if (l.date === new Date().toISOString().split('T')[0]) todayB = l.delivery || 0;
        }
    });
    document.getElementById('salary-view').innerText = total.toLocaleString(undefined, {minimumFractionDigits: 2});
    document.getElementById('today-bills').innerText = todayB;
}

// --- Utils ---
function toast(m, i="success") { Swal.fire({ title: m, icon: i, timer: 1500, showConfirmButton: false, background: '#1c1c1e', color: '#fff' }); }
function confirmLogout() { Swal.fire({ title: 'ออกจากระบบ?', showCancelButton: true, background: '#1c1c1e', color: '#fff' }).then(r => { if (r.isConfirmed) auth.signOut(); }); }
function go(id, btn) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}
function moveMonth(v) { viewDate.setMonth(viewDate.getMonth() + v); renderCal(); }
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
        grid.innerHTML += `<div onclick="manageLog('${ds}')" class="day-node ${log ? (log.isOff ? 'st-off' : 'st-normal') : 'bg-white/5'}">${d}</div>`;
    }
}
function renderSchedule() {
    const list = document.getElementById('week-list');
    if(!list) return;
    list.innerHTML = DAYS.map(d => {
        const s = (userData.shifts && userData.shifts[d]) ? userData.shifts[d] : { in: '08:30', out: '17:30', isOff: false };
        return `<div class="glass-card p-4 flex justify-between items-center ${s.isOff ? 'opacity-30' : ''}">
            <div class="font-bold text-xs">${d}</div>
            <div class="flex gap-2">
                <input type="time" class="time-pill" value="${s.in}" onchange="db.ref('users/${currentUser.uid}/shifts/${d}/in').set(this.value)">
                <button onclick="db.ref('users/${currentUser.uid}/shifts/${d}/isOff').set(${!s.isOff})" class="p-2 text-blue-500"><i class="fa-solid ${s.isOff ? 'fa-toggle-off' : 'fa-toggle-on'}"></i></button>
            </div></div>`;
    }).join('');
}
function addDelivery(val) {
    const d = new Date().toISOString().split('T')[0], log = logs.find(l => l.date === d);
    if(log) db.ref(`attendance/${currentUser.uid}/${log.id}`).update({ delivery: (log.delivery || 0) + val });
}
function tapIn() {
    const d = new Date().toISOString().split('T')[0], t = new Date().toTimeString().slice(0, 5);
    if(!logs.find(l => l.date === d)) db.ref(`attendance/${currentUser.uid}`).push({ date: d, checkIn: t, checkOut: '', isOff: false, delivery: 0 });
}
function tapOut() {
    const d = new Date().toISOString().split('T')[0], t = new Date().toTimeString().slice(0, 5);
    const log = logs.find(l => l.date === d);
    if(log && !log.checkOut) db.ref(`attendance/${currentUser.uid}/${log.id}`).update({ checkOut: t });
}
