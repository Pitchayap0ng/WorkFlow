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
const IMGBB_KEY = "8a72c60399b9c276904659cf219a03c9";

let currentUser = null, userData = {}, logs = [], viewDate = new Date();
const DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

// --- 1. AUTH & INITIALIZE ---

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
        toast("เข้าสู่ระบบสำเร็จ", "success");
    } catch (e) { toast("ข้อมูลไม่ถูกต้อง", "error"); }
}

auth.onAuthStateChanged(u => {
    currentUser = u;
    document.getElementById('auth-ui').classList.toggle('hidden', !!u);
    document.getElementById('app-ui').classList.toggle('hidden', !u);
    if (u) init();
});

function init() {
    // โหลดข้อมูลโปรไฟล์ตัวเอง
    db.ref('users/' + currentUser.uid).on('value', s => {
        userData = s.val() || {};
        document.getElementById('u-display').innerText = userData.displayName || 'User';
        document.getElementById('u-photo').src = userData.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
        document.getElementById('rider-card').classList.toggle('hidden', userData.jobType !== 'rider');
        
        if (userData.role === 'admin') {
            document.getElementById('nav-admin').classList.remove('hidden');
            loadAdminPanel();
        } else {
            document.getElementById('nav-admin').classList.add('hidden');
        }
        renderSchedule();
        calculateAll();
    });

    // โหลดประวัติการทำงาน
    db.ref('attendance/' + currentUser.uid).on('value', s => {
        const d = s.val();
        logs = d ? Object.keys(d).map(k => ({ id: k, ...d[k] })) : [];
        renderCal();
        calculateAll();
    });
}

// --- 2. ADMIN & USER MANAGEMENT ---

function loadAdminPanel() {
    const list = document.getElementById('user-list');
    db.ref('users').on('value', s => {
        const data = s.val();
        if (!data) return;
        const users = Object.keys(data).map(k => ({ uid: k, ...data[k] }));
        list.innerHTML = users.map(u => `
            <div onclick="editUserProfile('${u.uid}', ${JSON.stringify(u).replace(/"/g, '&quot;')})" class="glass-card p-4 flex items-center justify-between mb-2 active:scale-95 transition cursor-pointer">
                <div class="flex items-center gap-3">
                    <img src="${u.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" class="w-10 h-10 rounded-full object-cover">
                    <div>
                        <p class="font-bold text-sm">${u.displayName || u.username}</p>
                        <p class="text-[9px] opacity-40 uppercase tracking-widest text-blue-400">${u.role || 'staff'} • ${u.jobType || 'staff'}</p>
                    </div>
                </div>
                <div class="text-right">
                    <p class="text-xs font-bold">฿${(u.salary || 0).toLocaleString()}</p>
                    <i class="fa-solid fa-chevron-right opacity-20 text-[10px]"></i>
                </div>
            </div>
        `).join('');
    }, err => {
        list.innerHTML = `<p class="text-[10px] text-red-500 text-center">Permission Denied! กรุณาตรวจสอบ Firebase Rules</p>`;
    });
}

async function editUserProfile(targetUid = currentUser.uid, targetData = userData) {
    const isAdmin = userData.role === 'admin';
    const { value: res } = await Swal.fire({
        title: 'แก้ไขข้อมูลผู้ใช้', background: '#1c1c1e', color: '#fff',
        html: `
            <div class="space-y-3">
                <div class="flex justify-center mb-4" onclick="document.getElementById('file-input').dataset.target='${targetUid}'; document.getElementById('file-input').click()">
                    <img src="${targetData.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" class="w-20 h-20 rounded-full object-cover border-2 border-blue-500 shadow-xl">
                </div>
                <input id="sw-name" class="w-full bg-white/5 p-4 rounded-xl outline-none" value="${targetData.displayName || ''}" placeholder="ชื่อเล่น">
                <input id="sw-sal" type="number" class="w-full bg-white/5 p-4 rounded-xl outline-none" value="${targetData.salary || 15000}" placeholder="เงินเดือน">
                ${isAdmin ? `
                    <select id="sw-job" class="w-full bg-white/5 p-4 rounded-xl text-white">
                        <option value="staff" ${targetData.jobType==='staff'?'selected':''}>พนักงานใน</option>
                        <option value="rider" ${targetData.jobType==='rider'?'selected':''}>Rider (ส่งของ)</option>
                    </select>
                    <select id="sw-role" class="w-full bg-white/5 p-4 rounded-xl text-white">
                        <option value="staff" ${targetData.role==='staff'?'selected':''}>Staff</option>
                        <option value="admin" ${targetData.role==='admin'?'selected':''}>Admin</option>
                    </select>
                ` : ''}
            </div>`,
        showCancelButton: true, confirmButtonText: 'บันทึก',
        preConfirm: () => {
            const d = { displayName: document.getElementById('sw-name').value, salary: parseFloat(document.getElementById('sw-sal').value) };
            if (isAdmin) { d.jobType = document.getElementById('sw-job').value; d.role = document.getElementById('sw-role').value; }
            return d;
        }
    });
    if (res) { await db.ref('users/' + targetUid).update(res); toast("บันทึกข้อมูลเรียบร้อย"); }
}

// --- 3. WEEKLY SCHEDULE ---

function renderSchedule() {
    const list = document.getElementById('week-list');
    if(!list) return;
    list.innerHTML = DAYS.map(d => {
        const s = (userData.shifts && userData.shifts[d]) ? userData.shifts[d] : { in: '08:30', out: '17:30', isOff: false };
        return `<div class="glass-card p-4 flex justify-between items-center ${s.isOff ? 'opacity-30' : ''}">
            <div>
                <span class="font-bold text-xs">${d}</span><br>
                <button onclick="db.ref('users/${currentUser.uid}/shifts/${d}/isOff').set(${!s.isOff})" class="text-[9px] text-blue-500 font-bold uppercase">${s.isOff ? 'วันหยุด' : 'วันทำงาน'}</button>
            </div>
            <div class="flex gap-2">
                <input type="time" class="time-pill" value="${s.in}" onchange="db.ref('users/${currentUser.uid}/shifts/${d}/in').set(this.value)">
                <input type="time" class="time-pill" value="${s.out}" onchange="db.ref('users/${currentUser.uid}/shifts/${d}/out').set(this.value)">
            </div>
        </div>`;
    }).join('');
}

// --- 4. CALENDAR & LOGS MANAGEMENT ---

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
        const cls = log ? (log.isOff ? 'st-off' : 'st-work') : 'bg-white/5';
        grid.innerHTML += `
            <div onclick="manageLog('${ds}')" class="day-node ${cls}">
                ${d}
                ${log && log.delivery ? `<span class="bill-badge">${log.delivery}</span>` : ''}
            </div>`;
    }
}

async function manageLog(ds) {
    const log = logs.find(l => l.date === ds);
    const { value: action } = await Swal.fire({
        title: 'จัดการวันที่ ' + ds,
        background: '#1c1c1e', color: '#fff',
        showDenyButton: !!log,
        showCancelButton: true,
        confirmButtonText: log ? 'แก้ไขเวลา' : 'เพิ่มบันทึก',
        denyButtonText: 'ลบทิ้ง',
        denyButtonColor: '#ef4444'
    });

    if (action === true) {
        // แก้ไขหรือเพิ่ม
        const { value: res } = await Swal.fire({
            title: 'ระบุเวลา', background: '#1c1c1e', color: '#fff',
            html: `
                <div class="text-left text-[10px] mb-1">Check-In:</div>
                <input id="sw-in" type="time" class="w-full bg-white/5 p-3 rounded-xl mb-3" value="${log ? log.checkIn : '08:30'}">
                <div class="text-left text-[10px] mb-1">Check-Out:</div>
                <input id="sw-out" type="time" class="w-full bg-white/5 p-3 rounded-xl mb-3" value="${log ? log.checkOut : '17:30'}">
                <div class="text-left text-[10px] mb-1">บิล Delivery:</div>
                <input id="sw-bill" type="number" class="w-full bg-white/5 p-3 rounded-xl" value="${log ? (log.delivery || 0) : 0}">`,
            preConfirm: () => ({ in: document.getElementById('sw-in').value, out: document.getElementById('sw-out').value, bill: parseInt(document.getElementById('sw-bill').value) })
        });
        if (res) {
            if (log) db.ref(`attendance/${currentUser.uid}/${log.id}`).update({ checkIn: res.in, checkOut: res.out, delivery: res.bill });
            else db.ref(`attendance/${currentUser.uid}`).push({ date: ds, checkIn: res.in, checkOut: res.out, delivery: res.bill, isOff: false });
        }
    } else if (action === false) { // Deny Button (ลบ)
        const { isConfirmed } = await Swal.fire({ title: 'ลบข้อมูล?', text: 'คุณแน่ใจว่าต้องการลบข้อมูลวันนี้?', icon: 'warning', showCancelButton: true, background: '#1c1c1e', color: '#fff' });
        if (isConfirmed) {
            db.ref(`attendance/${currentUser.uid}/${log.id}`).remove();
            toast("ลบสำเร็จ");
        }
    }
}

// --- 5. RIDER & SALARY CALCULATION ---

function calculateAll() {
    const dailyRate = (userData.salary || 15000) / 30;
    const curMonth = new Date().getMonth();
    let total = 0, todayB = 0;
    logs.forEach(l => {
        if (new Date(l.date).getMonth() === curMonth) {
            if (!l.isOff && l.checkIn) total += dailyRate;
            if (l.delivery) total += (l.delivery * 15);
            if (l.date === new Date().toISOString().split('T')[0]) todayB = l.delivery || 0;
        }
    });
    document.getElementById('salary-view').innerText = total.toLocaleString(undefined, {minimumFractionDigits: 2});
    document.getElementById('today-bills').innerText = todayB;
}

async function editBills() {
    const d = new Date().toISOString().split('T')[0];
    const log = logs.find(l => l.date === d);
    if(!log) return toast("กรุณา Check-In ก่อน", "warning");
    const { value: amt } = await Swal.fire({ title: 'จำนวนบิลวันนี้', input: 'number', inputValue: log.delivery || 0, background: '#1c1c1e', color: '#fff' });
    if (amt !== undefined) db.ref(`attendance/${currentUser.uid}/${log.id}`).update({ delivery: parseInt(amt) || 0 });
}

function addDelivery(val) {
    const d = new Date().toISOString().split('T')[0], log = logs.find(l => l.date === d);
    if(!log) return toast("Check-In ก่อน!", "warning");
    db.ref(`attendance/${currentUser.uid}/${log.id}`).update({ delivery: (log.delivery || 0) + val });
}

function tapIn() {
    const d = new Date().toISOString().split('T')[0], t = new Date().toTimeString().slice(0, 5);
    if(logs.find(l => l.date === d)) return toast("บันทึกไปแล้ว", "info");
    db.ref(`attendance/${currentUser.uid}`).push({ date: d, checkIn: t, checkOut: '', isOff: false, delivery: 0 });
    toast("Check-In สำเร็จ");
}

function tapOut() {
    const d = new Date().toISOString().split('T')[0], t = new Date().toTimeString().slice(0, 5);
    const log = logs.find(l => l.date === d);
    if(!log || log.checkOut) return toast("ไม่พบรายการเช็คเอาท์", "error");
    db.ref(`attendance/${currentUser.uid}/${log.id}`).update({ checkOut: t });
    toast("Check-Out สำเร็จ");
}

// --- 6. UTILS ---

async function handleFileUpload(input) {
    const file = input.files[0], tid = input.dataset.target || currentUser.uid;
    if (!file) return;
    const fd = new FormData(); fd.append("image", file);
    try {
        const r = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, { method: "POST", body: fd });
        const res = await r.json();
        if (res.success) await db.ref('users/' + tid).update({ photoURL: res.data.url });
    } catch (e) { toast("Error อัปโหลดรูป", "error"); }
}

function go(id, btn) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

function moveMonth(v) { viewDate.setMonth(viewDate.getMonth() + v); renderCal(); }
function toast(m, i="success") { Swal.fire({ title: m, icon: i, timer: 1500, showConfirmButton: false, background: '#1c1c1e', color: '#fff' }); }

function confirmLogout() { 
    Swal.fire({
        title: 'ยืนยันออกจากระบบ?',
        text: "คุณต้องเข้าสู่ระบบใหม่หากต้องการใช้งานต่อ",
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'ออกจากระบบ',
        cancelButtonText: 'ยกเลิก',
        background: '#1c1c1e',
        color: '#fff'
    }).then(r => { if (r.isConfirmed) auth.signOut(); }); 
}
