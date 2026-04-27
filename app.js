const firebaseConfig = {
    apiKey: "AIzaSyA11zPbXEFs-sdIHKaxhkprkoGSGP1whfg",
    authDomain: "ims-fei.firebaseapp.com",
    databaseURL: "https://ims-fei-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "ims-fei",
    storageBucket: "ims-fei.firebasestorage.app",
    appId: "1:791711191329:web:0a4ba03cd5f11eb71bae60"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth(), db = firebase.database(), storage = firebase.storage();
emailjs.init("WSvF2N1nopC2xfuZo");

let currentUser = null, userData = {}, logs = [], viewDate = new Date(), adminTargetId = null;

const DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const MONTHS_TH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const HOLIDAYS = { "01-01": "ปีใหม่", "04-13": "สงกรานต์", "12-05": "วันพ่อ", "12-31": "สิ้นปี" };

// --- [ UTILS: NOTIFICATION & LOGS ] ---
function pushLog(msg, type="info") {
    const tid = adminTargetId || currentUser.uid;
    const now = new Date();
    const logData = {
        msg, type,
        time: now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
        date: now.toLocaleDateString('th-TH'),
        ts: Date.now()
    };
    db.ref(`logs/${tid}`).push(logData);
    
    Swal.fire({
        title: msg, icon: type, timer: 1500, showConfirmButton: false,
        toast: true, position: 'top-end', background: '#1c1c1e', color: '#fff'
    });
}

// --- [ AUTH LOGIC ] ---
async function doLogin() {
    const id = document.getElementById('l-id').value.trim(), pw = document.getElementById('l-pw').value;
    if(!id || !pw) return;
    try {
        let email = id;
        if (!id.includes('@')) {
            const s = await db.ref('usernames/' + id.toLowerCase()).once('value');
            if (!s.exists()) throw new Error("ไม่พบ Username");
            email = s.val().email;
        }
        await auth.signInWithEmailAndPassword(email, pw);
        pushLog("เข้าสู่ระบบสำเร็จ", "success");
    } catch (e) { pushLog(e.message, "error"); }
}

function toggleAuth(isReg) {
    document.getElementById('login-box').classList.toggle('hidden', isReg);
    document.getElementById('reg-box').classList.toggle('hidden', !isReg);
}

// --- [ PROFILE & PHOTO UPLOAD ] ---
function triggerUpload() { document.getElementById('u-file').click(); }

async function uploadPhoto(input) {
    const file = input.files[0];
    if (!file) return;
    const tid = adminTargetId || currentUser.uid;
    const ref = storage.ref(`profiles/${tid}`);
    
    Swal.showLoading();
    try {
        await ref.put(file);
        const url = await ref.getDownloadURL();
        await db.ref(`users/${tid}`).update({ photoURL: url });
        pushLog("อัปโหลดรูปโปรไฟล์ใหม่แล้ว", "success");
    } catch (e) { pushLog("อัปโหลดไม่สำเร็จ", "error"); }
    Swal.close();
}

async function openEditProfile() {
    const tid = adminTargetId || currentUser.uid;
    const s = await db.ref(`users/${tid}`).once('value');
    const d = s.val() || {};

    const { value: res } = await Swal.fire({
        title: 'แก้ไขโปรไฟล์', background: '#1c1c1e', color: '#fff',
        html: `
            <div class="text-left space-y-3 px-2 overflow-y-auto max-h-[60vh]">
                <label class="text-[10px] opacity-40 uppercase font-bold">Display Name</label>
                <input id="e-name" class="time-pill w-full mb-3" value="${d.displayName || ''}">
                <label class="text-[10px] opacity-40 uppercase font-bold">Phone Number</label>
                <input id="e-phone" class="time-pill w-full mb-3" value="${d.phone || ''}">
                ${userData.isAdmin ? `
                    <hr class="opacity-10 my-4">
                    <label class="text-[10px] text-blue-500 font-bold">SALARY (ADMIN ONLY)</label>
                    <input id="e-salary" type="number" class="time-pill w-full mb-3" value="${d.salary || 15000}">
                    <label class="text-[10px] text-blue-500 font-bold">ROLE</label>
                    <select id="e-role" class="time-pill w-full mb-3">
                        <option value="false" ${!d.isAdmin?'selected':''}>พนักงาน (Staff)</option>
                        <option value="true" ${d.isAdmin?'selected':''}>ผู้ดูแล (Admin)</option>
                    </select>
                    <label class="text-[10px] text-blue-500 font-bold">JOB TYPE</label>
                    <select id="e-job" class="time-pill w-full">
                        <option value="staff" ${d.jobType==='staff'?'selected':''}>งานออฟฟิศ</option>
                        <option value="rider" ${d.jobType==='rider'?'selected':''}>Rider (ส่งบิล)</option>
                    </select>
                ` : ''}
            </div>`,
        showCancelButton: true,
        preConfirm: () => {
            const up = { displayName: document.getElementById('e-name').value, phone: document.getElementById('e-phone').value };
            if(userData.isAdmin) {
                up.salary = parseFloat(document.getElementById('e-salary').value);
                up.isAdmin = document.getElementById('e-role').value === "true";
                up.jobType = document.getElementById('e-job').value;
            }
            return up;
        }
    });
    if (res) {
        await db.ref(`users/${tid}`).update(res);
        pushLog("อัปเดตข้อมูลพนักงานแล้ว", "success");
    }
}

// --- [ ATTENDANCE CORE ] ---
function tapIn() {
    const d = new Date().toISOString().split('T')[0], t = new Date().toTimeString().slice(0, 5);
    const tid = adminTargetId || currentUser.uid;
    if(logs.find(l => l.date === d)) return pushLog("วันนี้เช็คอินแล้ว", "warning");
    db.ref(`attendance/${tid}`).push({ date: d, checkIn: t, checkOut: '', isOff: false, delivery: 0 });
    pushLog(`เช็คอินเข้างาน: ${t}`, "success");
}

function tapOut() {
    const d = new Date().toISOString().split('T')[0], t = new Date().toTimeString().slice(0, 5);
    const tid = adminTargetId || currentUser.uid;
    const log = logs.find(l => l.date === d);
    if(!log || log.checkOut) return pushLog("ไม่พบข้อมูลเช็คอิน", "error");
    db.ref(`attendance/${tid}/${log.id}`).update({ checkOut: t });
    pushLog(`เช็คเอาท์ออกงาน: ${t}`, "success");
}

async function addDelivery(v) {
    const tid = adminTargetId || currentUser.uid;
    const d = new Date().toISOString().split('T')[0];
    let log = logs.find(l => l.date === d);
    if(!log) {
        await db.ref(`attendance/${tid}`).push({ date: d, checkIn: '--:--', delivery: Math.max(0, v), isOff: false });
    } else {
        await db.ref(`attendance/${tid}/${log.id}`).update({ delivery: Math.max(0, (log.delivery || 0) + v) });
    }
}

// --- [ ADMIN VIEW LOGIC ] ---
function loadUserList() {
    db.ref('users').on('value', s => {
        const users = s.val();
        document.getElementById('user-list').innerHTML = Object.keys(users).map(id => `
            <div onclick="enterAdminView('${id}', '${users[id].displayName || 'User'}')" class="glass-card p-4 flex justify-between items-center active:scale-95 transition">
                <div class="flex items-center gap-4">
                    <img src="${users[id].photoURL || ''}" class="w-12 h-12 rounded-full object-cover bg-zinc-800">
                    <div class="text-left">
                        <p class="font-bold text-sm">${users[id].displayName || users[id].username}</p>
                        <p class="text-[9px] opacity-40 uppercase tracking-widest">${users[id].jobType} | ${users[id].isAdmin ? 'Admin' : 'Staff'}</p>
                    </div>
                </div>
                <i class="fa-solid fa-chevron-right opacity-10"></i>
            </div>
        `).join('');
    });
}

function enterAdminView(id, name) {
    adminTargetId = id;
    document.getElementById('remote-banner').classList.remove('hidden');
    document.getElementById('remote-name').innerText = name;
    initApp(); go('p-home');
    pushLog(`ควบคุมเครื่อง: ${name}`, "info");
}

function exitAdminView() {
    adminTargetId = null;
    document.getElementById('remote-banner').classList.add('hidden');
    initApp();
    pushLog("กลับสู่โหมดปกติ");
}

// --- [ RENDER & CALCULATION ] ---
auth.onAuthStateChanged(u => {
    currentUser = u;
    document.getElementById('auth-ui').classList.toggle('hidden', !!u);
    document.getElementById('app-ui').classList.toggle('hidden', !u);
    if (u) initApp();
});

function initApp() {
    const tid = adminTargetId || currentUser.uid;
    
    db.ref(`users/${tid}`).on('value', s => {
        const data = s.val() || {};
        if(!adminTargetId) userData = data;
        document.getElementById('u-display').innerText = data.displayName || data.username;
        document.getElementById('u-photo').src = data.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
        document.getElementById('nav-admin').classList.toggle('hidden', !userData.isAdmin);
        document.getElementById('rider-card').classList.toggle('hidden', data.jobType !== 'rider');
        renderWeekly(data);
        calculateSalary(data);
        if(userData.isAdmin) loadUserList();
    });

    db.ref(`attendance/${tid}`).on('value', s => {
        const d = s.val();
        logs = d ? Object.keys(d).map(k => ({ id: k, ...d[k] })) : [];
        const todayLog = logs.find(l => l.date === new Date().toISOString().split('T')[0]);
        document.getElementById('today-bills').innerText = todayLog ? (todayLog.delivery || 0) : 0;
        renderCal();
    });

    db.ref(`logs/${tid}`).limitToLast(10).on('value', s => {
        const list = s.val();
        document.getElementById('log-list').innerHTML = list ? Object.values(list).reverse().map(l => `
            <div class="flex justify-between items-center text-[11px] opacity-70 border-b border-white/5 pb-2">
                <div class="flex gap-2">
                    <span class="text-blue-500">•</span>
                    <span>${l.msg}</span>
                </div>
                <span class="text-[9px] opacity-40">${l.time}</span>
            </div>
        `).join('') : '<p class="text-center opacity-20 py-4">ไม่มีประวัติกิจกรรม</p>';
    });
}

function renderCal() {
    const y = viewDate.getFullYear(), m = viewDate.getMonth();
    document.getElementById('mon-view').innerText = `${MONTHS_TH[m]} ${y + 543}`;
    const total = new Date(y, m + 1, 0).getDate(), start = new Date(y, m, 1).getDay();
    const grid = document.getElementById('cal-grid'); grid.innerHTML = '';
    
    for (let i = 0; i < start; i++) grid.innerHTML += '<div></div>';
    for (let d = 1; d <= total; d++) {
        const date = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const log = logs.find(l => l.date === date);
        const hName = HOLIDAYS[`${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`];
        let cls = log ? (log.isOff ? 'st-off' : 'st-normal') : (hName ? 'st-holiday' : 'bg-white/5');
        grid.innerHTML += `<div onclick="editDay('${date}')" class="day-node ${cls}">${d}</div>`;
    }
}

async function editDay(date) {
    const log = logs.find(l => l.date === date) || { checkIn: '', checkOut: '', isOff: false };
    const { value: res } = await Swal.fire({
        title: 'แก้ไขข้อมูลวัน: ' + date, background: '#1c1c1e', color: '#fff',
        html: `
            <div class="space-y-4">
                <label class="flex justify-between items-center bg-white/5 p-4 rounded-2xl">
                    <span class="text-sm font-bold uppercase">ตั้งเป็นวันหยุด</span>
                    <input type="checkbox" id="e-off" ${log.isOff ? 'checked' : ''} class="w-6 h-6">
                </label>
                <div class="grid grid-cols-2 gap-2">
                    <input type="time" id="e-in" class="time-pill" value="${log.checkIn}">
                    <input type="time" id="e-out" class="time-pill" value="${log.checkOut}">
                </div>
            </div>`,
        showCancelButton: true,
        preConfirm: () => ({ isOff: document.getElementById('e-off').checked, checkIn: document.getElementById('e-in').value, checkOut: document.getElementById('e-out').value })
    });
    if(res) {
        const tid = adminTargetId || currentUser.uid;
        if(log.id) await db.ref(`attendance/${tid}/${log.id}`).update(res);
        else await db.ref(`attendance/${tid}`).push({ ...res, date });
        pushLog("ปรับปรุงบันทึกเวลาแล้ว");
    }
}

function calculateSalary(data) {
    const dailyRate = (data.salary || 15000) / 30;
    const currentMonth = new Date().getMonth();
    const workDays = logs.filter(l => new Date(l.date).getMonth() === currentMonth && !l.isOff && l.checkIn !== '--:--').length;
    document.getElementById('salary-view').innerText = (workDays * dailyRate).toLocaleString(undefined, {minimumFractionDigits: 2});
}

function renderWeekly(data) {
    const list = document.getElementById('week-list');
    list.innerHTML = DAYS.map(d => {
        const s = (data.shifts && data.shifts[d]) ? data.shifts[d] : { in: '08:30', out: '17:30', isOff: false };
        return `
            <div class="glass-card p-4 flex justify-between items-center ${s.isOff ? 'opacity-30' : 'slide-in'}">
                <span class="font-bold text-xs uppercase">${d}</span>
                <div class="flex gap-2">
                    <input type="time" class="time-pill py-2 text-[10px]" value="${s.in}" onchange="setShift('${d}','in',this.value)">
                    <input type="time" class="time-pill py-2 text-[10px]" value="${s.out}" onchange="setShift('${d}','out',this.value)">
                </div>
            </div>`;
    }).join('');
}

function setShift(d, k, v) { db.ref(`users/${adminTargetId || currentUser.uid}/shifts/${d}/${k}`).set(v); }
function go(id, btn) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    if(btn) {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }
}
function moveMonth(v) { viewDate.setMonth(viewDate.getMonth() + v); renderCal(); }
function doLogout() { auth.signOut(); }
