// ✅ (ส่วน Config และ Init คงเดิมจาก source 1)
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
let generatedOTP = null; // เก็บ OTP ชั่วคราว
let tempLoginData = null; // เก็บข้อมูลเมลและรหัสชั่วคราว

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

// ✅ แก้ไขใหม่: ฟังก์ชันส่ง OTP ผ่าน EmailJS
async function sendOTPViaEmail() {
    const input = document.getElementById('l-id').value.trim();
    const pw = document.getElementById('l-pw').value.trim();
    if (!input || !pw) return pushLog("กรุณากรอกข้อมูลให้ครบ", "warning");

    let email = input;
    // ถ้าใส่ Username ให้ไปหา Email มาก่อน
    if (!input.includes('@')) {
        const s = await db.ref('usernames/' + input.toLowerCase()).once('value');
        if (s.exists()) email = s.val().email;
        else return pushLog("ไม่พบ Username นี้", "error");
    }

    // สร้าง OTP 6 หลัก และคำนวณเวลาหมดอายุ (15 นาที)
    generatedOTP = Math.floor(100000 + Math.random() * 900000).toString();
    const currentTime = new Date();
    const expireTime = new Date(currentTime.getTime() + 15 * 60000).toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit'
    });

    // เตรียมตัวแปรให้ตรงกับ Template: {{to_email}}, {{passcode}}, {{time}}
    const templateParams = {
        to_email: email,
        passcode: generatedOTP,
        time: expireTime
    };

    pushLog("กำลังส่งรหัส OTP...", "info");

    emailjs.send('service_default', 'template_34sz4uc', templateParams)
        .then(() => {
            pushLog("รหัส OTP ส่งไปที่เมลแล้ว!", "success");
            // สลับโหมด UI
            document.getElementById('input-area').classList.add('hidden');
            document.getElementById('otp-area').classList.remove('hidden');
            tempLoginData = {
                email,
                pw
            };
        })
        .catch(err => {
            console.error(err);
            pushLog("ส่งเมลไม่สำเร็จ", "error");
        });
}

// ✅ แก้ไขใหม่: ฟังก์ชันตรวจสอบ OTP และ Login จริง
function verifyAndLogin() {
    const userOTP = document.getElementById('l-otp').value.trim();
    if (userOTP === generatedOTP) {
        auth.signInWithEmailAndPassword(tempLoginData.email, tempLoginData.pw)
            .then(() => {
                pushLog("ยืนยันตัวตนสำเร็จ!");
            })
            .catch(e => {
                pushLog("รหัสผ่านไม่ถูกต้อง", "error");
                location.reload();
            });
    } else {
        pushLog("รหัส OTP ไม่ถูกต้อง", "error");
    }
}

// --- [ อื่นๆ คงเดิมตาม source 1 ] ---
async function doRegister() {
    const name = document.getElementById('r-name').value.trim();
    const user = document.getElementById('r-user').value.trim().toLowerCase();
    const email = document.getElementById('r-email').value.trim();
    const job = document.getElementById('r-job').value;
    const pw = document.getElementById('r-pw').value;
    if (!name || !user || !email || !pw) return pushLog("กรอกข้อมูลให้ครบ", "warning");
    try {
        const check = await db.ref('usernames/' + user).once('value');
        if (check.exists()) return pushLog("Username นี้มีคนใช้แล้ว", "warning");
        const res = await auth.createUserWithEmailAndPassword(email, pw);
        await db.ref(`users/${res.user.uid}`).set({
            displayName: name,
            username: user,
            email,
            jobType: job,
            role: 'staff',
            salary: 15000,
            billRate: 40
        });
        await db.ref(`usernames/${user}`).set({
            email: email,
            uid: res.user.uid
        });
        pushLog("ลงทะเบียนสำเร็จ");
    } catch (e) {
        pushLog(e.message, "error");
    }
}

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
// ... (ฟังก์ชันอื่นๆ: updateShift, addDelivery, tapIn, tapOut, editCalendarEntry, loadUserList, calculateSalary, formatDiff, renderWeekly, renderCal, go, moveMonth, toggleAuth, confirmAction คงเดิม) ...

function updateShift(day, key, value) {
    const tid = adminTargetId || currentUser.uid;
    db.ref(`users/${tid}/shifts/${day}/${key}`).set(value).then(() => pushLog(`บันทึกตาราง ${day} แล้ว`));
}

async function addDelivery(v) {
    const tid = adminTargetId || currentUser.uid;
    const d = new Date().toISOString().split('T')[0];
    const log = logs.find(l => l.date === d);
    if (log) {
        const newVal = Math.max(0, (log.delivery || 0) + v);
        await db.ref(`attendance/${tid}/${log.id}`).update({
            delivery: newVal
        });
        pushLog(`อัปเดตบิล: ${newVal}`);
    } else pushLog("ยังไม่ได้ตอกบัตรเข้างาน", "warning");
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
    pushLog("ลงเวลาเข้างานสำเร็จ");
}

async function tapOut() {
    const tid = adminTargetId || currentUser.uid;
    const d = new Date().toISOString().split('T')[0],
        t = new Date().toTimeString().slice(0, 5);
    const log = logs.find(l => l.date === d && !l.checkOut);
    if (!log) return pushLog("ไม่พบประวัติเข้างาน", "error");
    await db.ref(`attendance/${tid}/${log.id}`).update({
        checkOut: t
    });
    pushLog("ลงเวลาออกงานสำเร็จ");
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
        showCancelButton: true,
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
        pushLog("แก้ไขข้อมูลสำเร็จ");
    } else if (res === false && log?.id) {
        await db.ref(`attendance/${tid}/${log.id}`).remove();
        pushLog("ลบข้อมูลแล้ว", "info");
    }
}

function enterAdminView(id, name) {
    adminTargetId = id;
    document.getElementById('remote-banner').classList.remove('hidden');
    document.getElementById('remote-name').innerText = name;
    initApp();
    go('p-home');
}

function exitAdminView() {
    adminTargetId = null;
    document.getElementById('remote-banner').classList.add('hidden');
    initApp();
}

function loadUserList() {
    db.ref('users').on('value', s => {
        const users = s.val();
        if (!users) return;
        document.getElementById('user-list').innerHTML = Object.keys(users).map(id => `
            <div onclick="enterAdminView('${id}', '${users[id].displayName}')" class="glass-card p-4 flex justify-between items-center cursor-pointer">
                <div class="flex items-center gap-3">
                    <img src="${users[id].photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" class="w-10 h-10 rounded-full object-cover">
                    <div><p class="font-bold text-sm">${users[id].displayName}</p><p class="text-[8px] opacity-40 uppercase">${users[id].jobType}</p></div>
                </div><i class="fa-solid fa-chevron-right opacity-20"></i></div>`).join('');
    });
}

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
    document.getElementById('salary-detail').innerText = `มาทำงาน ${days} วัน | ส่ง ${bills} บิล`;
}

function handleWorkTimer(log) {
    if (timerInterval) clearInterval(timerInterval);
    const display = document.getElementById('work-timer');
    if (!display) return;
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

function renderWeekly(data) {
    const names = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];
    document.getElementById('week-list').innerHTML = names.map(d => {
        const s = (data.shifts && data.shifts[d]) ? data.shifts[d] : {
            in: '08:30',
            out: '17:30',
            isOff: false
        };
        return `<div class="glass-card p-4 flex justify-between items-center ${s.isOff ? 'opacity-30' : ''}">
                <div class="flex items-center gap-3"><input type="checkbox" ${!s.isOff ? 'checked' : ''} onchange="updateShift('${d}', 'isOff', !this.checked)" class="w-5 h-5 accent-blue-500"><span class="font-bold text-xs">${d}</span></div>
                <div class="flex gap-2"><input type="time" class="time-pill py-2 px-3 text-[10px]" value="${s.in}" onchange="updateShift('${d}', 'in', this.value)"><input type="time" class="time-pill py-2 px-3 text-[10px]" value="${s.out}" onchange="updateShift('${d}', 'out', this.value)"></div></div>`;
    }).join('');
}

function renderCal() {
    const y = viewDate.getFullYear(),
        m = viewDate.getMonth();
    const names = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    document.getElementById('mon-view').innerText = `${names[m]} ${y + 543}`;
    const grid = document.getElementById('cal-grid');
    grid.innerHTML = '';
    const total = new Date(y, m + 1, 0).getDate(),
        start = new Date(y, m, 1).getDay();
    for (let i = 0; i < start; i++) grid.innerHTML += '<div></div>';
    for (let d = 1; d <= total; d++) {
        const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const log = logs.find(l => l.date === dateStr);
        grid.innerHTML += `<div onclick="editCalendarEntry('${dateStr}')" class="day-node ${log ? (log.isOff ? 'st-off' : 'st-normal') : 'bg-white/5 opacity-40'} h-12 flex items-center justify-center rounded-xl text-sm cursor-pointer">${d}</div>`;
    }
}

function doLogout() {
    auth.signOut().then(() => pushLog("ออกจากระบบแล้ว", "info"));
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

function moveMonth(v) {
    viewDate.setMonth(viewDate.getMonth() + v);
    renderCal();
    calculateSalary();
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