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
emailjs.init("WSvF2N1nopC2xfuZo");

let currentUser = null,
    myInfo = {},
    targetInfo = {},
    logs = [],
    viewDate = new Date(),
    adminTargetId = null;
let timerInterval = null,
    regOTP = null;

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

// --- [ NEW: IMAGE PREVIEW SYSTEM ] ---
function previewProfileImage(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = e => {
            document.getElementById('edit-photo-preview').src = e.target.result;
            document.getElementById('edit-photo').value = e.target.result;
        };
        reader.readAsDataURL(input.files[0]);
    }
}

// --- [ APP INITIALIZE ] ---
// --- [ APP INITIALIZE ] ---
function initApp() {
    const tid = adminTargetId || (currentUser ? currentUser.uid : null);
    if (!tid) return;

    db.ref(`users/${tid}`).on('value', s => {
        targetInfo = s.val() || {};
        document.getElementById('u-display').innerText = targetInfo.displayName || 'User';
        document.getElementById('u-photo').src = targetInfo.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
        document.getElementById('rider-card').classList.toggle('hidden', targetInfo.jobType !== 'delivery');

        // ❌ ลบหรือ Comment บรรทัดนี้ออก: renderWeekly(targetInfo);
        calculateSalary();
    });

    db.ref(`attendance/${tid}`).on('value', s => {
        const d = s.val();
        logs = d ? Object.keys(d).map(k => ({
            id: k,
            ...d[k]
        })) : [];

        const today = new Date().toISOString().split('T')[0],
            tLog = logs.find(l => l.date === today);

        if (document.getElementById('today-bills')) {
            document.getElementById('today-bills').innerText = tLog ? (tLog.delivery || 0) : 0;
        }

        handleWorkTimer(tLog);
        renderCal(); // หน้าเดือนอัปเดตตรงนี้ เลยแสดงผลได้ถูกต้อง

        // ✅ เพิ่มบรรทัดนี้: เพื่อให้หน้า Schedule อัปเดตหลังจากได้ค่า logs มาแล้ว
        renderWeekly(targetInfo);

        calculateSalary();
    });
}

// --- [ WEEKLY RENDER (14 DAYS & ADVANCE PLANNING) ] ---
function renderWeekly(u) {
    const list = document.getElementById('week-list');
    list.innerHTML = '';
    const names = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

    // ใช้เวลาปัจจุบัน และตั้งค่าให้เป็นเวลา 00:00:00 เพื่อป้องกันเรื่อง Timezone เหลื่อม
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 14; i++) {
        // คำนวณวันที่โดยเริ่มจาก "วันอาทิตย์ของสัปดาห์ปัจจุบัน"
        const d = new Date(today);
        d.setDate(today.getDate() - today.getDay() + i);

        // สร้าง String วันที่ให้ตรงกับ Firebase เป๊ะๆ (YYYY-MM-DD)[cite: 1]
        const Y = d.getFullYear();
        const M = String(d.getMonth() + 1).padStart(2, '0');
        const D = String(d.getDate()).padStart(2, '0');
        const ds = `${Y}-${M}-${D}`; // จะได้ "2026-05-07"[cite: 1]

        // ค้นหาข้อมูลจากตัวแปร logs ชุดเดียวกับหน้าเดือน[cite: 1]
        const log = logs.find(l => l.date === ds);
        const isOff = log && (log.isOff === true || log.isOff === "true");

        if (i === 7) {
            list.innerHTML += `<div class="pt-6 pb-2 border-b border-white/10 mb-2 px-2">
                <p class="text-[10px] font-bold text-blue-500 uppercase italic opacity-60">Next Week</p>
            </div>`;
        }

        // --- กำหนดสีแดงจางๆ สำหรับวันหยุด ---
        const isToday = d.toDateString() === today.toDateString();

        // ถ้าเป็นวันหยุด (isOff) ให้ใช้สีแดงจาง
        const bgClass = isOff ?
            "bg-red-500/10 border-red-500/20 opacity-60" :
            (isToday ? "bg-blue-500/10 border-blue-500/40" : "bg-white/5 border-transparent");

        const iconColor = isOff ? "bg-red-500/20 text-red-400" : "bg-blue-500/20 text-blue-500";
        const timeText = isOff ? "วันหยุด (OFF)" : (log?.checkIn ? `${log.checkIn} - ${log.checkOut}` : "--:-- --:--");

        list.innerHTML += `
            <div onclick="openEditLog('${ds}')" 
                 class="glass-card p-4 flex justify-between items-center cursor-pointer active:scale-[0.98] transition-all border mb-1 ${bgClass}">
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-xl flex items-center justify-center ${iconColor}">
                        <i class="fa-solid ${isOff ? 'fa-couch' : 'fa-clock'}"></i>
                    </div>
                    <div>
                        <p class="text-[9px] font-bold opacity-40 uppercase">${names[d.getDay()]}</p>
                        <p class="text-sm font-bold ${isOff ? 'text-red-200' : ''}">${d.getDate()} ${d.toLocaleDateString('th-TH', { month: 'short' })}</p>
                    </div>
                </div>
                <div class="text-right">
                    <p class="text-xs font-bold ${isOff ? 'text-red-400' : 'text-blue-400'}">${timeText}</p>
                    <p class="text-[9px] font-bold uppercase opacity-40">${isOff ? 'OFF DAY' : (log?.delivery > 0 ? `BILLS: ${log.delivery}` : 'READY')}</p>
                </div>
            </div>`;
    }
}

// --- [ ADMIN: USER LIST (FIXED) ] ---
function loadUserList() {
    if (myInfo.role !== 'admin') return;
    db.ref('users').once('value', s => {
        const users = s.val();
        const container = document.getElementById('user-list');
        container.innerHTML = '';
        Object.keys(users).forEach(uid => {
            const u = users[uid];
            container.innerHTML += `
                <div onclick="viewUser('${uid}')" class="glass-card p-4 flex items-center gap-4 cursor-pointer active:scale-95 transition-transform">
                    <img src="${u.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" class="w-12 h-12 rounded-2xl object-cover border border-white/10">
                    <div class="flex-1">
                        <p class="font-bold text-sm">${u.displayName || u.username}</p>
                        <p class="text-[10px] opacity-40 uppercase">${u.jobType || 'staff'} | ${u.role || 'user'}</p>
                    </div>
                    <i class="fa-solid fa-chevron-right opacity-20 text-xs"></i>
                </div>`;
        });
    });
}

function viewUser(uid) {
    adminTargetId = uid;
    db.ref(`users/${uid}`).once('value', s => {
        const u = s.val();
        document.getElementById('remote-name').innerText = u.displayName || u.username;
        document.getElementById('remote-banner').classList.remove('hidden');
        go('p-home', document.querySelector('.nav-btn'));
        initApp();
    });
}

function exitAdminView() {
    adminTargetId = null;
    document.getElementById('remote-banner').classList.add('hidden');
    initApp();
}

// --- [ ATTENDANCE ACTIONS ] ---
async function tapIn() {
    const tid = adminTargetId || currentUser.uid,
        d = new Date().toISOString().split('T')[0],
        t = new Date().toTimeString().slice(0, 5);
    if (logs.find(l => l.date === d)) return pushLog("วันนี้เข้างานไปแล้ว", "warning");
    await db.ref(`attendance/${tid}`).push({
        date: d,
        checkIn: t,
        checkOut: '',
        isOff: false,
        delivery: 0
    });
}

async function tapOut() {
    const tid = adminTargetId || currentUser.uid;
    const todayStr = new Date().toISOString().split('T')[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const timeNow = new Date().toTimeString().slice(0, 5);

    // 1. หา Log ของวันนี้ก่อน (กรณีทำกะปกติ)
    let log = logs.find(l => l.date === todayStr && !l.checkOut);
    let targetDate = todayStr;

    // 2. ถ้าไม่เจอ ให้หาของเมื่อวาน (กรณีเข้าเวรดึกข้ามคืนมา)
    if (!log) {
        log = logs.find(l => l.date === yesterdayStr && !l.checkOut);
        targetDate = yesterdayStr;
    }

    if (!log) return pushLog("ไม่พบรายการที่ตอกบัตรเข้าไว้", "error");

    await db.ref(`attendance/${tid}/${log.id}`).update({
        checkOut: timeNow
    });
    pushLog(`ตอกบัตรออกแล้ว (${targetDate})`);
}
async function addDelivery(v) {
    const tid = adminTargetId || currentUser.uid,
        d = new Date().toISOString().split('T')[0],
        log = logs.find(l => l.date === d);
    if (!log) return pushLog("ต้องตอกบัตรเข้าก่อน", "warning");
    await db.ref(`attendance/${tid}/${log.id}`).update({
        delivery: Math.max(0, (log.delivery || 0) + v)
    });
}

// --- [ CALENDAR & LOG DELETION ] ---
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
        const ds = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
            log = logs.find(l => l.date === ds);

        // ตรวจสอบว่าเป็นวันหยุดหรือไม่[cite: 1]
        const isOff = log && (log.isOff === true || log.isOff === 'true');

        // เลือกคลาส: ถ้าหยุดใช้ st-off (แดงจาง), ถ้าทำงานใช้ st-normal (น้ำเงิน), ถ้าไม่มีข้อมูลใช้ bg-white/5
        const statusClass = log ? (isOff ? 'st-off' : 'st-normal') : 'bg-white/5';

        grid.innerHTML += `
        <div onclick="openEditLog('${ds}')" 
             class="h-12 flex flex-col items-center justify-center rounded-xl text-sm cursor-pointer transition-all active:scale-90 ${statusClass}">
            <span class="font-bold">${d}</span>
            ${log?.delivery > 0 ? `<span class="text-[8px]">${log.delivery}</span>` : ''}
        </div>`;
    }
}

// --- [ UPGRADED EDIT LOG MODAL ] ---
async function openEditLog(dateStr) {
    const log = logs.find(l => l.date === dateStr) || {
        date: dateStr,
        checkIn: '',
        checkOut: '',
        delivery: 0,
        isOff: false
    };

    const {
        value: result,
        isDenied
    } = await Swal.fire({
        title: `<span class="text-blue-400">วันที่ ${dateStr}</span>`,
        background: '#121212', // ปรับพื้นหลังให้มืดสนิท
        color: '#fff',
        html: `
        <div class="text-left space-y-4 p-2 overflow-hidden">
            <div>
                <label class="text-[10px] uppercase font-bold opacity-40 ml-1">สถานะการทำงาน</label>
                <select id="swal-off" class="w-full mt-1 p-4 rounded-2xl bg-white/5 border border-white/10 text-white outline-none focus:border-blue-500 transition-all">
                    <option value="false" class="bg-zinc-900" ${!log.isOff ? 'selected' : ''}>🟢 ทำงานปกติ</option>
                    <option value="true" class="bg-zinc-900" ${log.isOff ? 'selected' : ''}>🔴 หยุดงาน (OFF)</option>
                </select>
            </div>
            
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="text-[10px] uppercase font-bold opacity-40 ml-1">เวลาเข้า</label>
                    <input id="swal-in" type="time" class="w-full mt-1 p-4 rounded-2xl bg-white/5 border border-white/10 text-white outline-none focus:border-blue-500 transition-all" value="${log.checkIn || ''}">
                </div>
                <div>
                    <label class="text-[10px] uppercase font-bold opacity-40 ml-1">เวลาออก</label>
                    <input id="swal-out" type="time" class="w-full mt-1 p-4 rounded-2xl bg-white/5 border border-white/10 text-white outline-none focus:border-blue-500 transition-all" value="${log.checkOut || ''}">
                </div>
            </div>

            <div>
                <label class="text-[10px] uppercase font-bold opacity-40 ml-1">จำนวนบิล (Delivery)</label>
                <input id="swal-bill" type="number" placeholder="0" class="w-full mt-1 p-4 rounded-2xl bg-white/5 border border-white/10 text-white outline-none focus:border-blue-500 transition-all" value="${log.delivery || 0}">
            </div>
        </div>`,
        showCancelButton: true,
        showDenyButton: log.id ? true : false,
        confirmButtonText: 'บันทึกข้อมูล',
        denyButtonText: 'ลบข้อมูลนี้',
        cancelButtonText: 'ยกเลิก',
        buttonsStyling: false, // ปิดสไตล์เดิมของ Swal เพื่อใช้คลาสเราเอง
        customClass: {
            confirmButton: 'btn-primary px-8 py-4 m-2 w-full sm:w-auto text-sm',
            denyButton: 'bg-red-500/20 text-red-500 px-8 py-4 m-2 rounded-2xl w-full sm:w-auto text-sm font-bold',
            cancelButton: 'bg-white/5 text-white/50 px-8 py-4 m-2 rounded-2xl w-full sm:w-auto text-sm'
        },
        preConfirm: () => ({
            isOff: document.getElementById('swal-off').value === 'true',
            checkIn: document.getElementById('swal-in').value,
            checkOut: document.getElementById('swal-out').value,
            delivery: parseInt(document.getElementById('swal-bill').value) || 0
        })
    });

    const tid = adminTargetId || currentUser.uid;
    if (isDenied) {
        confirmAction('ต้องการลบข้อมูลวันนี้ใช่ไหม?', async () => {
            await db.ref(`attendance/${tid}/${log.id}`).remove();
            pushLog("ลบข้อมูลแล้ว", "info");
        });
    } else if (result) {
        if (log.id) await db.ref(`attendance/${tid}/${log.id}`).update(result);
        else await db.ref(`attendance/${tid}`).push({
            ...result,
            date: dateStr
        });
        pushLog("บันทึกสำเร็จ");
    }
}

// --- [ PROFILE SYSTEM ] ---
async function saveProfile() {
    const tid = adminTargetId || currentUser.uid;
    const updateData = {
        displayName: document.getElementById('edit-name').value.trim(),
        photoURL: document.getElementById('edit-photo').value.trim()
    };
    const newPw = document.getElementById('edit-pw').value.trim();
    if (newPw) {
        if (newPw.length < 6) return pushLog("รหัสผ่านสั้นเกินไป", "warning");
        if (tid === currentUser.uid) await currentUser.updatePassword(newPw);
        else updateData.tempPassword = newPw;
    }
    if (myInfo.role === 'admin') {
        updateData.salary = parseInt(document.getElementById('edit-salary').value) || 0;
        updateData.billRate = parseInt(document.getElementById('edit-bill-rate').value) || 0;
        updateData.jobType = document.getElementById('edit-job').value;
        updateData.role = document.getElementById('edit-role').value;
    }
    await db.ref(`users/${tid}`).update(updateData);
    pushLog("บันทึกเรียบร้อย");
    closeProfileModal();
}

function openProfileModal() {
    const tid = adminTargetId || currentUser.uid;
    db.ref(`users/${tid}`).once('value', s => {
        const u = s.val() || {};
        document.getElementById('edit-user').value = u.username || '';
        document.getElementById('edit-email').value = u.email || '';
        document.getElementById('edit-name').value = u.displayName || '';
        document.getElementById('edit-photo').value = u.photoURL || '';
        document.getElementById('edit-photo-preview').src = u.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
        document.getElementById('admin-only-settings').classList.toggle('hidden', myInfo.role !== 'admin');
        if (myInfo.role === 'admin') {
            document.getElementById('edit-salary').value = u.salary || 0;
            document.getElementById('edit-bill-rate').value = u.billRate || 0;
            document.getElementById('edit-job').value = u.jobType || 'staff';
            document.getElementById('edit-role').value = u.role || 'staff';
        }
        document.getElementById('modal-profile').classList.remove('hidden');
    });
}

// --- [ UTILS & OTHERS ] ---
function calculateSalary() {
    const u = targetInfo,
        base = (u.salary || 0) / 30,
        bRate = u.billRate || 40,
        m = viewDate.getMonth(),
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
    document.getElementById('salary-view').innerText = ((days * base) + (bills * bRate)).toLocaleString(undefined, {
        minimumFractionDigits: 2
    });
    document.getElementById('salary-detail').innerText = `ทำงาน ${days} วัน | บิล ${bills} รายการ`;
}

function handleWorkTimer(log) {
    if (timerInterval) clearInterval(timerInterval);
    const display = document.getElementById('work-timer');

    if (log && log.checkIn && !log.checkOut) {
        timerInterval = setInterval(() => {
            // ใช้ Date Object เต็มรูปแบบในการคำนวณแทนการลบกันแค่ตัวเลขเวลา
            const start = new Date(`${log.date}T${log.checkIn}:00`);
            const now = new Date();
            const diff = now - start;
            display.innerText = formatDiff(diff);
        }, 1000);
    } else if (log?.checkIn && log?.checkOut) {
        const start = new Date(`${log.date}T${log.checkIn}:00`);
        let end = new Date(`${log.date}T${log.checkOut}:00`);

        // ✨ จุดสำคัญ: ถ้าเวลาออก "น้อยกว่า" เวลาเข้า แสดงว่าบวกไปอีก 1 วัน
        if (end < start) {
            end.setDate(end.getDate() + 1);
        }
        display.innerText = formatDiff(end - start);
    } else {
        display.innerText = "00:00:00";
    }
}

function formatDiff(ms) {
    let s = Math.floor(Math.max(0, ms) / 1000);
    return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

async function doLogin() {
    const input = document.getElementById('l-id').value.trim(),
        pw = document.getElementById('l-pw').value.trim();
    if (!input || !pw) return pushLog("ระบุข้อมูลให้ครบ", "warning");
    try {
        if (input.includes('@')) await auth.signInWithEmailAndPassword(input, pw);
        else {
            const s = await db.ref('usernames/' + input.toLowerCase()).once('value');
            if (s.exists()) await auth.signInWithEmailAndPassword(s.val().email, pw);
            else throw new Error("ไม่พบ Username");
        }
    } catch (e) {
        pushLog("ข้อมูลไม่ถูกต้อง", "error");
    }
}

// แก้ไขฟังก์ชัน go ใน app.js
function go(id, btn) {
    const pages = document.querySelectorAll('.page');
    const targetPage = document.getElementById(id);

    // ทำความสะอาดคลาส active เดิม
    pages.forEach(p => {
        p.classList.remove('active');
        p.style.opacity = '0';
    });

    // แสดงหน้าใหม่พร้อมอนิเมชัน
    targetPage.classList.add('active');
    setTimeout(() => {
        targetPage.style.opacity = '1';
    }, 10);

    if (btn) {
        document.querySelectorAll('.nav-btn').forEach(b => {
            b.classList.remove('active');
        });
        btn.classList.add('active');

        // เพิ่มสั่นสั้นๆ (Haptic Feedback) สำหรับมือถือที่รองรับ
        if (window.navigator.vibrate) window.navigator.vibrate(10);
    }

    if (id === 'p-admin') loadUserList();
}

function moveMonth(v) {
    viewDate.setMonth(viewDate.getMonth() + v);
    renderCal();
    calculateSalary();
}

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

function confirmAction(t, cb) {
    Swal.fire({
        title: t,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'ตกลง',
        background: '#1c1c1e',
        color: '#fff'
    }).then(r => {
        if (r.isConfirmed) cb();
    });
}

function closeProfileModal() {
    document.getElementById('modal-profile').classList.add('hidden');
}

function doLogout() {
    auth.signOut();
}

function toggleAuth(mode) {
    document.getElementById('login-form').classList.toggle('hidden', mode === 'reg');
    document.getElementById('reg-form').classList.toggle('hidden', mode === 'login');
}