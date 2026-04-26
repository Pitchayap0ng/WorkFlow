// 1. Firebase & EmailJS Setup
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
emailjs.init("WSvF2N1nopC2xfuZo");

let currentUser = null, userData = {}, logs = [], viewDate = new Date(), adminTargetId = null;

const DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const MONTHS_TH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const HOLIDAYS = { "01-01": "ปีใหม่", "02-16": "มาฆบูชา", "04-13": "สงกรานต์", "05-01": "แรงงาน", "12-05": "วันพ่อ" };

// --- [ AUTH & REGISTRATION WITH EMAIL OTP ] ---
function toggleAuth(isReg) {
    document.getElementById('login-box').classList.toggle('hidden', isReg);
    document.getElementById('reg-box').classList.toggle('hidden', !isReg);
}

async function doLogin() {
    const id = document.getElementById('l-id').value.trim(), pw = document.getElementById('l-pw').value;
    if(!id || !pw) return toast("กรุณากรอกข้อมูล", "warning");
    try {
        let email = id;
        if (!id.includes('@')) {
            const snap = await db.ref('usernames/' + id.toLowerCase()).once('value');
            if (!snap.exists()) return toast("ไม่พบ Username นี้", "error");
            email = snap.val().email;
        }
        await auth.signInWithEmailAndPassword(email, pw);
    } catch (e) { toast("ชื่อผู้ใช้หรือรหัสผ่านผิด", "error"); }
}

async function sendOTP() {
    const user = document.getElementById('r-user').value.trim().toLowerCase();
    const mail = document.getElementById('r-mail').value.trim();
    const phone = document.getElementById('r-phone').value.trim();
    const pw = document.getElementById('r-pw').value;
    const name = document.getElementById('r-name').value;
    
    if (pw.length < 6) return toast("รหัสผ่านต้องมี 6 ตัวขึ้นไป", "error");
    if (!user || !mail || !phone) return toast("กรุณากรอกข้อมูลให้ครบ", "error");

    const snap = await db.ref('usernames/' + user).once('value');
    if (snap.exists()) return toast("Username นี้ถูกใช้งานแล้ว", "error");

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expireTime = new Date(Date.now() + 15 * 60000).toLocaleTimeString('th-TH');

    emailjs.send("IMS-work", "template_34sz4uc", { to_email: mail, passcode: otp, time: expireTime })
    .then(() => {
        Swal.fire({
            title: 'กรอกรหัส OTP', text: 'รหัสส่งไปที่ ' + mail, input: 'text',
            background: '#1c1c1e', color: '#fff',
            preConfirm: (v) => v === otp ? v : Swal.showValidationMessage('รหัส OTP ไม่ถูกต้อง')
        }).then(r => { if (r.isConfirmed) finalizeReg({user, mail, pw, name, phone}); });
    }).catch(e => toast("ส่งเมลไม่สำเร็จ: " + e.text, "error"));
}

async function finalizeReg(info) {
    try {
        const res = await auth.createUserWithEmailAndPassword(info.mail, info.pw);
        await db.ref('users/' + res.user.uid).set({
            username: info.user, displayName: info.name, email: info.mail, phone: info.phone, salary: 15000, isAdmin: false, jobType: 'staff'
        });
        await db.ref('usernames/' + info.user).set({ email: info.mail, uid: res.user.uid });
        toast("สมัครสำเร็จ ยินดีต้อนรับ!");
    } catch (e) { toast(e.message, "error"); }
}

// --- [ APP CORE LOGIC ] ---
auth.onAuthStateChanged(u => {
    currentUser = u;
    document.getElementById('auth-ui').classList.toggle('hidden', !!u);
    document.getElementById('app-ui').classList.toggle('hidden', !u);
    if (u) initApp();
});

function initApp() {
    const uid = adminTargetId || currentUser.uid;
    
    // User Data Listener
    db.ref('users/' + uid).on('value', s => {
        const data = s.val() || {};
        if (!adminTargetId) userData = data; 
        
        document.getElementById('u-display').innerText = data.displayName || data.username;
        document.getElementById('u-photo').src = data.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
        document.getElementById('nav-admin').classList.toggle('hidden', !userData.isAdmin);
        document.getElementById('rider-card').classList.toggle('hidden', data.jobType !== 'rider');
        
        renderWeekly(data);
        calculateSalary(data);
        if (userData.isAdmin) loadUserList();
    });

    // Attendance Listener
    db.ref('attendance/' + uid).on('value', s => {
        const d = s.val();
        logs = d ? Object.keys(d).map(k => ({ id: k, ...d[k] })) : [];
        const todayLog = logs.find(l => l.date === new Date().toISOString().split('T')[0]);
        document.getElementById('today-bills').innerText = todayLog ? (todayLog.delivery || 0) : 0;
        renderCal();
    });
}

// --- [ PROFILE EDIT (แก้ได้ทุกอย่าง) ] ---
async function openEditProfile() {
    const tid = adminTargetId || currentUser.uid;
    const snap = await db.ref('users/' + tid).once('value');
    const d = snap.val() || {};

    const { value: res } = await Swal.fire({
        title: 'แก้ไขข้อมูลผู้ใช้', background: '#1c1c1e', color: '#fff',
        html: `
            <div class="text-left space-y-3 px-2 overflow-y-auto max-h-[60vh]">
                <label class="text-[10px] opacity-40">รูปโปรไฟล์ (URL)</label>
                <input id="e-img" class="time-pill w-full mb-2" value="${d.photoURL || ''}">
                <label class="text-[10px] opacity-40">ชื่อที่แสดง</label>
                <input id="e-name" class="time-pill w-full mb-2" value="${d.displayName || ''}">
                <label class="text-[10px] opacity-40">อีเมล</label>
                <input id="e-mail" class="time-pill w-full mb-2" value="${d.email || ''}">
                <label class="text-[10px] opacity-40">เบอร์โทร</label>
                <input id="e-phone" class="time-pill w-full mb-2" value="${d.phone || ''}">
                ${userData.isAdmin ? `
                <hr class="opacity-10 my-4">
                <label class="text-[10px] text-blue-500">เงินเดือน (Admin Only)</label>
                <input id="e-salary" type="number" class="time-pill w-full mb-2" value="${d.salary || 15000}">
                <label class="text-[10px] text-blue-500">สิทธิ์การใช้งาน</label>
                <select id="e-role" class="time-pill w-full mb-2">
                    <option value="false" ${!d.isAdmin?'selected':''}>Staff</option>
                    <option value="true" ${d.isAdmin?'selected':''}>Admin</option>
                </select>
                <label class="text-[10px] text-blue-500">สายงาน</label>
                <select id="e-job" class="time-pill w-full">
                    <option value="staff" ${d.jobType==='staff'?'selected':''}>ออฟฟิศ</option>
                    <option value="rider" ${d.jobType==='rider'?'selected':''}>Rider</option>
                </select>` : ''}
            </div>`,
        showCancelButton: true,
        preConfirm: () => {
            const up = { 
                photoURL: document.getElementById('e-img').value, 
                displayName: document.getElementById('e-name').value, 
                email: document.getElementById('e-mail').value, 
                phone: document.getElementById('e-phone').value 
            };
            if(userData.isAdmin) {
                up.salary = parseFloat(document.getElementById('e-salary').value);
                up.isAdmin = document.getElementById('e-role').value === 'true';
                up.jobType = document.getElementById('e-job').value;
            }
            return up;
        }
    });
    if (res) { await db.ref('users/' + tid).update(res); toast("อัปเดตเรียบร้อย"); }
}

// --- [ ATTENDANCE & BILLING ] ---
function tapIn() {
    const d = new Date().toISOString().split('T')[0], t = new Date().toTimeString().slice(0, 5);
    if(logs.find(l => l.date === d)) return toast("วันนี้เช็คอินไปแล้ว", "info");
    db.ref(`attendance/${adminTargetId || currentUser.uid}`).push({ date: d, checkIn: t, checkOut: '', isOff: false, delivery: 0 });
    toast("เช็คอินสำเร็จ (" + t + ")");
}

function tapOut() {
    const d = new Date().toISOString().split('T')[0], t = new Date().toTimeString().slice(0, 5);
    const log = logs.find(l => l.date === d);
    if(!log || log.checkOut) return toast("ยังไม่เช็คอิน หรือเช็คเอาท์ไปแล้ว", "error");
    db.ref(`attendance/${adminTargetId || currentUser.uid}/${log.id}`).update({ checkOut: t });
    toast("เช็คเอาท์สำเร็จ (" + t + ")");
}

async function addDelivery(v) {
    const tid = adminTargetId || currentUser.uid;
    const d = new Date().toISOString().split('T')[0];
    let log = logs.find(l => l.date === d);
    if (!log) {
        await db.ref(`attendance/${tid}`).push({ date: d, checkIn: '--:--', delivery: Math.max(0, v), isOff: false });
    } else {
        await db.ref(`attendance/${tid}/${log.id}`).update({ delivery: Math.max(0, (log.delivery || 0) + v) });
    }
}

// --- [ ADMIN CONTROL ] ---
function loadUserList() {
    db.ref('users').once('value', s => {
        const users = s.val();
        document.getElementById('user-list').innerHTML = Object.keys(users).map(id => `
            <div onclick="enterAdminView('${id}', '${users[id].displayName || users[id].username}')" class="glass-card p-4 flex justify-between items-center active:scale-95 transition">
                <div class="flex items-center gap-4">
                    <img src="${users[id].photoURL || ''}" class="w-12 h-12 rounded-full bg-zinc-800 object-cover">
                    <div>
                        <p class="font-bold text-sm text-white">${users[id].displayName || users[id].username}</p>
                        <p class="text-[9px] opacity-40 uppercase tracking-tighter">${users[id].jobType} | ${users[id].isAdmin ? 'Admin' : 'Staff'}</p>
                    </div>
                </div>
                <i class="fa-solid fa-chevron-right opacity-20"></i>
            </div>`).join('');
    });
}

function enterAdminView(id, name) {
    adminTargetId = id;
    document.getElementById('remote-banner').classList.remove('hidden');
    document.getElementById('remote-name').innerText = name;
    initApp(); go('p-home');
    toast("กำลังควบคุมเครื่อง: " + name, "info");
}

function exitAdminView() {
    adminTargetId = null;
    document.getElementById('remote-banner').classList.add('hidden');
    initApp();
    toast("กลับสู่หน้าจอตัวเอง");
}

// --- [ UI UTILS ] ---
function renderWeekly(data) {
    const list = document.getElementById('week-list');
    if(!list) return;
    list.innerHTML = DAYS.map(d => {
        const s = (data.shifts && data.shifts[d]) ? data.shifts[d] : { in: '08:30', out: '17:30', isOff: false };
        return `<div class="glass-card p-4 flex justify-between items-center ${s.isOff ? 'opacity-30' : ''}">
            <span class="font-bold text-sm">${d}</span>
            <div class="flex gap-2">
                <input type="time" class="time-pill" value="${s.in}" onchange="setShift('${d}','in',this.value)">
                <input type="time" class="time-pill" value="${s.out}" onchange="setShift('${d}','out',this.value)">
            </div>
        </div>`;
    }).join('');
}

function renderCal() {
    const y = viewDate.getFullYear(), m = viewDate.getMonth();
    document.getElementById('mon-view').innerText = `${MONTHS_TH[m]} ${y + 543}`;
    const total = new Date(y, m + 1, 0).getDate(), start = new Date(y, m, 1).getDay();
    const grid = document.getElementById('cal-grid'); 
    if(!grid) return; grid.innerHTML = '';
    
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
        title: date, background: '#1c1c1e', color: '#fff',
        html: `<div class="text-left space-y-4">
            <label class="flex justify-between items-center bg-white/5 p-4 rounded-2xl"><span>วันหยุด</span><input type="checkbox" id="e-off" ${log.isOff ? 'checked' : ''}></label>
            <div class="grid grid-cols-2 gap-2"><input type="time" id="e-in" class="time-pill" value="${log.checkIn}"><input type="time" id="e-out" class="time-pill" value="${log.checkOut}"></div>
        </div>`,
        showCancelButton: true,
        preConfirm: () => ({ isOff: document.getElementById('e-off').checked, checkIn: document.getElementById('e-in').value, checkOut: document.getElementById('e-out').value })
    });
    if(res) {
        const tid = adminTargetId || currentUser.uid;
        if(log.id) await db.ref(`attendance/${tid}/${log.id}`).update(res);
        else await db.ref(`attendance/${tid}`).push({ ...res, date });
    }
}

function calculateSalary(data) {
    const dailyRate = (data.salary || 15000) / 30;
    const currentMonth = new Date().getMonth();
    const count = logs.filter(l => new Date(l.date).getMonth() === currentMonth && !l.isOff && l.checkIn !== '--:--').length;
    document.getElementById('salary-view').innerText = (count * dailyRate).toLocaleString(undefined, {minimumFractionDigits: 2});
}

function go(id, btn) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    if(btn) {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }
}

function toast(m, i="success") { Swal.fire({ title: m, icon: i, timer: 1500, showConfirmButton: false, background: '#1c1c1e', color: '#fff' }); }
function moveMonth(v) { viewDate.setMonth(viewDate.getMonth() + v); renderCal(); }
function setShift(d, k, v) { db.ref(`users/${adminTargetId || currentUser.uid}/shifts/${d}/${k}`).set(v); }
function doLogout() { auth.signOut(); }
async function forgotPW() {
    const { value: email } = await Swal.fire({ title: 'ลืมรหัสผ่าน', input: 'email', inputPlaceholder: 'กรอกอีเมลของคุณ', background: '#1c1c1e', color: '#fff' });
    if (email) auth.sendPasswordResetEmail(email).then(() => toast("ส่งลิงก์กู้คืนไปที่เมลแล้ว"));
}
