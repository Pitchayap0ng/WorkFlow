// ✅ 1. Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyA11zPbXEFs-sdIHKaxhkprkoGSGP1whfg",
    authDomain: "ims-fei.firebaseapp.com",
    databaseURL: "https://ims-fei-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "ims-fei",
    storageBucket: "ims-fei.firebasestorage.app",
    appId: "1:791711191329:web:0a4ba03cd5f11eb71bae60"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth(), db = firebase.database();

// ✅ 2. EmailJS Init
(function () {
    emailjs.init("WSvF2N1nopC2xfuZo");
})();

let currentUser = null, myInfo = {}, targetInfo = {}, logs = [], viewDate = new Date(), adminTargetId = null;
let generatedOTP = null;

const HOLIDAYS = { "01-01": "ปีใหม่", "04-13": "สงกรานต์", "04-14": "สงกรานต์", "04-15": "สงกรานต์", "05-01": "แรงงาน", "07-28": "วันเฉลิมฯ", "08-12": "วันแม่", "10-13": "วัน ร.9", "12-05": "วันพ่อ", "12-31": "สิ้นปี" };

// --- [ AUTH SYSTEM ] ---
auth.onAuthStateChanged(user => {
    currentUser = user;
    if (user) {
        db.ref(`users/${user.uid}`).on('value', s => {
            myInfo = s.val() || {};
            const navAdmin = document.getElementById('nav-admin');
            if (navAdmin) navAdmin.classList.toggle('hidden', myInfo.role !== 'admin');
            if (!adminTargetId) initApp();
        });
        document.getElementById('auth-ui').classList.add('hidden');
        document.getElementById('app-ui').classList.remove('hidden');
    } else {
        document.getElementById('auth-ui').classList.remove('hidden');
        document.getElementById('app-ui').classList.add('hidden');
    }
});

async function doLogin() {
    let id = document.getElementById('l-id').value.toLowerCase().trim();
    const pw = document.getElementById('l-pw').value;
    if (!id || !pw) return pushLog("กรุณากรอกข้อมูลให้ครบ", "warning");

    if (!id.includes('@')) {
        const s = await db.ref('usernames/' + id).once('value');
        if (s.exists()) id = s.val().email;
        else return pushLog("ไม่พบชื่อผู้ใช้นี้", "error");
    }
    auth.signInWithEmailAndPassword(id, pw).catch(e => pushLog("รหัสผ่านไม่ถูกต้อง", "error"));
}

async function sendOTP() {
    const email = document.getElementById('r-email').value.trim();
    const name = document.getElementById('r-name').value.trim();
    const user = document.getElementById('r-user').value.toLowerCase().trim();
    if (!email || !name || !user) return pushLog("กรุณากรอกข้อมูลให้ครบ", "warning");
    const checkUser = await db.ref(`usernames/${user}`).once('value');
    if (checkUser.exists()) return pushLog("Username นี้ถูกใช้งานแล้ว", "error");
    generatedOTP = Math.floor(100000 + Math.random() * 900000).toString();
    pushLog("กำลังส่ง OTP...", "info");
    const templateParams = { to_name: name, to_email: email, passcode: generatedOTP, time: "15" };
    emailjs.send('IMS-work', 'template_34sz4uc', templateParams)
        .then(() => {
            pushLog("ส่ง OTP สำเร็จ!");
            document.getElementById('otp-section').classList.remove('hidden');
            document.getElementById('btn-send-otp').classList.add('hidden');
        }).catch(err => pushLog("ส่งไม่สำเร็จ", "error"));
}

async function doRegister() {
    const inputOTP = document.getElementById('r-otp').value.trim();
    if (inputOTP !== generatedOTP) return pushLog("รหัส OTP ไม่ถูกต้อง", "error");
    const name = document.getElementById('r-name').value.trim();
    const user = document.getElementById('r-user').value.toLowerCase().trim();
    const email = document.getElementById('r-email').value.trim();
    const phone = document.getElementById('r-phone').value.trim();
    const job = document.getElementById('r-job').value;
    const pw = document.getElementById('r-pw').value;
    if (pw.length < 6) return pushLog("รหัสผ่านต้อง 6 ตัวขึ้นไป", "warning");
    auth.createUserWithEmailAndPassword(email, pw).then(async r => {
        const userData = {
            displayName: name, username: user, email: email, phone: phone,
            jobType: job, role: 'user', salary: 15000, billRate: 40,
            photoURL: 'https://cdn-icons-png.flaticon.com/512/149/149071.png'
        };
        await db.ref(`users/${r.user.uid}`).set(userData);
        await db.ref(`usernames/${user}`).set({ email: email, uid: r.user.uid });
        pushLog("สมัครสมาชิกสำเร็จ!");
        generatedOTP = null;
    }).catch(e => pushLog(e.message, "error"));
}

async function forgotPw() {
    const { value: email } = await Swal.fire({
        title: 'ลืมรหัสผ่าน?',
        input: 'email',
        inputLabel: 'กรุณากรอกอีเมลที่ใช้สมัคร',
        inputPlaceholder: 'email@example.com',
        background: '#1c1c1e', color: '#fff',
        confirmButtonText: 'ส่งลิงก์รีเซ็ต',
        showCancelButton: true
    });
    if (email) {
        auth.sendPasswordResetEmail(email)
            .then(() => pushLog("ส่งลิงก์ไปที่อีเมลแล้ว!"))
            .catch(e => pushLog("ไม่พบอีเมลนี้ในระบบ", "error"));
    }
}

// --- [ MAIN APP LOGIC ] ---
function initApp() {
    const tid = adminTargetId || currentUser.uid;
    db.ref(`users/${tid}`).on('value', s => {
        targetInfo = s.val() || {};
        document.getElementById('u-display').innerText = targetInfo.displayName || 'User';
        document.getElementById('u-photo').src = targetInfo.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
        document.getElementById('rider-card').classList.toggle('hidden', targetInfo.jobType !== 'delivery'); //[cite: 1]
        renderWeekly(targetInfo);
        calculateSalary();
    });

    db.ref(`attendance/${tid}`).on('value', s => {
        const d = s.val();
        logs = d ? Object.keys(d).map(k => ({ id: k, ...d[k] })) : [];
        const today = new Date().toISOString().split('T')[0];
        const todayLog = logs.find(l => l.date === today);
        const billDisplay = document.getElementById('today-bills');
        if (billDisplay) billDisplay.innerText = todayLog ? (todayLog.delivery || 0) : 0; //[cite: 2]
        renderCal();
        calculateSalary();
    });
}

function calculateSalary() {
    const u = targetInfo; const base = (u.salary || 0) / 30; const bRate = u.billRate || 40;
    const m = viewDate.getMonth(), y = viewDate.getFullYear();
    let days = 0, bills = 0;
    logs.forEach(l => {
        const ld = new Date(l.date);
        if (ld.getMonth() === m && ld.getFullYear() === y) {
            if (!l.isOff && l.checkIn) days++;
            bills += (l.delivery || 0);
        }
    });
    const total = (days * base) + (bills * bRate);
    document.getElementById('salary-view').innerText = total.toLocaleString(undefined, { minimumFractionDigits: 2 });
    document.getElementById('salary-detail').innerText = `เข้างาน ${days} วัน | จัดส่ง ${bills} บิล`;
}

async function addDelivery(v) {
    const tid = adminTargetId || currentUser.uid;
    const d = new Date().toISOString().split('T')[0];
    const log = logs.find(l => l.date === d);
    if (log) {
        const newDelivery = Math.max(0, (log.delivery || 0) + v);
        await db.ref(`attendance/${tid}/${log.id}`).update({ delivery: newDelivery }); //[cite: 2]
    } else {
        pushLog("ตอกบัตรเข้างานก่อน", "warning");
    }
}

async function tapIn() {
    const tid = adminTargetId || currentUser.uid;
    const d = new Date().toISOString().split('T')[0], t = new Date().toTimeString().slice(0, 5);
    if (logs.find(l => l.date === d)) return pushLog("ลงเวลาแล้ว", "warning");
    await db.ref(`attendance/${tid}`).push({ date: d, checkIn: t, checkOut: '', isOff: false, delivery: 0 });
}

async function tapOut() {
    const tid = adminTargetId || currentUser.uid;
    const d = new Date().toISOString().split('T')[0], t = new Date().toTimeString().slice(0, 5);
    const log = logs.find(l => l.date === d);
    if (!log) return pushLog("ยังไม่ตอกบัตรเข้า", "error");
    await db.ref(`attendance/${tid}/${log.id}`).update({ checkOut: t });
}

// --- [ ADMIN & PROFILE FUNCTIONS ] ---
function loadUserList() {
    db.ref('users').on('value', s => {
        const users = s.val();
        if (!users) return;
        document.getElementById('user-list').innerHTML = Object.keys(users).map(id => `
            <div onclick="enterAdminView('${id}', '${users[id].displayName}')" class="glass-card p-4 flex justify-between items-center cursor-pointer">
                <div class="flex items-center gap-3"><img src="${users[id].photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" class="w-10 h-10 rounded-full object-cover">
                <div><p class="font-bold text-sm">${users[id].displayName || 'User'}</p><p class="text-[8px] opacity-40 uppercase">${users[id].jobType || 'staff'} • ${users[id].role || 'user'}</p></div></div>
                <i class="fa-solid fa-chevron-right opacity-20"></i></div>`).join('');
    });
}

function enterAdminView(id, name) {
    adminTargetId = id; 
    document.getElementById('remote-banner').classList.remove('hidden'); 
    document.getElementById('remote-name').innerText = name; 
    Swal.fire({ title: 'โหมดจัดการข้อมูล', text: `กำลังเข้าถึงข้อมูลของ: ${name}`, icon: 'info', background: '#1c1c1e', color: '#fff', timer: 1500, showConfirmButton: false }); //[cite: 1]
    initApp(); go('p-home'); 
}

function exitAdminView() { 
    adminTargetId = null; document.getElementById('remote-banner').classList.add('hidden'); initApp(); 
}

async function openEditProfile() {
    const tid = adminTargetId || currentUser.uid;
    const s = await db.ref(`users/${tid}`).once('value');
    const d = s.val() || {};
    const isAdmin = myInfo.role === 'admin'; //[cite: 1]
    const isMe = tid === currentUser.uid;

    const { value: res } = await Swal.fire({
        title: 'แก้ไขข้อมูลบัญชี',
        background: '#1c1c1e', color: '#fff',
        html: `
        <div class="text-left space-y-4 max-h-[65vh] overflow-y-auto px-1 scrollbar-hide">
            <div class="flex flex-col items-center gap-2 border-b border-white/10 pb-4">
                <img id="temp-img" src="${d.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" class="w-16 h-16 rounded-full object-cover border-2 border-blue-500 bg-zinc-900 shadow-xl">
                <input type="file" id="file-input" accept="image/*" class="hidden" onchange="previewImage(this)">
                <button onclick="document.getElementById('file-input').click()" class="text-[9px] bg-blue-500/20 text-blue-400 px-4 py-1.5 rounded-full font-bold uppercase tracking-wider">Change Photo</button>
            </div>
            <div class="grid grid-cols-2 gap-3">
                <div><label class="text-[9px] opacity-40 uppercase font-bold">ชื่อพนักงาน</label><input id="e-name" class="time-pill w-full p-3 mt-1 bg-zinc-800" value="${d.displayName || ''}"></div>
                <div><label class="text-[9px] opacity-40 uppercase font-bold">เบอร์โทรศัพท์</label><input id="e-phone" class="time-pill w-full p-3 mt-1 bg-zinc-800" value="${d.phone || ''}"></div>
            </div>
            <div class="bg-blue-500/5 p-4 rounded-3xl space-y-3 border border-blue-500/10">
                <p class="text-blue-400 text-[10px] font-bold uppercase tracking-tighter italic">บัญชีผู้ใช้</p>
                <div><label class="text-[9px] opacity-40 uppercase font-bold">Username</label><input id="e-user" class="time-pill w-full p-3 mt-1 bg-zinc-800" value="${d.username || ''}"></div>
                <div><label class="text-[9px] opacity-40 uppercase font-bold">Email</label><input id="e-email" class="time-pill w-full p-3 mt-1 bg-zinc-800" value="${d.email || ''}"></div>
                ${isMe ? `<div class="pt-2 border-t border-white/5 mt-4"><label class="text-[10px] text-red-500 uppercase font-bold italic underline">ยืนยันรหัสปัจจุบัน (เพื่อเปลี่ยนเมล/รหัส)</label><input id="curr-pw" type="password" class="time-pill w-full p-3 mt-1 bg-zinc-900 border border-red-500/30" placeholder="รหัสปัจจุบัน"></div>` : ''}
            </div>
            ${isAdmin ? `
            <div class="border-t border-white/10 pt-4 space-y-3">
                <p class="text-orange-500 text-[10px] font-bold uppercase italic">Admin Settings</p>
                <div class="grid grid-cols-2 gap-3">
                    <div><label class="text-[9px] opacity-40 uppercase font-bold">เงินเดือน</label><input id="e-sal" type="number" class="time-pill w-full p-3 mt-1 bg-zinc-800" value="${d.salary || 15000}"></div>
                    <div><label class="text-[9px] opacity-40 uppercase font-bold">ค่าบิล</label><input id="e-bill" type="number" class="time-pill w-full p-3 mt-1 bg-zinc-800" value="${d.billRate || 40}"></div>
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="text-[9px] opacity-40 uppercase font-bold">ประเภทงาน</label>
                        <select id="e-job" class="time-pill w-full p-3 mt-1 bg-zinc-800 text-xs">
                            <option value="staff" ${d.jobType === 'staff' ? 'selected' : ''}>Staff (ทั่วไป)</option>
                            <option value="delivery" ${d.jobType === 'delivery' ? 'selected' : ''}>Delivery (ไรเดอร์)</option>
                        </select>
                    </div>
                    <div>
                        <label class="text-[9px] opacity-40 uppercase font-bold">สิทธิ์การใช้งาน</label>
                        <select id="e-role" class="time-pill w-full p-3 mt-1 bg-zinc-800 text-xs">
                            <option value="user" ${d.role === 'user' ? 'selected' : ''}>User (ทั่วไป)</option>
                            <option value="admin" ${d.role === 'admin' ? 'selected' : ''}>Admin (ผู้ดูแล)</option>
                        </select>
                    </div>
                </div>
            </div>` : ''}
        </div>`,
        showCancelButton: true, confirmButtonText: 'บันทึกข้อมูล',
        preConfirm: async () => {
            const up = { displayName: document.getElementById('e-name').value, phone: document.getElementById('e-phone').value, username: document.getElementById('e-user').value.toLowerCase().trim(), email: document.getElementById('e-email').value.trim() };
            const curPw = document.getElementById('curr-pw')?.value, tempImg = document.getElementById('temp-img').src;
            if (tempImg.startsWith('data:image')) up.photoURL = tempImg;
            if (isAdmin) { 
                up.salary = parseFloat(document.getElementById('e-sal').value); 
                up.billRate = parseFloat(document.getElementById('e-bill').value); 
                up.jobType = document.getElementById('e-job').value; //[cite: 1]
                up.role = document.getElementById('e-role').value; //[cite: 1]
            }
            try {
                if (isMe && (up.email !== d.email)) {
                    if (!curPw) throw new Error("กรุณากรอกรหัสผ่านปัจจุบัน");
                    const cred = firebase.auth.EmailAuthProvider.credential(currentUser.email, curPw);
                    await currentUser.reauthenticateWithCredential(cred);
                    await currentUser.updateEmail(up.email);
                }
                return up;
            } catch (err) { Swal.showValidationMessage(err.message); }
        }
    });
    if (res) { await db.ref(`users/${tid}`).update(res); pushLog("บันทึกสำเร็จ"); }
}

// --- [ UI HELPERS ] ---
function renderCal() {
    const y = viewDate.getFullYear(), m = viewDate.getMonth();
    const names = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    document.getElementById('mon-view').innerText = `${names[m]} ${y + 543}`;
    const total = new Date(y, m + 1, 0).getDate(), start = new Date(y, m, 1).getDay();
    const grid = document.getElementById('cal-grid'); grid.innerHTML = '';
    for (let i = 0; i < start; i++) grid.innerHTML += '<div></div>';
    for (let d = 1; d <= total; d++) {
        const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const log = logs.find(l => l.date === dateStr);
        let cls = log ? (log.isOff ? 'st-off' : 'st-normal') : 'bg-white/5 opacity-40';
        grid.innerHTML += `<div onclick="editCalendarEntry('${dateStr}')" class="day-node ${cls} relative flex flex-col items-center justify-center h-12 text-sm cursor-pointer">${d}</div>`;
    }
}

async function editCalendarEntry(dateStr) {
    const tid = adminTargetId || currentUser.uid;
    const log = logs.find(l => l.date === dateStr);
    const { value: res } = await Swal.fire({
        title: dateStr, background: '#1c1c1e', color: '#fff',
        html: `<input id="sw-in" type="time" class="time-pill w-full p-4 mb-2 bg-zinc-800" value="${log?.checkIn || '08:30'}"><input id="sw-out" type="time" class="time-pill w-full p-4 mb-2 bg-zinc-800" value="${log?.checkOut || '17:30'}"><input id="sw-bill" type="number" class="time-pill w-full p-4 bg-zinc-800" placeholder="บิล" value="${log?.delivery || 0}">`,
        showDenyButton: true, showCancelButton: true, confirmButtonText: 'บันทึก', denyButtonText: 'ลบ'
    });
    if (res) {
        const data = { date: dateStr, checkIn: document.getElementById('sw-in').value, checkOut: document.getElementById('sw-out').value, delivery: parseInt(document.getElementById('sw-bill').value) || 0, isOff: false };
        if (log?.id) await db.ref(`attendance/${tid}/${log.id}`).update(data); else await db.ref(`attendance/${tid}`).push(data);
    } else if (res === false && log?.id) { await db.ref(`attendance/${tid}/${log.id}`).remove(); }
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

function pushLog(m, t = "success") {
    Swal.fire({ title: m, icon: t, background: '#1c1c1e', color: '#fff', timer: 1500, showConfirmButton: false, toast: true, position: 'top' });
}

function toggleAuth(mode) {
    document.getElementById('login-form').classList.toggle('hidden', mode === 'reg');
    document.getElementById('reg-form').classList.toggle('hidden', mode === 'login');
}

function doLogout() { auth.signOut(); }
function moveMonth(v) { viewDate.setMonth(viewDate.getMonth() + v); renderCal(); calculateSalary(); }
function previewImage(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = e => { document.getElementById('temp-img').src = e.target.result; };
        reader.readAsDataURL(input.files[0]);
    }
}
function renderWeekly(data) {
    const names = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
    const weekContainer = document.getElementById('week-list');
    if (!weekContainer) return;
    weekContainer.innerHTML = names.map(d => {
        const s = (data.shifts && data.shifts[d]) ? data.shifts[d] : { in: '08:30', out: '17:30', isOff: false };
        return `<div class="glass-card p-4 flex justify-between items-center ${s.isOff ? 'opacity-30' : ''}">
                <div class="flex items-center gap-3"><input type="checkbox" ${!s.isOff ? 'checked' : ''} onchange="updateShift('${d}', 'isOff', !this.checked)" class="w-5 h-5 accent-blue-500"><span class="font-bold text-xs">${d}</span></div>
                <div class="flex gap-2"><input type="time" class="time-pill py-2 px-3 text-[10px]" value="${s.in}" onchange="updateShift('${d}', 'in', this.value)"><input type="time" class="time-pill py-2 px-3 text-[10px]" value="${s.out}" onchange="updateShift('${d}', 'out', this.value)"></div></div>`;
    }).join('');
}
function updateShift(d, k, v) { db.ref(`users/${adminTargetId || currentUser.uid}/shifts/${d}/${k}`).set(v); }