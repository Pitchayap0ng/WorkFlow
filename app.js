// --- CONFIGURATION ---
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
const IMGBB_API_KEY = "8a72c60399b9c276904659cf219a03c9"; 
const DELIVERY_RATE = 15;

// เริ่มต้น EmailJS (ตรวจสอบ Public Key ให้ตรงกับของคุณ)
emailjs.init("WSvF2N1nopC2xfuZo");

let currentUser = null, userData = {}, logs = [], viewDate = new Date();
let adminUserList = [];

const DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const MONTHS_TH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

// --- 1. AUTH LOGIC (Login / Register / OTP) ---

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
            if (!snap.exists()) return toast("ไม่พบ Username", "error");
            email = snap.val().email;
        }
        await auth.signInWithEmailAndPassword(email, pw);
    } catch (e) { 
        console.error(e);
        toast("อีเมลหรือรหัสผ่านไม่ถูกต้อง", "error"); 
    }
}

// ฟังก์ชันที่หายไป: sendOTP
async function sendOTP() {
    const user = document.getElementById('r-user').value.trim().toLowerCase();
    const mail = document.getElementById('r-mail').value.trim();
    const pw = document.getElementById('r-pw').value;
    const name = document.getElementById('r-name').value;

    if (!user || !mail || !pw || !name) return toast("กรุณากรอกให้ครบทุกช่อง", "warning");
    if (pw.length < 6) return toast("รหัสผ่านต้องมี 6 ตัวขึ้นไป", "warning");
    
    // ตรวจสอบ Username ซ้ำ
    const snap = await db.ref('usernames/' + user).once('value');
    if (snap.exists()) return toast("Username นี้มีผู้ใช้แล้ว", "error");

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    Swal.fire({ title: 'กำลังส่งรหัส OTP...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    emailjs.send("IMS-work", "template_34sz4uc", { 
        to_email: mail, 
        passcode: otp, 
        time: new Date().toLocaleTimeString() 
    }).then(() => {
        Swal.fire({
            title: 'ยืนยันรหัส OTP',
            text: 'เราส่งรหัสไปที่ ' + mail,
            input: 'text',
            background: '#1c1c1e', color: '#fff',
            confirmButtonText: 'ยืนยัน',
            preConfirm: (v) => v === otp ? v : Swal.showValidationMessage('รหัส OTP ไม่ถูกต้อง')
        }).then(r => { 
            if (r.isConfirmed) finalizeReg({user, mail, pw, name}); 
        });
    }).catch(e => {
        console.error(e);
        toast("ส่งอีเมลล้มเหลว ตรวจสอบ EmailJS Config", "error");
    });
}

// ฟังก์ชันที่หายไป: finalizeReg
async function finalizeReg(info) {
    try {
        const res = await auth.createUserWithEmailAndPassword(info.mail, info.pw);
        const uid = res.user.uid;
        // สร้าง Profile ใน Database
        await db.ref('users/' + uid).set({ 
            username: info.user, 
            displayName: info.name, 
            email: info.mail, 
            salary: 15000, 
            role: 'staff',
            otRate: 1.5 
        });
        // เก็บ Index ของ Username
        await db.ref('usernames/' + info.user).set({ email: info.mail, uid: uid });
        toast("สมัครสมาชิกสำเร็จ!");
    } catch (e) { 
        toast(e.message, "error"); 
    }
}

async function forgotPassword() {
    const { value: email } = await Swal.fire({
        title: 'ลืมรหัสผ่าน?',
        input: 'email',
        inputPlaceholder: 'กรอกอีเมลของคุณ',
        background: '#1c1c1e', color: '#fff',
        confirmButtonText: 'ส่งลิงก์รีเซ็ต',
        showCancelButton: true
    });
    if (email) {
        auth.sendPasswordResetEmail(email)
            .then(() => toast("ส่งลิงก์รีเซ็ตไปที่เมลแล้ว"))
            .catch(e => toast("ไม่พบอีเมลนี้ในระบบ", "error"));
    }
}

// --- 2. MAIN APP FLOW ---

auth.onAuthStateChanged(u => {
    currentUser = u;
    document.getElementById('auth-ui').classList.toggle('hidden', !!u);
    document.getElementById('app-ui').classList.toggle('hidden', !u);
    if (u) init();
});

function init() {
    db.ref('users/' + currentUser.uid).on('value', s => {
        userData = s.val() || {};
        document.getElementById('u-display').innerText = userData.displayName || 'User';
        document.getElementById('u-photo').src = userData.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
        
        if (userData.role === 'admin') {
            document.getElementById('nav-admin').classList.remove('hidden');
            loadAllUsers();
        }
        renderWeekly();
        calculateSalary();
    });

    db.ref('attendance/' + currentUser.uid).on('value', s => {
        const d = s.val();
        logs = d ? Object.keys(d).map(k => ({ id: k, ...d[k] })) : [];
        renderCal();
        calculateSalary();
    });
}

// --- 3. ADMIN FUNCTIONS ---

function loadAllUsers() {
    db.ref('users').on('value', s => {
        const data = s.val();
        adminUserList = data ? Object.keys(data).map(k => ({ uid: k, ...data[k] })) : [];
        renderAdminUserList();
    });
}

function renderAdminUserList() {
    const list = document.getElementById('user-list');
    if (!list) return;
    list.innerHTML = adminUserList.map(user => `
        <div onclick="adminEditUser('${user.uid}')" class="glass-card p-4 flex items-center justify-between active:scale-95 transition-all cursor-pointer mb-2">
            <div class="flex items-center gap-3">
                <img src="${user.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" class="w-10 h-10 rounded-full object-cover border border-white/10">
                <div>
                    <p class="font-bold text-sm">${user.displayName}</p>
                    <p class="text-[10px] opacity-40 uppercase">${user.role || 'Staff'} • ${user.email}</p>
                </div>
            </div>
            <i class="fa-solid fa-chevron-right text-xs opacity-20"></i>
        </div>
    `).join('');
}

async function adminEditUser(targetUid) {
    const snap = await db.ref('users/' + targetUid).once('value');
    editProfile(targetUid, snap.val());
}

async function editProfile(targetUid = currentUser.uid, targetData = userData) {
    const isSelf = targetUid === currentUser.uid;
    const isAdmin = userData.role === 'admin';

    const { value: res } = await Swal.fire({
        title: isSelf ? 'โปรไฟล์ของคุณ' : 'จัดการพนักงาน',
        background: '#1c1c1e', color: '#fff',
        html: `
            <div class="flex flex-col items-center mb-6">
                <div class="relative group" onclick="document.getElementById('file-input').dataset.target='${targetUid}'; document.getElementById('file-input').click()">
                    <img src="${targetData.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" class="w-24 h-24 rounded-full object-cover border-4 border-blue-500 shadow-2xl">
                    <div class="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition cursor-pointer"><i class="fa-solid fa-camera"></i></div>
                </div>
                <p class="text-[10px] mt-2 text-blue-500 uppercase font-bold">แตะเพื่อเปลี่ยนรูป</p>
            </div>
            <div class="space-y-4 text-left">
                <input id="sw-name" class="w-full bg-white/5 p-4 rounded-xl outline-none" value="${targetData.displayName || ''}" placeholder="ชื่อเรียก">
                <input id="sw-sal" type="number" class="w-full bg-white/5 p-4 rounded-xl outline-none" value="${targetData.salary || 15000}" placeholder="เงินเดือนฐาน">
                ${isAdmin ? `
                    <div class="grid grid-cols-2 gap-2">
                        <input id="sw-role" class="w-full bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-xl outline-none" value="${targetData.role || 'staff'}" placeholder="Role">
                        <input id="sw-ot" type="number" step="0.1" class="w-full bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-xl outline-none" value="${targetData.otRate || 1.5}" placeholder="OT Rate">
                    </div>
                ` : ''}
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'บันทึก',
        preConfirm: () => {
            const upd = { 
                displayName: document.getElementById('sw-name').value, 
                salary: parseFloat(document.getElementById('sw-sal').value) 
            };
            if (isAdmin) {
                upd.role = document.getElementById('sw-role').value.toLowerCase();
                upd.otRate = parseFloat(document.getElementById('sw-ot').value);
            }
            return upd;
        }
    });

    if (res) {
        await db.ref('users/' + targetUid).update(res);
        toast("บันทึกสำเร็จ");
    }
}

// --- 4. CORE FEATURES ---

function calculateSalary() {
    const dailyRate = (userData.salary || 15000) / 30;
    const currentMonth = new Date().getMonth();
    let totalBase = 0, totalDelivery = 0, todayBills = 0;

    logs.forEach(l => {
        if (new Date(l.date).getMonth() === currentMonth) {
            if (!l.isOff && l.checkIn) totalBase += dailyRate;
            if (l.delivery) totalDelivery += (l.delivery * DELIVERY_RATE);
            if (l.date === new Date().toISOString().split('T')[0]) todayBills = l.delivery || 0;
        }
    });

    document.getElementById('salary-view').innerText = (totalBase + totalDelivery).toLocaleString(undefined, {minimumFractionDigits: 2});
    document.getElementById('today-bills').innerText = todayBills;
    document.getElementById('today-delivery-money').innerText = todayBills * DELIVERY_RATE;
}

function addDelivery() {
    const d = new Date().toISOString().split('T')[0];
    const log = logs.find(l => l.date === d);
    if (!log) return toast("กรุณาเช็คอินก่อน", "warning");
    db.ref(`attendance/${currentUser.uid}/${log.id}`).update({ delivery: (log.delivery || 0) + 1 });
    toast("+1 บิล");
}

function tapIn() {
    const d = new Date().toISOString().split('T')[0], t = new Date().toTimeString().slice(0, 5);
    if(logs.find(l => l.date === d)) return toast("วันนี้เช็คอินไปแล้ว", "info");
    db.ref(`attendance/${currentUser.uid}`).push({ date: d, checkIn: t, checkOut: '', isOff: false, delivery: 0 });
    toast("เช็คอินเรียบร้อย");
}

function tapOut() {
    const d = new Date().toISOString().split('T')[0], t = new Date().toTimeString().slice(0, 5);
    const log = logs.find(l => l.date === d);
    if(!log || log.checkOut) return toast("เช็คเอาท์ไม่ได้", "error");
    db.ref(`attendance/${currentUser.uid}/${log.id}`).update({ checkOut: t });
    toast("เช็คเอาท์เรียบร้อย");
}

async function handleFileUpload(input) {
    const file = input.files[0];
    const targetUid = input.dataset.target || currentUser.uid;
    if (!file) return;

    Swal.fire({ title: 'กำลังอัปโหลด...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    const formData = new FormData();
    formData.append("image", file);

    try {
        const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body: formData });
        const result = await response.json();
        if (result.success) {
            await db.ref('users/' + targetUid).update({ photoURL: result.data.url });
            Swal.close();
            toast("เปลี่ยนรูปสำเร็จ");
            // รีโหลดหน้า Modal แก้ไข
            const snap = await db.ref('users/' + targetUid).once('value');
            editProfile(targetUid, snap.val());
        }
    } catch (e) { Swal.fire('Error', 'อัปโหลดล้มเหลว', 'error'); }
}

// --- 5. UI & NAV ---

function go(id, btn) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

function renderWeekly() {
    const list = document.getElementById('week-list');
    if(!list) return;
    list.innerHTML = `<h2 class="text-2xl font-bold mb-4">ตารางงานรายสัปดาห์</h2>` + DAYS.map(d => {
        const s = (userData.shifts && userData.shifts[d]) ? userData.shifts[d] : { in: '08:30', out: '17:30', isOff: false };
        return `<div class="glass-card p-4 flex justify-between items-center ${s.isOff ? 'opacity-30' : ''}">
            <div class="flex flex-col"><span class="font-bold text-sm">${d}</span>
            <button onclick="setOff('${d}', ${!s.isOff})" class="text-[10px] text-left ${s.isOff ? 'text-red-500' : 'text-blue-500'} font-bold">${s.isOff ? 'หยุด' : 'ทำงาน'}</button></div>
            <div class="flex gap-2"><input type="time" class="time-pill" value="${s.in}" onchange="setShift('${d}','in',this.value)" ${s.isOff ? 'disabled' : ''}>
            <input type="time" class="time-pill" value="${s.out}" onchange="setShift('${d}','out',this.value)" ${s.isOff ? 'disabled' : ''}></div></div>`;
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
        const cls = log ? (log.isOff ? 'st-off' : 'st-normal') : 'bg-white/5';
        grid.innerHTML += `<div onclick="editDay('${date}')" class="day-node ${cls}">${d}</div>`;
    }
}

async function editDay(date) {
    const log = logs.find(l => l.date === date) || { checkIn: '', checkOut: '', isOff: false, delivery: 0 };
    const { value: res } = await Swal.fire({
        title: date, background: '#1c1c1e', color: '#fff',
        html: `
            <div class="text-left space-y-4">
                <label class="flex justify-between items-center bg-white/5 p-4 rounded-2xl"><span>วันหยุด</span><input type="checkbox" id="e-off" ${log.isOff ? 'checked' : ''}></label>
                <div class="grid grid-cols-2 gap-2"><input type="time" id="e-in" class="time-pill w-full" value="${log.checkIn}"><input type="time" id="e-out" class="time-pill w-full" value="${log.checkOut}"></div>
                <input type="number" id="e-del" class="w-full bg-white/5 p-4 rounded-xl outline-none" value="${log.delivery || 0}" placeholder="จำนวนบิล Delivery">
            </div>`,
        showCancelButton: true,
        preConfirm: () => ({ 
            isOff: document.getElementById('e-off').checked, 
            checkIn: document.getElementById('e-in').value, 
            checkOut: document.getElementById('e-out').value, 
            delivery: parseInt(document.getElementById('e-del').value) || 0 
        })
    });
    if(res) {
        if(log.id) db.ref(`attendance/${currentUser.uid}/${log.id}`).update({ ...res, date });
        else db.ref(`attendance/${currentUser.uid}`).push({ ...res, date });
    }
}

function setShift(d, k, v) { db.ref(`users/${currentUser.uid}/shifts/${d}/${k}`).set(v); }
function setOff(d, v) { db.ref(`users/${currentUser.uid}/shifts/${d}/isOff`).set(v); }
function moveMonth(v) { viewDate.setMonth(viewDate.getMonth() + v); renderCal(); }
function toast(m, i="success") { Swal.fire({ title: m, icon: i, timer: 1500, showConfirmButton: false, background: '#1c1c1e', color: '#fff' }); }
function confirmLogout() { Swal.fire({ title: 'ออกจากระบบ?', icon: 'question', showCancelButton: true, background: '#1c1c1e', color: '#fff' }).then(r => { if (r.isConfirmed) auth.signOut(); }); }
