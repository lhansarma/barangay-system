// admin.js
const SUPABASE_URL = 'https://kbngzddelbmpdbhxevon.supabase.co';
const SUPABASE_KEY = 'sb_publishable_acy7Ulw_hTPGY4zPVSBUoA_xm0HeXb_';
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

let currentAdminId = null;
let currentAdminName = '';
let allRequestsData = [];
let paymentData = [];
let reportData = []; 

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
    
    const nameEl = document.getElementById('admin-name');
    if (nameEl) nameEl.textContent = currentAdminName;

    // Route to specific page logic
    if (document.getElementById('admin-table-body')) initAdminDashboard();
    if (document.getElementById('upload-form')) initAdminUpload();
    if (document.getElementById('log-body')) initAuditLogs();
    if (document.getElementById('report-table-body')) initAdminReports();
    if (document.getElementById('payment-table-body')) initAdminPaymentRecords(); // NEW
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
    await fetchRequests();
    fetchDocCount();
    
    document.getElementById('search-input').addEventListener('input', filterAndRenderTable);
    document.getElementById('status-filter').addEventListener('change', filterAndRenderTable);
}

async function fetchRequests() {
    const tbody = document.getElementById('admin-table-body');
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 20px;">Loading data...</td></tr>`;

    const { data, error } = await supabaseClient
        .from('requests')
        .select(`*, pickups ( pickup_date, pickup_time )`)
        .order('date_requested', { ascending: false });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#ff6b6b;">Failed to load data: ${error.message}</td></tr>`;
        return;
    }

    allRequestsData = data; 
    filterAndRenderTable(); 
}

function filterAndRenderTable() {
    const tbody = document.getElementById('admin-table-body');
    tbody.innerHTML = '';

    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const statusFilter = document.getElementById('status-filter').value;

    const filteredData = allRequestsData.filter(req => {
        const matchesSearch = req.fullname.toLowerCase().includes(searchTerm);
        const matchesStatus = statusFilter === '' || req.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    let pending = 0;
    allRequestsData.forEach(req => { if(req.status === 'Pending') pending++; });
    document.getElementById('total-req').textContent = allRequestsData.length;
    document.getElementById('pending-req').textContent = pending;

    if (filteredData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 25px; color: rgba(255,255,255,0.5);">No requests found matching your filters.</td></tr>`;
        return;
    }

    filteredData.forEach(req => {
        const pickupData = req.pickups && req.pickups.length > 0 ? req.pickups[0] : null;

        let pickupHtml = '<span style="color: rgba(255,255,255,0.3); font-size: 12px;">Not Scheduled</span>';
        if (pickupData) {
            const pDate = new Date(pickupData.pickup_date).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
            pickupHtml = `
                <div style="font-size: 12px; font-weight: bold; color: #2ecc71;">${pDate}</div>
                <div style="font-size: 11px; color: rgba(255,255,255,0.7);">${pickupData.pickup_time}</div>
            `;
        }

        let paymentHtml = '';
        if (req.payment_status === 'Paid') {
            paymentHtml = `
                <span style="background: rgba(39, 174, 96, 0.3); color: #2ecc71; border: 1px solid #2ecc71; padding: 4px 8px; border-radius: 8px; font-size: 12px; font-weight: bold;">Paid (₱${req.amount_to_pay || 0})</span>
                <select class="update-select" style="margin-top: 5px; font-size: 10px;" onchange="updatePaymentStatus(${req.id}, this.value)">
                    <option value="Paid" selected>Paid</option>
                    <option value="Unpaid">Mark as Unpaid</option>
                </select>
            `;
        } else {
            paymentHtml = `
                <span style="background: rgba(231, 76, 60, 0.3); color: #e74c3c; border: 1px solid #e74c3c; padding: 4px 8px; border-radius: 8px; font-size: 12px; font-weight: bold;">Unpaid (₱${req.amount_to_pay || 0})</span>
                <select class="update-select" style="margin-top: 5px; font-size: 10px;" onchange="updatePaymentStatus(${req.id}, this.value)">
                    <option value="Unpaid" selected>Unpaid</option>
                    <option value="Paid">Mark as Paid</option>
                </select>
            `;
        }

        let actionHtml = '';
        if (req.status === 'Pending') {
            actionHtml = `
                <button class="btn-sm btn-approve" onclick="updateStatus(${req.id}, 'Approved', this)">Approve & Set Fee</button>
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
            <td>${paymentHtml}</td>
            <td>${pickupHtml}</td>
            <td>${actionHtml}</td>
        `;
        tbody.appendChild(tr);
    });
}

async function fetchDocCount() {
    const { count: totalDocs } = await supabaseClient.from('documents').select('*', { count: 'exact', head: true });
    const { count: pendingDocs } = await supabaseClient.from('documents').select('*', { count: 'exact', head: true }).eq('status', 'Pending');
    document.getElementById('total-docs').textContent = totalDocs || 0;
    document.getElementById('pending-docs').textContent = pendingDocs || 0;
}

async function updateStatus(id, newStatus, btnElement) {
    let amountToPay = null;
    if (newStatus === 'Approved') {
        const input = prompt("Enter the fee amount (₱) for this document:", "50");
        if (input === null) return; 
        amountToPay = parseFloat(input);
        if (isNaN(amountToPay) || amountToPay < 0) { alert("Invalid amount."); return; }
    } else {
        if (!confirm(`Are you sure you want to mark request #${id} as ${newStatus}?`)) return;
    }

    btnElement.textContent = '...';
    btnElement.disabled = true;

    const updateData = { status: newStatus };
    if (amountToPay !== null) updateData.amount_to_pay = amountToPay;

    const { error } = await supabaseClient.from('requests').update(updateData).eq('id', id);

    if (error) {
        alert("Database Error: " + error.message);
        fetchRequests();
    } else {
        await supabaseClient.from('audit_logs').insert([{
            admin_name: currentAdminName,
            action: `Marked Request #${id} as ${newStatus}` + (amountToPay !== null ? ` with fee ₱${amountToPay}` : ''),
            target_id: 'Request #' + id
        }]);
        fetchRequests();
    }
}

async function updatePaymentStatus(id, newStatus) {
    const { error } = await supabaseClient.from('requests').update({ payment_status: newStatus }).eq('id', id);

    if (error) {
        alert("Database Error: " + error.message);
    } else {
        await supabaseClient.from('audit_logs').insert([{
            admin_name: currentAdminName,
            action: `Manually marked payment for Request #${id} as ${newStatus}`,
            target_id: 'Request #' + id
        }]);
        fetchRequests();
    }
}

// =========================================
// 2. PAYMENT RECORDS LOGIC
// =========================================
async function initAdminPaymentRecords() {
    const tbody = document.getElementById('payment-table-body');
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 20px;">Loading data...</td></tr>`;

    const { data, error } = await supabaseClient
        .from('requests')
        .select('*')
        .order('date_requested', { ascending: false });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:red;">${error.message}</td></tr>`;
        return;
    }

    paymentData = data;
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 20px;">No transaction records found.</td></tr>`;
        return;
    }

    data.forEach(req => {
        const reqDate = new Date(req.date_requested).toLocaleDateString();
        
        let refNo = 'N/A';
        let method = 'N/A';
        if (req.notes && req.notes.includes('GCash Ref:')) {
            refNo = req.notes.replace('GCash Ref:', '').trim();
            method = 'GCash';
        } else if (req.payment_status === 'Paid') {
            method = 'Cash (Walk-in)';
        }

        const statusColor = req.payment_status === 'Paid' ? '#2ecc71' : '#e74c3c';

        tbody.innerHTML += `
            <tr>
                <td>#${req.id}</td>
                <td class="font-medium">${req.fullname}</td>
                <td>${req.doc_type}</td>
                <td class="font-bold text-green-400">₱${parseFloat(req.amount_to_pay || 0).toFixed(2)}</td>
                <td>
                    <div style="font-size: 12px; font-weight: bold; color: #1aa6f8;">${method}</div>
                    <div style="font-size: 11px; color: rgba(255,255,255,0.7);">${refNo}</div>
                </td>
                <td><span style="color: ${statusColor}; font-weight: bold;">${req.payment_status}</span></td>
                <td>${reqDate}</td>
            </tr>
        `;
    });
}

function exportPaymentCSV() {
    if(paymentData.length === 0) return alert("No data to export.");
    
    let csv = "Request #,Resident Name,Document Type,Amount,Method,Reference No,Status,Date\n";
    
    paymentData.forEach(req => {
        const reqDate = new Date(req.date_requested).toLocaleDateString();
        let refNo = 'N/A';
        let method = 'N/A';
        if (req.notes && req.notes.includes('GCash Ref:')) {
            refNo = req.notes.replace('GCash Ref:', '').trim();
            method = 'GCash';
        } else if (req.payment_status === 'Paid') {
            method = 'Cash';
        }
        
        csv += `"${req.id}","${req.fullname}","${req.doc_type}","${req.amount_to_pay || 0}","${method}","${refNo}","${req.payment_status}","${reqDate}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `payment_records_${Date.now()}.csv`; a.click();
}

// =========================================
// 3. UPLOAD LOGIC
// =========================================
async function initAdminUpload() {
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
// 4. AUDIT LOGS LOGIC
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

// =========================================
// 5. REPORTS LOGIC
// =========================================
async function initAdminReports() {
    const tbody = document.getElementById('report-table-body');
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 20px;">Loading data...</td></tr>`;

    const { data, error } = await supabaseClient
        .from('requests')
        .select(`*, pickups ( pickup_date, pickup_time )`)
        .order('date_requested', { ascending: false });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:red;">${error.message}</td></tr>`;
        return;
    }

    reportData = data;
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 20px;">No report data found.</td></tr>`;
        return;
    }

    data.forEach(req => {
        const pickupData = req.pickups && req.pickups.length > 0 ? req.pickups[0] : null;
        const reqDate = new Date(req.date_requested).toLocaleDateString();
        const pickupDate = pickupData ? new Date(pickupData.pickup_date).toLocaleDateString() : 'N/A';
        const pickupTime = pickupData ? pickupData.pickup_time : 'N/A';

        tbody.innerHTML += `
            <tr>
                <td>#${req.id}</td>
                <td class="font-medium">${req.fullname}</td>
                <td>${req.doc_type}</td>
                <td>${reqDate}</td>
                <td><span class="status ${req.status}">${req.status}</span></td>
                <td>${pickupDate}</td>
                <td>${pickupTime}</td>
            </tr>
        `;
    });
}

function exportReportCSV() {
    if(reportData.length === 0) return alert("No data to export.");
    
    let csv = "Request #,Resident Name,Document Type,Date Requested,Status,Pickup Date,Pickup Time\n";
    
    reportData.forEach(req => {
        const pickupData = req.pickups && req.pickups.length > 0 ? req.pickups[0] : null;
        const reqDate = new Date(req.date_requested).toLocaleDateString();
        const pickupDate = pickupData ? new Date(pickupData.pickup_date).toLocaleDateString() : 'N/A';
        const pickupTime = pickupData ? pickupData.pickup_time : 'N/A';
        
        csv += `"${req.id}","${req.fullname}","${req.doc_type}","${reqDate}","${req.status}","${pickupDate}","${pickupTime}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `requests_report_${Date.now()}.csv`; a.click();
}

function showAlert(id, msg) {
    const el = document.getElementById(id);
    if(!el) return;
    el.textContent = msg; el.style.display = 'block';
}