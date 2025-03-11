const apiUrl = "http://localhost:8080/";

function showConfirmationModal(title, message, callback) {
  const modalTitle = document.getElementById("confirmModalLabel");
  const modalBody = document.getElementById("confirmModalBody");
  const confirmBtn = document.getElementById("confirmModalConfirmBtn");
  
  modalTitle.innerText = title;
  modalBody.innerHTML = message;
  
  const newConfirmBtn = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
  
  newConfirmBtn.addEventListener("click", () => {
    callback();
    const confirmModal = bootstrap.Modal.getInstance(document.getElementById("confirmModal"));
    confirmModal.hide();
  });
  
  const confirmModal = new bootstrap.Modal(document.getElementById("confirmModal"));
  confirmModal.show();
}

function showToast(message, type = "success") {
  const toastContainer = document.getElementById("toastContainer");
  const toastId = "toast" + Date.now();

  const iconHtml = type === "success" ?
    '<img src="assets/successtoast.png" class="img" style="width: 10px; height: auto; border-radius: 1px;">' :
    type === "error" ?
    '<img src="assets/errortoast.png" class="img" style="width: 10px; height: auto; border-radius: 1px;">' :
    '<i class="fa-solid fa-info-circle icon-info"></i>';

  const toast = document.createElement("div");
  toast.id = toastId;
  toast.className = "toast custom-toast";
  toast.setAttribute("role", "alert");
  toast.setAttribute("aria-live", "assertive");
  toast.setAttribute("aria-atomic", "true");
  
  toast.innerHTML = `
    <div class="toast-header">
      ${iconHtml}
      <strong class="me-auto">System</strong>
      <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>
    <div class="toast-body">
      ${message}
    </div>
  `;

  toastContainer.appendChild(toast);
  const bsToast = new bootstrap.Toast(toast, { delay: 4000 });
  bsToast.show();
  toast.addEventListener('hidden.bs.toast', () => { toast.remove(); });
}

// Helper function: Format date (YYYY-MM-DD) into a readable string.
function formatDateToWords(dateString) {
  const parts = dateString.split("-");
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

// Format a Date object into "HHhmm" (24‑hour format)
function formatTime(date) {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return hours + "h " + minutes;
}

// Set default filters to current month and year.
function setDefaultFilters() {
  const now = new Date();
  document.getElementById("monthFilter").value = now.getMonth() + 1;
  document.getElementById("yearFilter").value = now.getFullYear();
}

// Fetch and display employee's overtime entries.
// Helper: Format time string from "HH:mm:ss" to "HHhmm"
function formatTimeString(timeStr) {
  if (!timeStr) return "N/A";
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  return parts[0] + "h " + parts[1];
}

function fetchEntries() {
  fetch(apiUrl)
    .then(response => response.json())
    .then(data => {
      if (!Array.isArray(data)) { data = [data]; }
      const monthFilter = document.getElementById("monthFilter").value;
      const yearFilter = document.getElementById("yearFilter").value;
      let filteredData = data;
      if (monthFilter || yearFilter) {
        filteredData = data.filter(entry => {
          const dt = new Date(entry.date);
          if (monthFilter && (dt.getMonth() + 1) != monthFilter) return false;
          if (yearFilter && dt.getFullYear() != yearFilter) return false;
          return true;
        });
      }
      updateSummaryMetrics(filteredData);
      const grouped = filteredData.reduce((acc, entry) => {
        acc[entry.date] = acc[entry.date] || [];
        acc[entry.date].push(entry);
        return acc;
      }, {});
      const container = document.getElementById("entriesContainer");
      container.innerHTML = "";
      const sortedDates = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));
      sortedDates.forEach(date => {
        const dayEntries = grouped[date];
        const card = document.createElement("div");
        card.className = "card mb-3";
        card.innerHTML = `
          <div class="card-header">${formatDateToWords(date)}</div>
          <div class="card-body">
            <table class="table table-striped">
              <thead>
                <tr>
                  <th>Punch In</th>
                  <th>Punch Out</th>
                  <th>Overtime</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${dayEntries.map(entry => `
                  <tr>
                    <td>${entry.punchIn ? formatTimeString(entry.punchIn) : "N/A"}</td>
                    <td>${entry.punchOut ? formatTimeString(entry.punchOut) : "N/A"}</td>
                    <td>${entry.overtime ? formatTimeString(entry.overtime) : "N/A"}</td>
                    <td>
                      <span class="badge ${entry.status === 'approved' ? 'bg-success' : entry.status === 'rejected' ? 'bg-danger' : 'bg-warning text-dark'}">
                        ${entry.status || "N/A"}
                      </span>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        `;
        container.appendChild(card);
      });
      if (filteredData.length === 0) {
        container.innerHTML = `<div class="text-center text-muted">No punch clock entries found.</div>`;
      }
    })
    .catch(error => console.error("Error fetching entries:", error));
}

// Update summary metrics.
function updateSummaryMetrics(data) {
  let totalSeconds = 0;
  let pendingCount = 0;
  data.forEach(entry => {
    if (entry.status === "pending") pendingCount++;
    if (entry.overtime && entry.overtime !== "N/A") {
      const parts = entry.overtime.split(':').map(Number);
      totalSeconds += parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
  });
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  // Display only hours and minutes, e.g., "17h10"
  document.getElementById("totalOvertime").innerText =
    `${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}`;
  document.getElementById("pendingApprovals").innerText = pendingCount;
}

// Punch In button handler.
document.getElementById("punchInButton").addEventListener("click", () => {
  const now = new Date();
  const nowStr = formatTime(now);  // nowStr will be "HHhmm"
  showConfirmationModal("Confirm Punch In", "Are you sure you want to punch in at <strong>" + nowStr + "</strong>?", () => {
    fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "in" })
    })
    .then(parseResponse)
    .then(data => {
      // Format the returned time from the backend if needed.
      const formattedTime = formatTimeString(data.time);
      document.getElementById("statusMessage").innerHTML = "Punch In Successful At <strong>" + formattedTime + "</strong>";
      showToast("Punch In Successful At <strong>" + formattedTime + "</strong>", "success");
      fetchEntries();
    })
    .catch(error => {
      console.error("Error Punching Pn:", error);
      showToast("Error Punching In: " + error.message, "error");
    });
  });
});

// Punch Out button handler.
document.getElementById("punchOutButton").addEventListener("click", () => {
  const now = new Date();
  const nowStr = formatTime(now);
  // (Assuming your modal displays the time from nowStr and computed overtime in the desired format.)
  showConfirmationModal("Confirm Punch Out", "Are you sure you want to punch out at <strong>" + nowStr + "</strong>?", () => {
    fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "out" })
    })
    .then(parseResponse)
    .then(data => {
      const formattedTime = formatTimeString(data.time);
      document.getElementById("statusMessage").innerHTML = "Punch Out Successful At <strong>" + formattedTime + "</strong>";
      showToast("Punch Out Successful At <strong>" + formattedTime + "</strong>", "success");
      fetchEntries();
    })
    .catch(error => {
      console.error("Error punching out:", error);
      showToast("Error punching out: " + error.message, "error");
    });
  });
});

function parseResponse(response) {
    if (!response.ok) {
      return response.text().then(text => { throw new Error(text); });
    }
    return response.json();
}

// Filter buttons.
document.getElementById("applyFilterButton").addEventListener("click", fetchEntries);
document.getElementById("clearFilterButton").addEventListener("click", () => {
  setDefaultFilters();
  fetchEntries();
});

setDefaultFilters();
fetchEntries();
