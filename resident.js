// resident.js
const SUPABASE_URL = 'https://kbngzddelbmpdbhxevon.supabase.co';
const SUPABASE_KEY = 'sb_publishable_acy7Ulw_hTPGY4zPVSBUoA_xm0HeXb_';
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUserId = null;
let currentUserSession = null;

// Global Init
window.addEventListener('DOMContentLoaded', async () => {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error || !session) {
        window.location.href = 'login.html';
        return;
    }
    
    currentUserId = session.user.id;
    currentUserSession = session;
    const fullName = session.user.user_metadata?.full_name || session.user.email;
    
    // Set Sidebar Name if it exists
    const nameEl = document.getElementById('user-name');
    const nameTopEl = document.getElementById('user-name-top');
    if (nameEl) nameEl.textContent = fullName;
    if (nameTopEl) nameTopEl.textContent = fullName.split(' ')[0];

    // Route to specific page logic based on what's on the DOM
    if (document.getElementById('table-body')) loadDashboard();
    if (document.getElementById('request-form')) initRequestForm();
    if (document.getElementById('upload-form')) initUploadForm();
    if (document.getElementById('profile-form')) initProfileForm();
});

async function handleLogout(e) {
    e.preventDefault();
    await supabaseClient.auth.signOut();
    window.location.href = 'login.html';
}

// =========================================
// 1. DASHBOARD LOGIC
// =========================================
async function loadDashboard() {
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 20px;">Loading...</td></tr>`;

    const { data, error } = await supabaseClient
        .from('requests')
        .select(`*, pickups ( pickup_date, pickup_time )`)
        .eq('user_id', currentUserId)
        .order('date_requested', { ascending: false });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:red;">${error.message}</td></tr>`;
        return;
    }

    const table = document.getElementById('requests-table');
    const emptyState = document.getElementById('empty-state');
    let pending = 0, ready = 0, approved = 0;

    if (data.length > 0) {
        tbody.innerHTML = '';
        data.forEach(req => {
            if(req.status === 'Pending') pending++;
            if(req.status === 'Ready') ready++;
            if(req.status === 'Approved') approved++;

            const pickupData = req.pickups && req.pickups.length > 0 ? req.pickups[0] : null;

            let pickupHtml = '<span style="color: rgba(255,255,255,0.3); font-size: 12px;">Not Scheduled</span>';
            if (pickupData) {
                const pDate = new Date(pickupData.pickup_date).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
                pickupHtml = `
                    <div style="font-size: 13px; font-weight: bold; color: #2ecc71;">${pDate}</div>
                    <div style="font-size: 12px; color: rgba(255,255,255,0.7); margin-bottom: 5px;">${pickupData.pickup_time}</div>
                    <a href="pickup.html?id=${req.id}" class="btn-action btn-edit-pickup">Edit Date</a>
                `;
            }

            let actionHtml = `<span style="color: rgba(255,255,255,0.4); font-size: 12px;">No Action Needed</span>`;
            if (req.status === 'Approved') {
                if (!pickupData) {
                    actionHtml = `<a href="pickup.html?id=${req.id}" class="btn-action btn-pickup">Set Pickup</a>`;
                } else {
                    actionHtml = `<span style="color: #2ecc71; font-size: 12px; font-weight: bold;">Ready for Pickup</span>`;
                }
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>#BRGY-${req.id}</td>
                <td class="font-medium">${req.doc_type}</td>
                <td><span class="status ${req.status}">${req.status}</span></td>
                <td>${pickupHtml}</td>
                <td>${actionHtml}</td>
            `;
            tbody.appendChild(tr);
        });

        document.getElementById('total-count').textContent = data.length;
        document.getElementById('pending-count').textContent = pending;
        document.getElementById('ready-count').textContent = ready;
        document.getElementById('approved-count').textContent = approved;
        table.style.display = 'table';

    } else {
        table.style.display = 'none';
        emptyState.classList.remove('hidden');
    }
}

// =========================================
// 2. REQUEST FORM LOGIC
// =========================================
let selectedDocType = "";
function initRequestForm() {
    document.getElementById('fullname').value = currentUserSession.user.user_metadata?.full_name || '';
    document.getElementById('contact').value = currentUserSession.user.user_metadata?.contact_number || '';
    document.getElementById('address').value = currentUserSession.user.user_metadata?.address || '';
}

function selectDocument(value) {
    const options = Array.from(document.querySelectorAll('#doc_options option')).map(opt => opt.value);
    if (options.includes(value)) {
        selectedDocType = value;
        document.getElementById('purpose-container').style.display = 'block';
        document.getElementById('purpose_input').required = true; 
    } else {
        selectedDocType = "";
        document.getElementById('purpose-container').style.display = 'none';
        document.getElementById('purpose_input').required = false;
    }
}

async function handleRequest(e) {
    e.preventDefault();
    if (!selectedDocType) {
        showAlert('error-box', "Please select a valid Document Type from the search list.");
        return false;
    }

    const btn = document.getElementById('submit-btn');
    btn.disabled = true; btn.textContent = 'Submitting...';

    const { error } = await supabaseClient.from('requests').insert([{
        user_id: currentUserId,
        doc_type: selectedDocType,
        fullname: document.getElementById('fullname').value,
        contact: document.getElementById('contact').value,
        address: document.getElementById('address').value,
        years_residency: document.getElementById('years_residency').value || null,
        notes: document.getElementById('notes').value,
        purpose: document.getElementById('purpose_input').value,
        status: 'Pending'
    }]);

    btn.disabled = false; btn.textContent = 'Submit Request';

    if (error) {
        showAlert('error-box', "Error: " + error.message);
    } else {
        document.getElementById('request-form').style.display = 'none';
        showAlert('success-box', "✅ Request submitted successfully! Redirecting...");
        setTimeout(() => { window.location.href = 'resident_dashboard.html'; }, 2000);
    }
    return false;
}

// =========================================
// 3. UPLOAD LOGIC
// =========================================
async function initUploadForm() {
    const { data } = await supabaseClient.from('requests').select('id, doc_type').eq('user_id', currentUserId).eq('status', 'Pending');
    const select = document.getElementById('request_id');
    select.innerHTML = '<option value="">-- Select Pending Request --</option>';
    if(data.length === 0) select.innerHTML += '<option value="" disabled>No pending requests found</option>';
    else data.forEach(req => select.innerHTML += `<option value="${req.id}">Request #${req.id} - ${req.doc_type}</option>`);
    
    loadDocuments();
}

async function loadDocuments() {
    const { data, error } = await supabaseClient.from('documents').select('*').eq('resident_id', currentUserId).order('id', { ascending: false });
    const tbody = document.getElementById('docs-table-body');
    tbody.innerHTML = '';

    if (error || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px;">No documents uploaded yet.</td></tr>';
        return;
    }

    data.forEach(doc => {
        let officialDocHtml = '<span style="color: rgba(255,255,255,0.3); font-size: 12px;">Not available yet</span>';
        if (doc.document_type === 'Approved Certificate' && doc.file_path) {
            officialDocHtml = `<a href="${doc.file_path}" target="_blank" class="btn-action btn-primary">📄 View PDF</a>`;
        }

        tbody.innerHTML += `
            <tr>
                <td>Req #${doc.request_id}</td>
                <td>${doc.document_type}</td>
                <td>${doc.file_name}</td>
                <td><a href="${doc.file_path}" target="_blank" class="btn-action btn-primary">Preview</a></td>
                <td><span class="status ${doc.status}">${doc.status}</span></td>
                <td><a href="${doc.file_path}" download class="btn-action btn-success">⬇ DL</a></td>
                <td>${officialDocHtml}</td>
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

    if (!file || file.size > 5000000) {
        showAlert('error-box', "Invalid file. Max size is 5MB.");
        btn.disabled = false; btn.textContent = 'Upload Document'; return false;
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `${currentUserId}_${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabaseClient.storage.from('documents').upload(fileName, file);
    if (uploadError) {
        showAlert('error-box', "Upload failed: " + uploadError.message);
        btn.disabled = false; btn.textContent = 'Upload Document'; return false;
    }

    const { data: urlData } = supabaseClient.storage.from('documents').getPublicUrl(fileName);

    const { error: dbError } = await supabaseClient.from('documents').insert([{
        request_id: reqId, resident_id: currentUserId, document_type: docType,
        file_name: file.name, file_path: urlData.publicUrl, status: 'Pending'
    }]);

    btn.disabled = false; btn.textContent = 'Upload Document';

    if (dbError) showAlert('error-box', "Database error: " + dbError.message);
    else {
        showAlert('success-box', `✅ Document uploaded to Request #${reqId}`);
        document.getElementById('upload-form').reset();
        loadDocuments();
    }
    return false;
}

// =========================================
// 4. PROFILE LOGIC
// =========================================
function initProfileForm() {
    const meta = currentUserSession.user.user_metadata || {};
    const fullName = meta.full_name || currentUserSession.user.email;

    document.getElementById('avatar-initial').textContent = fullName.charAt(0).toUpperCase();
    document.getElementById('profile-name').textContent = fullName;
    document.getElementById('profile-email').textContent = currentUserSession.user.email;
    document.getElementById('val-role').textContent = meta.role === 'admin' ? 'Administrator' : 'Resident';
    document.getElementById('val-contact').textContent = meta.contact_number || 'N/A';
    document.getElementById('val-gender').textContent = meta.gender || 'N/A';
    document.getElementById('val-address').textContent = meta.address || 'N/A';
    
    document.getElementById('edit-contact').value = meta.contact_number || '';
    document.getElementById('edit-gender').value = meta.gender || 'Male';
    document.getElementById('edit-address').value = meta.address || '';
    document.getElementById('edit-birthdate').value = meta.birthdate || '';

    let bdate = meta.birthdate || 'N/A';
    if (bdate !== 'N/A') bdate = new Date(bdate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    document.getElementById('val-birthdate').textContent = bdate;
}

function toggleEditMode(isEditing) {
    document.querySelectorAll('.info-value').forEach(el => el.style.display = isEditing ? 'none' : 'block');
    document.querySelectorAll('.info-input').forEach(el => el.style.display = isEditing ? 'block' : 'none');
    document.getElementById('btn-edit').style.display = isEditing ? 'none' : 'block';
    document.getElementById('btn-save').style.display = isEditing ? 'block' : 'none';
    document.getElementById('success-alert').style.display = 'none';
}

async function saveProfile(e) {
    e.preventDefault();
    const btnSave = document.getElementById('btn-save');
    btnSave.disabled = true; btnSave.textContent = 'Saving...';

    const { error } = await supabaseClient.auth.updateUser({
        data: {
            contact_number: document.getElementById('edit-contact').value.trim(),
            gender: document.getElementById('edit-gender').value,
            address: document.getElementById('edit-address').value.trim(),
            birthdate: document.getElementById('edit-birthdate').value
        }
    });

    btnSave.disabled = false; btnSave.textContent = '💾 Save Changes';

    if (error) alert("Error updating profile: " + error.message);
    else {
        const { data: { session } } = await supabaseClient.auth.getSession();
        currentUserSession = session;
        initProfileForm();
        toggleEditMode(false);
        document.getElementById('success-alert').style.display = 'block';
        setTimeout(() => { document.getElementById('success-alert').style.display = 'none'; }, 3000);
    }
    return false;
}

// Utility
function showAlert(id, msg) {
    const el = document.getElementById(id);
    if(!el) return;
    el.textContent = msg; el.style.display = 'block';
}