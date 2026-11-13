// admin.js
const SUPABASE_URL = 'https://kbngzddelbmpdbhxevon.supabase.co';
const SUPABASE_KEY = 'sb_publishable_acy7Ulw_hTPGY4zPVSBUoA_xm0HeXb_';
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

let currentAdminId = null;
let currentAdminName = '';

// Global Init
window.addEventListener('DOMContentLoaded', async () => {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error || !session) {
        window.location.href = 'login.html';
        return;
    }
    
    const role = session.user.user_metadata?.role;
    currentAdminName = session.user.user_metadata?.full_name || session.user.email;

    if (role !== 'admin') {
        alert("Access Denied. You are not an admin.");
        window.location.href = 'resident_dashboard.html';
        return;
    }

    currentAdminId = session.user.id;
    
    // Set admin name in sidebar safely
    const nameEl = document.getElementById('admin-name');
    if (nameEl) nameEl.textContent = currentAdminName;

    // Route to specific page logic
    if (document.getElementById('admin-table-body')) initAdminDashboard();
    if (document.getElementById('upload-form')) initAdminUpload();
    if (document.getElementById('log-body')) initAuditLogs();
});

async function handleLogout(e) {
    e.preventDefault();
    await supabaseClient.auth.signOut();
    window.location.href = 'login.html';
}

// =========================================
// 1. ADMIN DASHBOARD LOGIC
// =========================================
async function initAdminDashboard() {
    fetchRequests();
    fetchDocCount();
}

async function fetchRequests() {
    const tbody = document.getElementById('admin-table-body');
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 20px;">Loading data from database...</td></tr>`;

    const { data, error } = await supabaseClient
        .from('requests')
        .select(`*, pickups ( pickup_date, pickup_time )`)
        .order('date_requested', { ascending: false });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#ff6b6b;">Failed to load data: ${error.message}</td></tr>`;
        return;
    }

    const table = document.getElementById('requests-table');
    const emptyState = document.getElementById('empty-state');
    let pending = 0, ready = 0, approved = 0;

    if (data.length > 0) {
        tbody.innerHTML = '';
        data.forEach(req => {
            if(req.status === 'Pending') pending++;
            if(req.status === 'Approved') approved++;

            const pickupData = req.pickups && req.pickups.length > 0 ? req.pickups[0] : null;

            let pickupHtml = '<span style="color: rgba(255,255,255,0.3); font-size: 12px;">Not Scheduled</span>';
            if (pickupData) {
                const pDate = new Date(pickupData.pickup_date).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
                pickupHtml = `
                    <div style="font-size: 12px; font-weight: bold; color: #2ecc71;">${pDate}</div>
                    <div style="font-size: 11px; color: rgba(255,255,255,0.7);">${pickupData.pickup_time}</div>
                `;
            }

            let actionHtml = '';
            if (req.status === 'Pending') {
                actionHtml = `
                    <button class="btn-sm btn-approve" onclick="updateStatus(${req.id}, 'Approved', this)">Approve</button>
                    <button class="btn-sm btn-reject" onclick="updateStatus(${req.id}, 'Rejected', this)">Reject</button>
                `;
            } else if (req.status === 'Approved') {
                actionHtml = `<a href="generate_pdf.html?id=${req.id}" target="_blank" class="btn-sm btn-pdf">View PDF</a>`;
            } else {
                actionHtml = `<span style="color: rgba(255,255,255,0.4); font-size: 12px;">Completed</span>`;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>#${req.id}</td>
                <td class="font-medium">${req.fullname}</td>
                <td>${req.doc_type}</td>
                <td><span class="status ${req.status}">${req.status}</span></td>
                <td>${pickupHtml}</td>
                <td>${actionHtml}</td>
            `;
            tbody.appendChild(tr);
        });

        document.getElementById('total-req').textContent = data.length;
        document.getElementById('pending-req').textContent = pending;
        if(table) table.style.display = 'table';
    } else {
        if(table) table.style.display = 'none';
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 25px; color: rgba(255,255,255,0.5);">No requests found.</td></tr>`;
    }
}

async function fetchDocCount() {
    const { count: totalDocs } = await supabaseClient.from('documents').select('*', { count: 'exact', head: true });
    const { count: pendingDocs } = await supabaseClient.from('documents').select('*', { count: 'exact', head: true }).eq('status', 'Pending');
    document.getElementById('total-docs').textContent = totalDocs || 0;
    document.getElementById('pending-docs').textContent = pendingDocs || 0;
}

async function updateStatus(id, newStatus, btnElement) {
    if (!confirm(`Are you sure you want to mark request #${id} as ${newStatus}?`)) return;
    btnElement.textContent = '...';
    btnElement.disabled = true;

    const { error } = await supabaseClient.from('requests').update({ status: newStatus }).eq('id', id);

    if (error) {
        alert("Database Error: " + error.message);
        fetchRequests();
    } else {
        await supabaseClient.from('audit_logs').insert([{
            admin_name: currentAdminName,
            action: `Marked Request #${id} as ${newStatus}`,
            target_id: 'Request #' + id
        }]);
        fetchRequests();
    }
}

// =========================================
// 2. UPLOAD LOGIC
// =========================================
async function initAdminUpload() {
    // Load Requests for Dropdown
    const { data } = await supabaseClient.from('requests').select('id, doc_type, fullname').order('id', { ascending: false });
    const select = document.getElementById('request_id');
    select.innerHTML = '<option value="">-- Select Request --</option>';
    if(data.length === 0) select.innerHTML += '<option value="" disabled>No requests found</option>';
    else data.forEach(req => select.innerHTML += `<option value="${req.id}">Req #${req.id} - ${req.fullname} (${req.doc_type})</option>`);
    
    loadAllDocuments();
}

async function loadAllDocuments() {
    const { data, error } = await supabaseClient.from('documents').select(`*, requests ( fullname )`).order('id', { ascending: false });
    const tbody = document.getElementById('docs-table-body');
    tbody.innerHTML = '';

    if (error || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">No documents uploaded yet.</td></tr>';
        return;
    }

    data.forEach(doc => {
        const fileUrl = doc.file_path;
        const storageFileName = fileUrl.split('/').pop(); 
        const residentName = doc.requests?.fullname || 'Unknown Resident';

        tbody.innerHTML += `
            <tr>
                <td>#${doc.request_id}</td>
                <td class="font-medium">${residentName}</td>
                <td>${doc.document_type}</td>
                <td>${doc.file_name}</td>
                <td><span class="status ${doc.status}">${doc.status}</span></td>
                <td>
                    <a href="${fileUrl}" target="_blank" class="btn-sm btn-view">View</a>
                    <button onclick="editDocStatus(${doc.id}, '${doc.status}')" class="btn-sm btn-update">Update</button>
                    <button onclick="deleteDoc(${doc.id}, '${storageFileName}')" class="btn-sm btn-delete">Delete</button>
                </td>
            </tr>
        `;
    });
}

async function handleUpload(e) {
    e.preventDefault();
    const btn = document.getElementById('upload-btn');
    btn.disabled = true; btn.textContent = 'Uploading...';

    const reqId = document.getElementById('request_id').value;
    const docType = document.getElementById('document_type').value;
    const file = document.getElementById('document_file').files[0];

    if (!file) { showAlert('error-box', "Please select a file."); btn.disabled = false; btn.textContent = 'Upload Document'; return false; }

    const fileExt = file.name.split('.').pop();
    const fileName = `admin_${currentAdminId}_${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabaseClient.storage.from('documents').upload(fileName, file);
    if (uploadError) { showAlert('error-box', "Upload failed: " + uploadError.message); btn.disabled = false; btn.textContent = 'Upload Document'; return false; }

    const { data: urlData } = supabaseClient.storage.from('documents').getPublicUrl(fileName);

    const { error: dbError } = await supabaseClient.from('documents').insert([{
        request_id: reqId, resident_id: currentAdminId, document_type: docType,
        file_name: file.name, file_path: urlData.publicUrl, status: 'Pending'
    }]);

    btn.disabled = false; btn.textContent = 'Upload Document';

    if (dbError) { showAlert('error-box', "DB error: " + dbError.message); }
    else {
        showAlert('success-box', `✅ Document uploaded to Request #${reqId}`);
        document.getElementById('upload-form').reset();
        loadAllDocuments(); 
    }
    return false;
}

async function editDocStatus(docId, currentStatus) {
    const newStatus = prompt("Enter new status (Pending, Approved, Rejected):", currentStatus);
    if (!newStatus) return;
    const formattedStatus = newStatus.charAt(0).toUpperCase() + newStatus.slice(1).toLowerCase();
    if (!['Pending', 'Approved', 'Rejected'].includes(formattedStatus)) { alert("Invalid status."); return; }

    const { error } = await supabaseClient.from('documents').update({ status: formattedStatus }).eq('id', docId);
    if (error) alert("Error updating: " + error.message);
    else loadAllDocuments();
}

async function deleteDoc(docId, storageFileName) {
    if (!confirm("Are you sure you want to delete this document?")) return;
    const { error: dbError } = await supabaseClient.from('documents').delete().eq('id', docId);
    if (dbError) { alert("Failed to delete: " + dbError.message); return; }
    await supabaseClient.storage.from('documents').remove([storageFileName]);
    loadAllDocuments();
}

// =========================================
// 3. AUDIT LOGS LOGIC
// =========================================
let logsData = [];
async function initAuditLogs() {
    const { data } = await supabaseClient.from('audit_logs').select('*').order('created_at', { ascending: false });
    logsData = data || [];
    const tbody = document.getElementById('log-body');
    tbody.innerHTML = '';

    if(logsData.length === 0) { tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4">No logs found.</td></tr>'; return; }

    logsData.forEach(log => {
        tbody.innerHTML += `
            <tr class="border-b border-white/10 hover:bg-white/5">
                <td class="py-3">${new Date(log.created_at).toLocaleString()}</td>
                <td class="py-3">${log.admin_name}</td>
                <td class="py-3 font-bold text-blue-300">${log.action}</td>
                <td class="py-3">${log.target_id}</td>
            </tr>
        `;
    });
}

function exportCSV() {
    if(logsData.length === 0) return alert("No data to export.");
    let csv = "Date,Admin,Action,Target ID\n";
    logsData.forEach(l => { csv += `"${new Date(l.created_at).toLocaleString()}","${l.admin_name}","${l.action}","${l.target_id}"\n`; });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `audit_logs_${Date.now()}.csv`; a.click();
}

function showAlert(id, msg) {
    const el = document.getElementById(id);
    if(!el) return;
    el.textContent = msg; el.style.display = 'block';
}