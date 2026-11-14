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
    
    const nameEl = document.getElementById('user-name');
    const nameTopEl = document.getElementById('user-name-top');
    if (nameEl) nameEl.textContent = fullName;
    if (nameTopEl) nameTopEl.textContent = fullName.split(' ')[0];

    // Route to specific page logic based on what's on the DOM
    if (document.getElementById('table-body')) loadDashboard();
    if (document.getElementById('request-form')) initRequestForm();
    if (document.getElementById('docs-table-body')) loadReceivedDocuments();
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
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 20px;">Loading...</td></tr>`;

    const { data, error } = await supabaseClient
        .from('requests')
        .select(`*, pickups ( pickup_date, pickup_time )`)
        .eq('user_id', currentUserId)
        .order('date_requested', { ascending: false });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:red;">${error.message}</td></tr>`;
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

            let paymentHtml = '';
            if (req.payment_status === 'Paid') {
                paymentHtml = `<span style="color: #2ecc71; font-weight: bold; font-size: 13px;">✅ Paid (₱${req.amount_to_pay || 0})</span>`;
            } else {
                paymentHtml = `<span style="color: #e74c3c; font-weight: bold; font-size: 13px;">❌ Unpaid (₱${req.amount_to_pay || 0})</span>`;
            }

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
                actionHtml = '';
                
                if (req.payment_status !== 'Paid') {
                    actionHtml += `<a href="payment.html?id=${req.id}" class="btn-action btn-pay" style="background: #f39c12; color: white; margin-right: 5px; margin-bottom: 5px;">Pay ₱${req.amount_to_pay || 0}</a>`;
                }

                if (!pickupData) {
                    actionHtml += `<a href="pickup.html?id=${req.id}" class="btn-action btn-pickup" style="margin-bottom: 5px;">Set Pickup</a>`;
                } else {
                    actionHtml += `<span style="color: #2ecc71; font-size: 12px; font-weight: bold; display: block; margin-top: 5px;">Ready for Pickup</span>`;
                }
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>#BRGY-${req.id}</td>
                <td class="font-medium">${req.doc_type}</td>
                <td><span class="status ${req.status}">${req.status}</span></td>
                <td>${paymentHtml}</td>
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
        status: 'Pending',
        payment_status: 'Unpaid',
        amount_to_pay: 0 
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
// 3. RECEIVED DOCUMENTS LOGIC (FIXED)
// =========================================
async function loadReceivedDocuments() {
    const tbody = document.getElementById('docs-table-body');
    const table = document.querySelector('table');
    const emptyState = document.getElementById('empty-state');

    if (!tbody || !table || !emptyState) return;

    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 20px;">Loading documents...</td></tr>`;

    // Step 1: Get request IDs owned by this resident
    const { data: userRequests, error: reqError } = await supabaseClient
        .from('requests')
        .select('id')
        .eq('user_id', currentUserId);

    if (reqError) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:red;">${reqError.message}</td></tr>`;
        return;
    }

    const requestIds = (userRequests || []).map(r => r.id);

    if (requestIds.length === 0) {
        table.style.display = 'none';
        emptyState.classList.remove('hidden');
        return;
    }

    // Step 2: Fetch documents linked to those requests
    const { data, error } = await supabaseClient
        .from('documents')
        .select('*')
        .in('request_id', requestIds)
        .order('id', { ascending: false });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:red;">${error.message}</td></tr>`;
        return;
    }

    if (!data || data.length === 0) {
        table.style.display = 'none';
        emptyState.classList.remove('hidden');
        return;
    }

    table.style.display = 'table';
    emptyState.classList.add('hidden');
    tbody.innerHTML = '';

    data.forEach(doc => {
        const dateObj = new Date(doc.uploaded_at || Date.now());
        const formattedDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });

        // SVG Icons
        const previewIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block; vertical-align:middle; margin-right:4px; margin-bottom:2px;"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>`;
        
        const downloadIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block; vertical-align:middle; margin-right:4px; margin-bottom:2px;"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>`;

        tbody.innerHTML += `
            <tr>
                <td>#BRGY-${doc.request_id}</td>
                <td class="font-medium text-green-400">${doc.document_type}</td>
                <td>${doc.file_name}</td>
                <td>${formattedDate}</td>
                <td>
                    <a href="${doc.file_path}" target="_blank" class="btn-action btn-primary" style="margin-right: 5px; display: inline-flex; align-items: center;">
                        ${previewIcon} Preview
                    </a>
                    <a href="${doc.file_path}" download class="btn-action btn-success" style="display: inline-flex; align-items: center;">
                        ${downloadIcon} Download
                    </a>
                </td>
            </tr>
        `;
    });
}

// =========================================
// 4. PROFILE LOGIC
// =========================================
function initProfileForm() {
    const meta = currentUserSession.user.user_metadata || {};
    const fullName = meta.full_name || currentUserSession.user.email;

    // Header info
    document.getElementById('avatar-initial').textContent = fullName.charAt(0).toUpperCase();
    document.getElementById('profile-name').textContent = fullName;
    document.getElementById('profile-email').textContent = currentUserSession.user.email;
    
    // Display values
    document.getElementById('val-name').textContent = fullName;
    document.getElementById('val-role').textContent = meta.role === 'admin' ? 'Administrator' : 'Resident';
    document.getElementById('val-contact').textContent = meta.contact_number || 'N/A';
    document.getElementById('val-gender').textContent = meta.gender || 'N/A';
    document.getElementById('val-address').textContent = meta.address || 'N/A';
    
    // Input values (for editing)
    document.getElementById('edit-name').value = fullName;
    document.getElementById('edit-contact').value = meta.contact_number || '';
    document.getElementById('edit-gender').value = meta.gender || 'Male';
    document.getElementById('edit-address').value = meta.address || '';
    document.getElementById('edit-birthdate').value = meta.birthdate || '';

    // Format birthdate for display
    let bdate = meta.birthdate || 'N/A';
    if (bdate !== 'N/A') {
        const d = new Date(bdate);
        d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
        bdate = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }
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

    const newName = document.getElementById('edit-name').value.trim();
    const newContact = document.getElementById('edit-contact').value.trim();
    const newGender = document.getElementById('edit-gender').value;
    const newAddress = document.getElementById('edit-address').value.trim();
    const newBirthdate = document.getElementById('edit-birthdate').value;

    const { data, error } = await supabaseClient.auth.updateUser({
        data: {
            full_name: newName,
            contact_number: newContact,
            gender: newGender,
            address: newAddress,
            birthdate: newBirthdate
        }
    });

    btnSave.disabled = false; btnSave.textContent = '💾 Save Changes';

    if (error) {
        alert("Error updating profile: " + error.message);
    } else {
        if (data && data.user) {
            currentUserSession = { ...currentUserSession, user: data.user };
        }
        
        // Update the sidebar name immediately without refreshing
        const sidebarName = document.getElementById('user-name');
        if (sidebarName) sidebarName.textContent = newName;

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