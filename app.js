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
let adminTargetId = null;

const DAYS = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];
const MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

// --- 1. NOTIFICATIONS ---
function alertCenter(msg, icon = "success") {
    Swal.fire({
        icon: icon, title: msg, position: 'center', showConfirmButton: false, timer: 1500,
        background: '#1c1c1e', color: '#fff'
    });
}

// --- 2. AUTH & SECURITY ---
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
    } catch (e) { alertCenter("ข้อมูลไม่ถูกต้อง", "error"); }
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
        db.ref('users/' + u.uid).on('value', s => {
            userData = s.val() || {};
            if (!adminTargetId) {
                updateUI();
                renderSchedule(userData);
            }
            // Strict Role Check: ซ่อน/แสดงหน้า Admin
            if (userData.role === 'admin') {
                document.getElementById('nav-admin').classList.remove('hidden');
                loadAdminList();
            } else {
                document.getElementById('nav-admin').classList.add('hidden');
                if (document.getElementById('p-admin').classList.contains('active')) go('p-home');
            }
        });
        db.ref('attendance/' + u.uid).on('value', s => {
            if (!adminTargetId) {
                const d = s.val();
                logs = d ? Object.keys(d).map(k => ({ id: k, ...d[k] })) : [];
                renderCal();
                calculate();
            }
        });
    }
});

function updateUI() {
    document.getElementById('u-display').innerText = userData.displayName || 'User';
    document.getElementById('u-photo').src = userData.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
    document.getElementById('rider-card').classList.toggle('hidden', userData.jobType !== 'rider');
}

// --- 3. ADMIN MANAGEMENT (Security Layers) ---
function loadAdminList() {
    if (userData.role !== 'admin') return;
    const list = document.getElementById('user-list');
    db.ref('users').on('value', s => {
        const users = s.val();
        if(!users) return;
        list.innerHTML = Object.keys(users).map(uid => `
            <div onclick="adminManageAction('${uid}')" class="glass-card p-4 flex justify-between items-center active:scale-[0.98] transition">
                <div class="flex items-center gap-4">
                    <img src="${users[uid].photoURL || ''}" class="w-11 h-11 rounded-full object-cover bg-zinc-800">
                    <div>
                        <p class="font-bold">${users[uid].displayName || users[uid].username}</p>
                        <p class="text-[9px] opacity-40 uppercase tracking-widest">${users[uid].role} | ${users[uid].jobType}</p>
                    </div>
                </div>
                <i class="fa-solid fa-chevron-right opacity-20"></i>
            </div>`).join('');
    });
}

async function adminManageAction(uid) {
    if (userData.role !== 'admin') return alertCenter("ไม่มีสิทธิ์", "error");
    const snap = await db.ref('users/' + uid).once('value');
    const target = snap.val();

    const { value: action } = await Swal.fire({
        title: target.displayName || target.username,
        text: 'จัดการส่วนไหนดี?',
        background: '#1c1c1e', color: '#fff',
        showDenyButton: true,
        showCancelButton: true,
        confirmButtonText: 'โปรไฟล์/เงินเดือน',
        denyButtonText: 'ตารางงาน/ปฏิทิน',
        cancelButtonText: 'ยกเลิก'
    });

    if (action === true) adminEditUserProfile(uid, target);
    else if (action === false) enterAdminView(uid, target.displayName);
}

async function adminEditUserProfile(uid, u) {
    const { value: res } = await Swal.fire({
        title: 'Edit Staff Profile',
        background: '#1c1c1e', color: '#fff',
        html: `
            <div class="space-y-3 text-left">
                <input id="ad-name" class="time-pill w-full" value="${u.displayName || ''}" placeholder="ชื่อ">
                <input id="ad-tel" class="time-pill w-full" value="${u.tel || ''}" placeholder="เบอร์โทร">
                <input id="ad-sal" type="number" class="time-pill w-full" value="${u.salary || 0}" placeholder="เงินเดือน">
                <select id="ad-job" class="time-pill w-full bg-[#2c2c2e]">
                    <option value="staff" ${u.jobType === 'staff'?'selected':''}>General Staff</option>
                    <option value="rider" ${u.jobType === 'rider'?'selected':''}>Rider</option>
                </select>
                <select id="ad-role" class="time-pill w-full bg-[#2c2c2e]">
                    <option value="staff" ${u.role === 'staff'?'selected':''}>Staff (User)</option>
                    <option value="admin" ${u.role === 'admin'?'selected':''}>Admin (Full Access)</option>
                </select>
            </div>`,
        showCancelButton: true, confirmButtonText: 'Save Changes',
        preConfirm: () => ({
            displayName: document.getElementById('ad-name').value,
            tel: document.getElementById('ad-tel').value,
            salary: parseFloat(document.getElementById('ad-sal').value) || 0,
            jobType: document.getElementById('ad-job').value,
            role: document.getElementById('ad-role').value
        })
    });

    if (res) {
        const confirm = await Swal.fire({
            title: 'ยืนยันการบันทึก?', text: 'ข้อมูลพนักงานจะเปลี่ยนทันที',
            icon: 'warning', background: '#1c1c1e', color: '#fff', showCancelButton: true
        });
        if (confirm.isConfirmed) {
            await db.ref('users/' + uid).update(res);
            alertCenter("อัปเดตข้อมูลพนักงานแล้ว");
        }
    }
}

function enterAdminView(uid, name) {
    adminTargetId = uid;
    document.getElementById('week-back').classList.remove('hidden');
    document.getElementById('cal-back').classList.remove('hidden');
    document.getElementById('week-target-name').innerText = "กำลังจัดการตารางงานของ: " + name;
    document.getElementById('cal-target-name').innerText = "กำลังดูประวัติของ: " + name;
    
    db.ref('users/' + uid).once('value', s => renderSchedule(s.val()));
    db.ref('attendance/' + uid).on('value', s => {
        const d = s.val();
        logs = d ? Object.keys(d).map(k => ({ id: k, ...d[k] })) : [];
        renderCal();
    });
    
    go('p-week');
    alertCenter("เข้าสู่โหมดรีโมทพนักงาน: " + name, "info");
}

function exitAdminView() {
    adminTargetId = null;
    document.getElementById('week-back').classList.add('hidden');
    document.getElementById('cal-back').classList.add('hidden');
    document.getElementById('week-target-name').innerText = "Personal Schedule";
    
    renderSchedule(userData);
    db.ref('attendance/' + currentUser.uid).on('value', s => {
        const d = s.val();
        logs = d ? Object.keys(d).map(k => ({ id: k, ...d[k] })) : [];
        renderCal();
        calculate();
    });
    go('p-admin');
}

// --- 4. SELF-EDIT (User Level) ---
async function editProfile() {
    const { value: res } = await Swal.fire({
        title: 'แก้ไขข้อมูลส่วนตัว',
        background: '#1c1c1e', color: '#fff',
        html: `
            <div class="mb-4" onclick="document.getElementById('file-input').click()">
                <img src="${userData.photoURL || ''}" class="w-20 h-20 rounded-full mx-auto border-2 border-blue-500 object-cover bg-zinc-900 shadow-lg">
                <p class="text-[9px] mt-2 opacity-40">แตะเพื่อเปลี่ยนรูป</p>
            </div>
            <div class="space-y-3 text-left">
                <input id="sw-name" class="time-pill w-full mt-1" value="${userData.displayName || ''}" placeholder="ชื่อ">
                <input id="sw-tel" class="time-pill w-full mt-1" value="${userData.tel || ''}" placeholder="เบอร์โทร">
                <select id="sw-job" class="time-pill w-full mt-1 bg-[#2c2c2e]">
                    <option value="staff" ${userData.jobType === 'staff'?'selected':''}>Staff</option>
                    <option value="rider" ${userData.jobType === 'rider'?'selected':''}>Rider</option>
                </select>
                <input id="sw-pass" type="password" class="time-pill w-full mt-1" placeholder="รหัสผ่านใหม่ (ว่างไว้ถ้าไม่เปลี่ยน)">
            </div>`,
        showCancelButton: true, confirmButtonText: 'ยืนยันแก้ไข',
        preConfirm: () => ({
            displayName: document.getElementById('sw-name').value,
            tel: document.getElementById('sw-tel').value,
            jobType: document.getElementById('sw-job').value,
            pass: document.getElementById('sw-pass').value
        })
    });

    if (res) {
        const confirm = await Swal.fire({
            title: 'บันทึกข้อมูลหรือไม่?', icon: 'question', background: '#1c1c1e', color: '#fff', showCancelButton: true
        });
        if (confirm.isConfirmed) {
            await db.ref('users/' + currentUser.uid).update({
                displayName: res.displayName,
                tel: res.tel,
                jobType: res.jobType
            });
            if (res.pass) await currentUser.updatePassword(res.pass);
            alertCenter("บันทึกข้อมูลส่วนตัวสำเร็จ");
        }
    }
}

// --- 5. LOGIC & UTILS ---
async function saveWeekly() {
    const tid = adminTargetId || currentUser.uid;
    const confirm = await Swal.fire({
        title: 'ยืนยันการบันทึก?', background: '#1c1c1e', color: '#fff', showCancelButton: true
    });
    if (confirm.isConfirmed) {
        const updates = {};
        DAYS.forEach(d => {
            updates[`${d}/in`] = document.getElementById(`in-${d}`).value;
            updates[`${d}/out`] = document.getElementById(`out-${d}`).value;
        });
        await db.ref(`users/${tid}/shifts`).update(updates);
        alertCenter("บันทึกตารางงานแล้ว");
    }
}

async function manageLog(ds) {
    const tid = adminTargetId || currentUser.uid;
    const log = logs.find(l => l.date === ds);
    const { value: action } = await Swal.fire({
        title: ds, background: '#1c1c1e', color: '#fff', showDenyButton: !!log,
        showCancelButton: true, confirmButtonText: log ? 'แก้ไข' : 'เพิ่ม', denyButtonText: 'ลบ'
    });

    if (action === true) {
        const { value: res } = await Swal.fire({
            background: '#1c1c1e', color: '#fff',
            html: `
                <div class="grid grid-cols-2 gap-2"><input id="sw-in" type="time" class="time-pill" value="${log?log.checkIn:'08:30'}"><input id="sw-out" type="time" class="time-pill" value="${log?log.checkOut:'17:30'}"></div>
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
            await db.ref(`attendance/${tid}/${log?log.id:''}`).update({ ...res, date: ds, isOff: false });
            alertCenter("อัปเดตประวัติเรียบร้อย");
        }
    } else if (action === false) {
        const confirm = await Swal.fire({ title: 'ลบข้อมูล?', icon: 'warning', background: '#1c1c1e', color: '#fff', showCancelButton: true });
        if (confirm.isConfirmed) {
            await db.ref(`attendance/${tid}/${log.id}`).remove();
            alertCenter("ลบสำเร็จ");
        }
    }
}

function tapIn() {
    if (adminTargetId) return;
    const d = new Date().toISOString().split('T')[0], t = new Date().toTimeString().slice(0, 5);
    if(logs.find(l => l.date === d)) return alertCenter("คุณได้ลงเวลาเข้างานแล้ว", "warning");
    db.ref(`attendance/${currentUser.uid}`).push({ date: d, checkIn: t, checkOut: '', isOff: false, delivery: 0, otHours: 0 });
    alertCenter("Check In สำเร็จ");
}

function tapOut() {
    if (adminTargetId) return;
    const d = new Date().toISOString().split('T')[0], t = new Date().toTimeString().slice(0, 5);
    const log = logs.find(l => l.date === d);
    if(log && !log.checkOut) {
        db.ref(`attendance/${currentUser.uid}/${log.id}`).update({ checkOut: t });
        alertCenter("Check Out สำเร็จ");
    } else alertCenter("ไม่พบข้อมูลการเข้างาน", "error");
}

async function addDelivery(val) {
    if (adminTargetId) return;
    const d = new Date().toISOString().split('T')[0];
    const log = logs.find(l => l.date === d);
    if(!log) return alertCenter("กรุณาลงเวลาเข้างานก่อน", "warning");
    let newVal = Math.max(0, (log.delivery || 0) + val);
    await db.ref(`attendance/${currentUser.uid}/${log.id}`).update({ delivery: newVal });
}

function renderSchedule(data) {
    const list = document.getElementById('week-list'); if(!list) return;
    const sData = data || userData;
    list.innerHTML = DAYS.map(d => {
        const s = (sData.shifts && sData.shifts[d]) ? sData.shifts[d] : { in: '08:30', out: '17:30', isOff: false };
        return `
        <div class="glass-card p-5 ${s.isOff ? 'opacity-30' : ''} ${adminTargetId ? 'border-green-500/30' : ''}">
            <div class="flex justify-between items-center mb-3">
                <span class="text-[11px] font-bold uppercase ${adminTargetId?'text-green-400':'text-blue-400'}">${d}</span>
                <button onclick="toggleDayOff('${d}', ${!s.isOff})" class="text-[10px] font-bold ${s.isOff?'text-red-500':'text-zinc-500'}">${s.isOff?'ปิด':'เปิด'}</button>
            </div>
            <div class="grid grid-cols-2 gap-3">
                <input type="time" id="in-${d}" class="time-pill" value="${s.in || '08:30'}">
                <input type="time" id="out-${d}" class="time-pill" value="${s.out || '17:30'}">
            </div>
        </div>`;
    }).join('');
}

async function toggleDayOff(d, s) {
    const tid = adminTargetId || currentUser.uid;
    await db.ref(`users/${tid}/shifts/${d}/isOff`).set(s);
    if(adminTargetId) {
        const snap = await db.ref('users/' + tid).once('value');
        renderSchedule(snap.val());
    }
}

function renderCal() {
    const y = viewDate.getFullYear(), m = viewDate.getMonth();
    document.getElementById('mon-view').innerText = `${MONTHS[m]} ${y + 543}`;
    const total = new Date(y, m + 1, 0).getDate(), start = (new Date(y, m, 1).getDay() + 6) % 7;
    const grid = document.getElementById('cal-grid'); if(!grid) return; grid.innerHTML = '';
    for (let i = 0; i < start; i++) grid.innerHTML += '<div></div>';
    for (let d = 1; d <= total; d++) {
        const ds = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const log = logs.find(l => l.date === ds);
        grid.innerHTML += `<div onclick="manageLog('${ds}')" class="day-node mx-auto ${log ? (log.isOff ? 'st-off' : 'st-normal') : 'bg-white/5 opacity-40'}">${d}</div>`;
    }
}

function calculate() {
    const daily = (userData.salary || 0) / 30, otRate = 50, billRate = 15;
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

function go(id, btn) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    if(btn) btn.classList.add('active');
}

function moveMonth(v) { viewDate.setMonth(viewDate.getMonth() + v); renderCal(); }

async function handleFileUpload(input) {
    const file = input.files[0]; if (!file) return;
    const fd = new FormData(); fd.append("image", file);
    try {
        const r = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, { method: "POST", body: fd });
        const res = await r.json();
        if (res.success) {
            await db.ref('users/' + currentUser.uid).update({ photoURL: res.data.url });
            alertCenter("เปลี่ยนรูปโปรไฟล์เรียบร้อย");
        }
    } catch (e) { alertCenter("อัปโหลดล้มเหลว", "error"); }
}
