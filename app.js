// --- 1. CONFIGURATION ---
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

// --- 2. NOTIFICATION (CENTER) ---
function alertCenter(msg, icon = "success") {
    Swal.fire({
        icon: icon, title: msg,
        position: 'center', showConfirmButton: false, timer: 1800,
        background: '#1c1c1e', color: '#fff', backdrop: `rgba(0,0,0,0.7)`
    });
}

// --- 3. AUTH LOGIC ---
async function doLogin() {
    const id = document.getElementById('l-id').value.trim(), pw = document.getElementById('l-pw').value;
    if(!id || !pw) return alertCenter("กรุณากรอกข้อมูล", "warning");
    try {
        let email = id;
        if (!id.includes('@')) {
            const snap = await db.ref('usernames/' + id.toLowerCase()).once('value');
            if (!snap.exists()) return alertCenter("ไม่พบผู้ใช้งาน", "error");
            email = snap.val().email;
        }
        await auth.signInWithEmailAndPassword(email, pw);
        alertCenter("เข้าสู่ระบบสำเร็จ");
    } catch (e) { alertCenter("Login Failed", "error"); }
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

// --- 4. PROFILE EDIT (ชื่อ, รูป, เงินเดือน, OT, Password, เบอร์โทร) ---
async function editProfile() {
    const { value: res } = await Swal.fire({
        title: 'แก้ไขข้อมูลโปรไฟล์',
        background: '#1c1c1e', color: '#fff',
        html: `
            <div class="mb-4" onclick="document.getElementById('file-input').click()">
                <img src="${userData.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" class="w-20 h-20 rounded-full mx-auto border-2 border-blue-500 object-cover cursor-pointer">
                <p class="text-[10px] mt-2 opacity-40">แตะเพื่อเปลี่ยนรูป</p>
            </div>
            <div class="space-y-3 text-left">
                <input id="sw-name" class="w-full bg-white/5 p-4 rounded-xl outline-none border border-white/5" value="${userData.displayName || ''}" placeholder="ชื่อ-นามสกุล">
                <input id="sw-phone" class="w-full bg-white/5 p-4 rounded-xl outline-none border border-white/5" value="${userData.phone || ''}" placeholder="เบอร์โทรศัพท์">
                <div class="grid grid-cols-2 gap-2">
                    <input id="sw-sal" type="number" class="bg-white/5 p-4 rounded-xl outline-none border border-white/5" value="${userData.salary || 0}" placeholder="เงินเดือน">
                    <input id="sw-ot" type="number" class="bg-white/5 p-4 rounded-xl outline-none border border-white/5" value="${userData.otRate || 0}" placeholder="OT/ชม.">
                </div>
                <input id="sw-pass" type="password" class="w-full bg-white/5 p-4 rounded-xl outline-none border border-white/5" placeholder="รหัสผ่านใหม่ (ว่าง = ไม่เปลี่ยน)">
            </div>`,
        showCancelButton: true, confirmButtonText: 'บันทึก',
        preConfirm: () => ({
            displayName: document.getElementById('sw-name').value,
            phone: document.getElementById('sw-phone').value,
            salary: parseFloat(document.getElementById('sw-sal').value) || 0,
            otRate: parseFloat(document.getElementById('sw-ot').value) || 0,
            newPass: document.getElementById('sw-pass').value
        })
    });

    if (res) {
        await db.ref('users/' + currentUser.uid).update({
            displayName: res.displayName, phone: res.phone, salary: res.salary, otRate: res.otRate
        });
        if (res.newPass) {
            currentUser.updatePassword(res.newPass).then(() => alertCenter("อัปเดตข้อมูลและรหัสผ่านสำเร็จ")).catch(e => alertCenter(e.message, "error"));
        } else alertCenter("อัปเดตข้อมูลสำเร็จ");
    }
}

// --- 5. WEEKLY SCHEDULE (IN/OUT INPUTS) ---
function renderSchedule() {
    const list = document.getElementById('week-list');
    if(!list) return;
    list.innerHTML = DAYS.map(d => {
        const s = (userData.shifts && userData.shifts[d]) ? userData.shifts[d] : { in: '08:30', out: '17:30', isOff: false };
        return `
        <div class="glass-card p-5 ${s.isOff ? 'opacity-30' : ''}">
            <div class="flex justify-between items-center mb-4 text-sm font-bold">
                <span class="text-blue-400">${d}</span>
                <button onclick="toggleDayOff('${d}', ${!s.isOff})" class="text-[10px] px-3 py-1 rounded-full border ${s.isOff ? 'border-red-500 text-red-500' : 'border-zinc-700 text-zinc-400'}">
                    ${s.isOff ? 'หยุด' : 'ทำงาน'}
                </button>
            </div>
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="text-[9px] opacity-40 uppercase ml-1">เวลาเข้า</label>
                    <input type="time" id="in-${d}" class="time-pill w-full text-center text-lg mt-1" value="${s.in}" ${s.isOff ? 'disabled' : ''}>
                </div>
                <div>
                    <label class="text-[9px] opacity-40 uppercase ml-1">เวลาออก</label>
                    <input type="time" id="out-${d}" class="time-pill w-full text-center text-lg mt-1" value="${s.out}" ${s.isOff ? 'disabled' : ''}>
                </div>
            </div>
        </div>`;
    }).join('');
}

async function toggleDayOff(day, status) {
    await db.ref(`users/${currentUser.uid}/shifts/${day}/isOff`).set(status);
    alertCenter(`${day} : ${status ? 'วันหยุด' : 'วันทำงาน'}`);
}

async function saveWeekly() {
    const updates = {};
    DAYS.forEach(d => {
        updates[`${d}/in`] = document.getElementById(`in-${d}`).value;
        updates[`${d}/out`] = document.getElementById(`out-${d}`).value;
    });
    await db.ref(`users/${currentUser.uid}/shifts`).update(updates);
    alertCenter("บันทึกตารางงานสำเร็จ");
}

// --- 6. ATTENDANCE & CALENDAR ---
function renderCal() {
    const y = viewDate.getFullYear(), m = viewDate.getMonth();
    document.getElementById('mon-view').innerText = `${MONTHS[m]} ${y + 543}`;
    const total = new Date(y, m + 1, 0).getDate(), start = (new Date(y, m, 1).getDay() + 6) % 7;
    const grid = document.getElementById('cal-grid'); if(!grid) return; grid.innerHTML = '';
    for (let i = 0; i < start; i++) grid.innerHTML += '<div></div>';
    for (let d = 1; d <= total; d++) {
        const ds = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const log = logs.find(l => l.date === ds);
        grid.innerHTML += `<div onclick="manageLog('${ds}')" class="day-node ${log ? (log.isOff ? 'st-off' : 'st-normal') : 'bg-white/5 opacity-50'}">${d}</div>`;
    }
}

async function manageLog(ds) {
    const log = logs.find(l => l.date === ds);
    const { value: action } = await Swal.fire({
        title: ds, background: '#1c1c1e', color: '#fff', showDenyButton: !!log,
        showCancelButton: true, confirmButtonText: log ? 'แก้ไข' : 'เพิ่ม',
        denyButtonText: 'ลบ', denyButtonColor: '#ef4444'
    });
    if (action === true) {
        const { value: res } = await Swal.fire({
            background: '#1c1c1e', color: '#fff',
            html: `
                <div class="grid grid-cols-2 gap-2 mb-2"><input id="sw-in" type="time" class="bg-white/5 p-3 rounded-xl" value="${log?log.checkIn:'08:30'}"><input id="sw-out" type="time" class="bg-white/5 p-3 rounded-xl" value="${log?log.checkOut:'17:30'}"></div>
                <div class="grid grid-cols-2 gap-2"><input id="sw-oth" type="number" step="0.5" class="bg-white/5 p-3 rounded-xl" placeholder="OT (ชม.)" value="${log?log.otHours:0}"><input id="sw-bill" type="number" class="bg-white/5 p-3 rounded-xl" placeholder="บิล" value="${log?log.delivery:0}"></div>`,
            preConfirm: () => ({ checkIn: document.getElementById('sw-in').value, checkOut: document.getElementById('sw-out').value, otHours: parseFloat(document.getElementById('sw-oth').value)||0, delivery: parseInt(document.getElementById('sw-bill').value)||0 })
        });
        if (res) {
            if (log) await db.ref(`attendance/${currentUser.uid}/${log.id}`).update(res);
            else await db.ref(`attendance/${currentUser.uid}`).push({ ...res, date: ds, isOff: false });
            alertCenter("บันทึกข้อมูลเรียบร้อย");
        }
    } else if (action === false) {
        await db.ref(`attendance/${currentUser.uid}/${log.id}`).remove();
        alertCenter("ลบข้อมูลแล้ว");
    }
}

// --- 7. UTILS ---
function calculate() {
    const daily = (userData.salary || 0) / 30, otRate = userData.otRate || 0;
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

function tapIn() {
    const d = new Date().toISOString().split('T')[0], t = new Date().toTimeString().slice(0, 5);
    if(logs.find(l => l.date === d)) return alertCenter("วันนี้บันทึกไปแล้ว", "warning");
    db.ref(`attendance/${currentUser.uid}`).push({ date: d, checkIn: t, checkOut: '', isOff: false, delivery: 0, otHours: 0 });
    alertCenter("Check-In: " + t);
}

function tapOut() {
    const d = new Date().toISOString().split('T')[0], t = new Date().toTimeString().slice(0, 5);
    const log = logs.find(l => l.date === d);
    if(log && !log.checkOut) {
        db.ref(`attendance/${currentUser.uid}/${log.id}`).update({ checkOut: t });
        alertCenter("Check-Out: " + t);
    } else alertCenter("ไม่สามารถ Check-Out ได้", "error");
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

function go(id, btn) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}
function moveMonth(v) { viewDate.setMonth(viewDate.getMonth() + v); renderCal(); }
function confirmLogout() { if(confirm("ต้องการออกจากระบบ?")) auth.signOut(); }
function addDelivery(v) {
    const d = new Date().toISOString().split('T')[0], log = logs.find(l => l.date === d);
    if(log) db.ref(`attendance/${currentUser.uid}/${log.id}`).update({ delivery: (log.delivery || 0) + v });
}
