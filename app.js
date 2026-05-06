// ✅ CONFIGURATION
const firebaseConfig = {
    apiKey: "AIzaSyA11zPbXEFs-sdIHKaxhkprkoGSGP1whfg",
    authDomain: "ims-fei.firebaseapp.com",
    databaseURL: "https://ims-fei-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "ims-fei",
    storageBucket: "ims-fei.firebasestorage.app",
    appId: "1:791711191329:web:0a4ba03cd5f11eb71bae60"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth(),
    db = firebase.database();

let currentUser = null,
    myInfo = {},
    targetInfo = {},
    logs = [],
    viewDate = new Date(),
    adminTargetId = null;
let timerInterval = null;
let regOTP = null,
    tempRegData = null;

// --- [ UTILS ] ---
function pushLog(m, t = "success") {
    Swal.fire({
        title: m,
        icon: t,
        background: '#1c1c1e',
        color: '#fff',
        timer: 1500,
        showConfirmButton: false,
        toast: true,
        position: 'top'
    });
}

// --- [ AUTH SYSTEM ] ---
auth.onAuthStateChanged(user => {
    currentUser = user;
    if (user) {
        db.ref(`users/${user.uid}`).on('value', s => {
            myInfo = s.val() || {};
            document.getElementById('nav-admin').classList.toggle('hidden', myInfo.role !== 'admin');
            if (!adminTargetId) initApp();
        });
        document.getElementById('auth-ui').classList.add('hidden');
        document.getElementById('app-ui').classList.remove('hidden');
    } else {
        document.getElementById('auth-ui').classList.remove('hidden');
        document.getElementById('app-ui').classList.add('hidden');
    }
});

// LOGIN (เหมือนเดิม)
async function doLogin() {
    const input = document.getElementById('l-id').value.trim();
    const pw = document.getElementById('l-pw').value.trim();
    if (!input || !pw) return pushLog("กรุณากรอกข้อมูล", "warning");

    if (input.includes('@')) {
        auth.signInWithEmailAndPassword(input, pw).catch(e => pushLog("รหัสผ่านไม่ถูกต้อง", "error"));
    } else {
        db.ref('usernames/' + input.toLowerCase()).once('value', s => {
            const data = s.val();
            if (data) auth.signInWithEmailAndPassword(data.email, pw).catch(e => pushLog("รหัสไม่ถูกต้อง", "error"));
            else pushLog("ไม่พบ Username นี้", "error");
        });
    }
}

// REGISTER STEP 1 (ส่ง OTP)[cite: 1, 2]
async function sendRegistrationOTP() {
    const name = document.getElementById('r-name').value.trim();
    const user = document.getElementById('r-user').value.trim().toLowerCase();
    const email = document.getElementById('r-email').value.trim();
    const job = document.getElementById('r-job').value;
    const pw = document.getElementById('r-pw').value;

    if (!name || !user || !email || !pw) return pushLog("กรอกข้อมูลให้ครบ", "warning");

    try {
        const check = await db.ref('usernames/' + user).once('value');
        if (check.exists()) return pushLog("Username นี้มีคนใช้แล้ว", "warning");

        regOTP = Math.floor(100000 + Math.random() * 900000).toString();
        pushLog("กำลังส่งเมล...", "info");

        await emailjs.send('IMS-work', 'template_34sz4uc', {
            to_email: email,
            passcode: regOTP,
            time: new Date().toLocaleTimeString('th-TH')
        });

        tempRegData = {
            name,
            user,
            email,
            job,
            pw
        };
        document.getElementById('reg-input-area').classList.add('hidden');
        document.getElementById('reg-otp-area').classList.remove('hidden');
        pushLog("ส่งรหัสยืนยันสำเร็จ", "success");
    } catch (e) {
        pushLog("ส่งเมลไม่สำเร็จ", "error");
    }
}

// REGISTER STEP 2 (ยืนยัน OTP)[cite: 1]
async function verifyAndRegister() {
    const inputOTP = document.getElementById('r-otp').value.trim();
    if (inputOTP !== regOTP) return pushLog("รหัส OTP ไม่ถูกต้อง", "error");

    try {
        const res = await auth.createUserWithEmailAndPassword(tempRegData.email, tempRegData.pw);
        await db.ref(`users/${res.user.uid}`).set({
            displayName: tempRegData.name,
            username: tempRegData.user,
            email: tempRegData.email,
            jobType: tempRegData.job,
            role: 'staff',
            salary: 15000,
            billRate: 40,
            photoURL: ''
        });
        await db.ref(`usernames/${tempRegData.user}`).set({
            email: tempRegData.email,
            uid: res.user.uid
        });
        pushLog("ลงทะเบียนสำเร็จ");
    } catch (e) {
        pushLog(e.message, "error");
    }
}

// --- [ CORE APP LOGIC ] ---
function initApp() {
    const tid = adminTargetId || (currentUser ? currentUser.uid : null);
    if (!tid) return;

    db.ref(`users/${tid}`).on('value', s => {
        targetInfo = s.val() || {};
        document.getElementById('u-display').innerText = targetInfo.displayName || 'User';
        document.getElementById('u-photo').src = targetInfo.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
        document.getElementById('rider-card').classList.toggle('hidden', targetInfo.jobType !== 'delivery');
        renderWeekly(targetInfo);
        calculateSalary();
    });

    db.ref(`attendance/${tid}`).on('value', s => {
        const d = s.val();
        logs = d ? Object.keys(d).map(k => ({
            id: k,
            ...d[k]
        })) : [];
        const today = new Date().toISOString().split('T')[0];
        const todayLog = logs.find(l => l.date === today);
        if (document.getElementById('today-bills')) document.getElementById('today-bills').innerText = todayLog ? (todayLog.delivery || 0) : 0;
        handleWorkTimer(todayLog);
        renderCal();
        calculateSalary();
    });
}

async function tapIn() {
    const tid = adminTargetId || currentUser.uid;
    const d = new Date().toISOString().split('T')[0],
        t = new Date().toTimeString().slice(0, 5);
    if (logs.find(l => l.date === d)) return pushLog("ตอกเข้าแล้ว", "warning");
    await db.ref(`attendance/${tid}`).push({
        date: d,
        checkIn: t,
        checkOut: '',
        isOff: false,
        delivery: 0
    });
    pushLog("ลงเวลาสำเร็จ");
}

async function tapOut() {
    const tid = adminTargetId || currentUser.uid;
    const d = new Date().toISOString().split('T')[0],
        t = new Date().toTimeString().slice(0, 5);
    const log = logs.find(l => l.date === d && !l.checkOut);
    if (!log) return pushLog("ยังไม่ได้ตอกเข้า", "error");
    await db.ref(`attendance/${tid}/${log.id}`).update({
        checkOut: t
    });
    pushLog("ออกงานสำเร็จ");
}

async function addDelivery(v) {
    const tid = adminTargetId || currentUser.uid;
    const d = new Date().toISOString().split('T')[0];
    const log = logs.find(l => l.date === d);
    if (!log) return pushLog("ต้องตอกเข้างานก่อน", "warning");
    const newVal = Math.max(0, (log.delivery || 0) + v);
    await db.ref(`attendance/${tid}/${log.id}`).update({
        delivery: newVal
    });
}

// --- [ ADMIN FEATURES ] ---[cite: 1]
async function loadUserList() {
    const s = await db.ref('users').once('value');
    const users = s.val(),
        list = document.getElementById('user-list');
    list.innerHTML = '';
    for (let id in users) {
        if (id === currentUser.uid) continue;
        const u = users[id];
        const div = document.createElement('div');
        div.className = "glass-card p-4 flex justify-between items-center";
        div.innerHTML = `
            <div onclick="viewUserAsAdmin('${id}')" class="flex items-center gap-3 cursor-pointer">
                <img src="${u.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" class="w-10 h-10 rounded-full border border-white/10">
                <div><p class="font-bold text-sm">${u.displayName}</p><p class="text-[9px] opacity-40 italic">${u.username}</p></div>
            </div>
            <button onclick="editUserRole('${id}')" class="p-2 opacity-30"><i class="fa-solid fa-ellipsis-vertical"></i></button>`;
        list.appendChild(div);
    }
}

function viewUserAsAdmin(id) {
    adminTargetId = id;
    db.ref(`users/${id}`).once('value', s => {
        document.getElementById('remote-name').innerText = s.val().displayName;
        document.getElementById('remote-banner').classList.remove('hidden');
        go('p-home');
        initApp();
    });
}

function exitAdminView() {
    adminTargetId = null;
    document.getElementById('remote-banner').classList.add('hidden');
    initApp();
}

async function editUserRole(id) {
    const {
        value: role
    } = await Swal.fire({
        title: 'จัดการผู้ใช้',
        background: '#1c1c1e',
        color: '#fff',
        input: 'select',
        inputOptions: {
            'staff': 'Staff',
            'admin': 'Admin',
            'ban': 'Banned'
        }
    });
    if (role) {
        await db.ref(`users/${id}`).update({
            role
        });
        loadUserList();
    }
}

// --- [ RENDER & CALCULATION ] ---
function calculateSalary() {
    const u = targetInfo;
    const base = (u.salary || 0) / 30,
        bRate = u.billRate || 40;
    const m = viewDate.getMonth(),
        y = viewDate.getFullYear();
    let days = 0,
        bills = 0;
    logs.forEach(l => {
        const ld = new Date(l.date);
        if (ld.getMonth() === m && ld.getFullYear() === y) {
            if (!l.isOff && l.checkIn) days++;
            bills += (l.delivery || 0);
        }
    });
    const total = (days * base) + (bills * bRate);
    document.getElementById('salary-view').innerText = total.toLocaleString(undefined, {
        minimumFractionDigits: 2
    });
    document.getElementById('salary-detail').innerText = `มางาน ${days} วัน | ส่ง ${bills} บิล`;
}

function renderWeekly(data) {
    const names = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];
    document.getElementById('week-list').innerHTML = names.map(d => {
        const s = (data.shifts && data.shifts[d]) ? data.shifts[d] : {
            in: '08:30',
            out: '17:30',
            isOff: false
        };
        return `<div class="glass-card p-4 flex justify-between items-center ${s.isOff ? 'opacity-30' : ''}">
                <span class="font-bold text-xs">${d}</span>
                <div class="flex gap-2"><input type="time" class="time-pill py-2 px-3 text-[10px]" value="${s.in}" onchange="updateShift('${d}', 'in', this.value)"><input type="time" class="time-pill py-2 px-3 text-[10px]" value="${s.out}" onchange="updateShift('${d}', 'out', this.value)"></div></div>`;
    }).join('');
}

function updateShift(day, key, value) {
    const tid = adminTargetId || currentUser.uid;
    db.ref(`users/${tid}/shifts/${day}/${key}`).set(value);
}

function renderCal() {
    const y = viewDate.getFullYear(),
        m = viewDate.getMonth();
    const names = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    document.getElementById('mon-view').innerText = `${names[m]} ${y + 543}`;
    const grid = document.getElementById('cal-days');
    grid.innerHTML = '';
    const total = new Date(y, m + 1, 0).getDate(),
        start = new Date(y, m, 1).getDay();
    for (let i = 0; i < start; i++) grid.innerHTML += '<div></div>';
    for (let d = 1; d <= total; d++) {
        const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const log = logs.find(l => l.date === dateStr);
        grid.innerHTML += `<div onclick="editCalendarEntry('${dateStr}')" class="day-node ${log ? (log.isOff ? 'st-off' : 'st-normal') : 'bg-white/5'} h-12 flex items-center justify-center rounded-xl text-sm cursor-pointer">${d}</div>`;
    }
}

async function editCalendarEntry(dateStr) {
    const tid = adminTargetId || currentUser.uid;
    const log = logs.find(l => l.date === dateStr);
    const {
        value: res
    } = await Swal.fire({
        title: dateStr,
        background: '#1c1c1e',
        color: '#fff',
        html: `<input id="sw-in" type="time" class="time-pill w-full mb-2" value="${log?.checkIn || '08:30'}">
               <input id="sw-out" type="time" class="time-pill w-full mb-2" value="${log?.checkOut || '17:30'}">
               <input id="sw-bill" type="number" class="time-pill w-full" value="${log?.delivery || 0}">`,
        showDenyButton: true,
        confirmButtonText: 'เซฟ',
        denyButtonText: 'ลบ'
    });
    if (res) {
        const data = {
            date: dateStr,
            checkIn: document.getElementById('sw-in').value,
            checkOut: document.getElementById('sw-out').value,
            delivery: parseInt(document.getElementById('sw-bill').value) || 0,
            isOff: false
        };
        if (log?.id) await db.ref(`attendance/${tid}/${log.id}`).update(data);
        else await db.ref(`attendance/${tid}`).push(data);
    } else if (res === false && log?.id) {
        await db.ref(`attendance/${tid}/${log.id}`).remove();
    }
}

function handleWorkTimer(log) {
    if (timerInterval) clearInterval(timerInterval);
    const display = document.getElementById('work-timer');
    if (log && log.checkIn && !log.checkOut) {
        timerInterval = setInterval(() => {
            const diff = new Date() - new Date(`${log.date}T${log.checkIn}:00`);
            display.innerText = formatDiff(diff);
        }, 1000);
    } else display.innerText = log?.checkOut ? formatDiff(new Date(`${log.date}T${log.checkOut}:00`) - new Date(`${log.date}T${log.checkIn}:00`)) : "00:00:00";
}

function formatDiff(ms) {
    let s = Math.floor(Math.max(0, ms) / 1000);
    return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function go(id, btn) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    if (btn) {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }
    if (id === 'p-admin') loadUserList();
}

function toggleAuth(mode) {
    document.getElementById('login-form').classList.toggle('hidden', mode === 'reg');
    document.getElementById('reg-form').classList.toggle('hidden', mode === 'login');
}

function confirmAction(title, callback) {
    Swal.fire({
        title,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'ตกลง',
        background: '#1c1c1e',
        color: '#fff'
    }).then(r => {
        if (r.isConfirmed) callback();
    });
}

function moveMonth(v) {
    viewDate.setMonth(viewDate.getMonth() + v);
    renderCal();
    calculateSalary();
}

function doLogout() {
    auth.signOut();
}