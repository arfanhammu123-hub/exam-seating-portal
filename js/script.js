// ExamCell Portal — application logic.
// Student records live in localStorage for this browser only.
// Record shape: { usn, name, branch, room, seat, row, col }

const STORAGE_KEY = "examStudents";
const SETTINGS_KEY = "examSeatingSettings";
const BRANCHES = ["CSE", "ECE", "ME", "AIDS", "CSE-IOT", "CIVIL"];
const NOT_ALLOTTED = "Not allotted";
const MAX_SEATS_PER_ROOM = 400;

let students = loadStudents();
let settings = loadSettings();

// Room/grid used for the most recent plan (drives seat labels and restore).
let currentPlan = { room: settings.room, cols: settings.cols, rows: settings.rows };

/* ------------------------------------------------------------------ */
/* Persistence                                                         */
/* ------------------------------------------------------------------ */

function loadStudents() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!Array.isArray(saved)) return [];
    // Keep only recognisable records so bad data can't break the UI.
    return saved
      .filter((s) => s && typeof s.usn === "string" && typeof s.name === "string")
      .map((s) => {
        const legacyUnassigned = (value) => !value || /^not\s*allotted$/i.test(String(value));
        const seated = !legacyUnassigned(s.room) && !legacyUnassigned(s.seat);
        return {
          usn: s.usn.trim().toUpperCase(),
          name: s.name.trim(),
          branch: BRANCHES.includes(s.branch) ? s.branch : "CSE",
          room: seated ? String(s.room) : NOT_ALLOTTED,
          seat: seated ? String(s.seat) : NOT_ALLOTTED,
          row: seated && Number.isInteger(s.row) ? s.row : null,
          col: seated && Number.isInteger(s.col) ? s.col : null,
        };
      });
  } catch (error) {
    return [];
  }
}

function clampNumber(value, min, max, fallback) {
  const number = parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    return {
      room: typeof saved.room === "string" && saved.room.trim() ? saved.room.trim() : "Room 101",
      cols: clampNumber(saved.cols, 2, 8, 4),
      rows: clampNumber(saved.rows, 1, 40, 6),
    };
  } catch (error) {
    return { room: "Room 101", cols: 4, rows: 6 };
  }
}

function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(students));
  } catch (error) {
    notify("Changes could not be saved — browser storage may be full.", "error");
  }
  updateStatus();
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    /* Settings are a convenience; the app still works without them. */
  }
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function byId(id) {
  return document.getElementById(id);
}

function setHidden(element, hidden) {
  element.classList.toggle("hidden", hidden);
  if (hidden) {
    element.setAttribute("hidden", "");
  } else {
    element.removeAttribute("hidden");
  }
}

function showInlineError(input, errorElement, message) {
  input.setAttribute("aria-invalid", "true");
  errorElement.textContent = message;
  setHidden(errorElement, false);
}

function clearInlineError(input, errorElement) {
  input.removeAttribute("aria-invalid");
  errorElement.textContent = "";
  setHidden(errorElement, true);
}

function renderPlaceholderSeating() {
  const container = byId("seatingPlans");
  const p = document.createElement("p");
  p.className = "placeholder";
  p.textContent =
    'Register students, then choose rows, columns, and a room, and click "Generate seating plan".';
  container.replaceChildren(p);
}

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

function notify(message, type = "info") {
  const stack = byId("toastStack");
  if (!stack) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.textContent = message;

  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    toast.classList.add("is-leaving");
    window.setTimeout(() => toast.remove(), 220);
  };

  window.setTimeout(dismiss, type === "error" ? 5500 : 3600);
  toast.addEventListener("click", dismiss);
  stack.appendChild(toast);
}

/* ------------------------------------------------------------------ */
/* Confirm dialog (replaces window.confirm)                            */
/* ------------------------------------------------------------------ */

let confirmResolver = null;
let lastFocusedElement = null;

function askConfirm({ title, message, acceptLabel = "Delete" }) {
  const dialog = byId("confirmDialog");
  byId("confirmTitle").textContent = title;
  byId("confirmMessage").textContent = message;
  byId("confirmAccept").textContent = acceptLabel;

  lastFocusedElement = document.activeElement;
  setHidden(dialog, false);
  byId("confirmAccept").focus();

  return new Promise((resolve) => {
    confirmResolver = resolve;
  });
}

function closeConfirm(accepted) {
  const dialog = byId("confirmDialog");
  if (dialog.classList.contains("hidden")) return;
  setHidden(dialog, true);
  const resolve = confirmResolver;
  confirmResolver = null;
  if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
    lastFocusedElement.focus();
  }
  if (resolve) resolve(accepted);
}

/* ------------------------------------------------------------------ */
/* Status, capacity hint, registered-student table                     */
/* ------------------------------------------------------------------ */

function updateStatus() {
  const count = students.length;
  const allotted = students.filter((student) => student.room !== NOT_ALLOTTED).length;

  byId("statusText").textContent = `Total students registered: ${count}${
    count ? ` — ${allotted} with a seat` : ""
  }`;
  byId("headerCount").textContent = `${count} student${count === 1 ? "" : "s"} registered`;

  renderStudentList();
  renderTicketSuggestions();
  renderCapacityHint();
}

function renderCapacityHint() {
  const hint = byId("capacityHint");
  if (!hint) return;
  const cols = clampNumber(byId("colsInput")?.value, 2, 8, 4);
  const rows = clampNumber(byId("capacityInput")?.value, 1, 40, 6);
  const capacity = cols * rows;
  const needed = Math.max(1, Math.ceil(students.length / capacity));
  hint.textContent =
    `This room holds ${capacity} seats (${rows} rows × ${cols} columns).` +
    (students.length
      ? ` ${students.length} students will need ${needed} room${needed === 1 ? "" : "s"}.`
      : "");
}

function makeCell(text, className) {
  const cell = document.createElement("td");
  if (className) cell.className = className;
  cell.textContent = text;
  return cell;
}

function makeBranchChip(branch) {
  const cell = document.createElement("td");
  const chip = document.createElement("span");
  chip.className = `branch-chip ${branch}`;
  chip.textContent = branch;
  cell.appendChild(chip);
  return cell;
}

function renderStudentList() {
  const searchInput = byId("tableSearchInput");
  const query = (searchInput?.value || "").trim().toUpperCase();
  const list = byId("studentList");
  list.replaceChildren();

  const visible = query
    ? students.filter((student) =>
        [student.usn, student.name, student.branch].some((value) =>
          value.toUpperCase().includes(query)
        )
      )
    : students;

  if (!students.length) {
    const row = document.createElement("tr");
    const cell = makeCell("No students registered yet — add the first one above.", "empty-cell");
    cell.colSpan = 6;
    row.appendChild(cell);
    list.appendChild(row);
  } else if (!visible.length) {
    const row = document.createElement("tr");
    const cell = makeCell(`No students match “${searchInput.value.trim()}”.`, "empty-cell");
    cell.colSpan = 6;
    row.appendChild(cell);
    list.appendChild(row);
  } else {
    visible.forEach((student) => {
      const row = document.createElement("tr");
      row.appendChild(makeCell(student.usn, "usn"));
      row.appendChild(makeCell(student.name));
      row.appendChild(makeBranchChip(student.branch));

      const seated = student.room !== NOT_ALLOTTED;
      row.appendChild(makeCell(student.room, seated ? "" : "cell-muted"));
      row.appendChild(makeCell(student.seat, seated ? "" : "cell-muted"));

      const actionCell = document.createElement("td");
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "btn-danger";
      deleteButton.textContent = "Delete";
      deleteButton.setAttribute("aria-label", `Delete student ${student.usn}`);
      deleteButton.addEventListener("click", () => deleteStudent(student.usn));
      actionCell.appendChild(deleteButton);
      row.appendChild(actionCell);

      list.appendChild(row);
    });
  }

  const summary = byId("tableSummary");
  if (summary) {
    if (!students.length) {
      summary.textContent = "";
    } else if (query) {
      summary.textContent = `Showing ${visible.length} of ${students.length} students`;
    } else {
      summary.textContent = `${students.length} student${students.length === 1 ? "" : "s"} on record`;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Adding students                                                     */
/* ------------------------------------------------------------------ */

function addStudent() {
  const usnInput = byId("usnInput");
  const nameInput = byId("nameInput");
  const branchInput = byId("branchInput");
  const errorText = byId("addStudentError");

  const usn = usnInput.value.trim().toUpperCase();
  const name = nameInput.value.trim();
  const branch = BRANCHES.includes(branchInput.value) ? branchInput.value : "CSE";

  if (!usn) {
    showInlineError(usnInput, errorText, "Enter the student’s USN.");
    usnInput.focus();
    return;
  }
  if (!name) {
    showInlineError(nameInput, errorText, "Enter the student’s full name.");
    nameInput.focus();
    return;
  }
  if (students.some((student) => student.usn === usn)) {
    showInlineError(usnInput, errorText, `USN ${usn} is already registered.`);
    usnInput.focus();
    usnInput.select();
    return;
  }

  students.push({
    usn,
    name,
    branch,
    room: NOT_ALLOTTED,
    seat: NOT_ALLOTTED,
    row: null,
    col: null,
  });

  clearInlineError(usnInput, errorText);
  nameInput.removeAttribute("aria-invalid");
  saveToStorage();

  usnInput.value = "";
  nameInput.value = "";
  usnInput.focus();
  notify(`${name} (${usn}) added.`, "success");
}

// Bulk entry: one student per line. Accepts "USN", "USN, Name", or
// "USN, Name, Branch" separated by commas, semicolons, or tabs.
function parseBulkLine(line) {
  const parts = line.split(/[,;\t]/).map((part) => part.trim());
  const usn = (parts[0] || "").toUpperCase();
  const name = parts[1] || usn;
  let branch = "CSE";

  const rawBranch = (parts[2] || "").toUpperCase().replace(/\s+/g, "");
  if (rawBranch) {
    const normalised = rawBranch === "IOT" ? "CSE-IOT" : rawBranch === "CSEIOT" ? "CSE-IOT" : rawBranch;
    if (BRANCHES.includes(normalised)) branch = normalised;
  }
  return { usn, name, branch };
}

function addBulkStudents() {
  const textarea = byId("bulkInput");
  const feedback = byId("bulkFeedback");
  const lines = textarea.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    feedback.textContent = "Paste at least one student first.";
    textarea.focus();
    return;
  }

  let added = 0;
  let duplicates = 0;

  lines.forEach((line) => {
    const { usn, name, branch } = parseBulkLine(line);
    if (!usn) return;
    if (students.some((student) => student.usn === usn)) {
      duplicates += 1;
      return;
    }
    students.push({ usn, name, branch, room: NOT_ALLOTTED, seat: NOT_ALLOTTED, row: null, col: null });
    added += 1;
  });

  if (added) {
    saveToStorage();
    textarea.value = "";
  }

  const notes = [];
  if (added) notes.push(`${added} added`);
  if (duplicates) notes.push(`${duplicates} already registered`);
  feedback.textContent = notes.join(" · ");

  if (added) {
    notify(`Added ${added} student${added === 1 ? "" : "s"} in bulk.`, "success");
  } else if (duplicates) {
    notify("Nothing new was added — those USNs are already registered.", "error");
  }
}

/* ------------------------------------------------------------------ */
/* Deleting students                                                   */
/* ------------------------------------------------------------------ */

async function deleteStudent(usn) {
  const student = students.find((item) => item.usn === usn);
  if (!student) return;

  const seated = student.room !== NOT_ALLOTTED;
  const accepted = await askConfirm({
    title: "Remove this student?",
    message:
      `${student.name} (${student.usn}) will be removed. ` +
      (seated ? "Their seat will show as empty until you regenerate the plan. " : "") +
      "This can’t be undone.",
    acceptLabel: "Remove student",
  });
  if (!accepted) return;

  students = students.filter((item) => item.usn !== usn);
  saveToStorage();
  notify(`${student.name} removed.`, "success");

  // Redraw the existing plan as saved (do not reshuffle everyone's seats).
  redrawFromSavedPlan();

  const ticketUsn = byId("htUsn").textContent;
  if (ticketUsn === usn) {
    setHidden(byId("hallTicketBox"), true);
    byId("htUsn").textContent = "";
  } else if (ticketUsn) {
    const stillHere = students.find((item) => item.usn === ticketUsn);
    if (stillHere) fillHallTicket(stillHere);
  }
}

/* ------------------------------------------------------------------ */
/* Seating plan                                                        */
/* ------------------------------------------------------------------ */

function generateSeating({ quiet = false } = {}) {
  if (!students.length) {
    if (!quiet) notify("Add at least one student before generating seating.", "error");
    return;
  }

  const roomInput = byId("roomNoInput");
  const colsInput = byId("colsInput");
  const rowsInput = byId("capacityInput");

  const room = roomInput.value.trim() || "Room 101";
  const cols = clampNumber(colsInput.value, 2, 8, 4);
  const rows = clampNumber(rowsInput.value, 1, 40, 6);
  const capacity = cols * rows;

  if (capacity > MAX_SEATS_PER_ROOM) {
    notify(`A single room can hold at most ${MAX_SEATS_PER_ROOM} seats. Reduce rows or columns.`, "error");
    return;
  }

  // Reflect normalised values back into the form.
  roomInput.value = room;
  colsInput.value = cols;
  rowsInput.value = rows;

  settings = { room, cols, rows };
  currentPlan = { room, cols, rows };
  saveSettings();

  // Group by branch, then interleave round-robin so neighbouring seats mix branches.
  const branches = [...new Set(students.map((student) => student.branch))];
  const branchGroups = branches.map((branch) =>
    students
      .filter((student) => student.branch === branch)
      .sort((a, b) => a.usn.localeCompare(b.usn))
  );

  const interleaved = [];
  const longest = Math.max(...branchGroups.map((group) => group.length), 0);
  for (let i = 0; i < longest; i += 1) {
    branchGroups.forEach((group) => {
      if (i < group.length) interleaved.push(group[i]);
    });
  }

  const rooms = [];
  for (let start = 0; start < interleaved.length; start += capacity) {
    const index = rooms.length;
    rooms.push({
      room: index === 0 ? room : `${room} · Hall ${index + 1}`,
      students: interleaved.slice(start, start + capacity),
    });
  }

  // Write seat assignments back onto each student record.
  rooms.forEach((plan) => {
    plan.students.forEach((student, index) => {
      const row = Math.floor(index / cols) + 1;
      const col = (index % cols) + 1;
      student.room = plan.room;
      student.seat = `R${row}-C${col}`;
      student.row = row;
      student.col = col;
    });
  });

  saveToStorage();
  renderSeatingPlans(rooms, cols);
  renderLegend();

  if (!quiet) {
    notify(
      `Seated ${students.length} students across ${rooms.length} room${rooms.length === 1 ? "" : "s"}.`,
      "success"
    );
    byId("seatingCard").scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

// Rebuilds the seating view from the assignments already stored on students,
// leaving gaps where students were deleted. Returns true when something was drawn.
function redrawFromSavedPlan() {
  const seated = students.filter((student) => student.room !== NOT_ALLOTTED);
  if (!seated.length) {
    renderPlaceholderSeating();
    renderLegend();
    return false;
  }

  const rooms = [];
  const nameMap = new Map();
  seated.forEach((student) => {
    // Older records may lack row/col; give them a position at the end of their room.
    if (!nameMap.has(student.room)) {
      const plan = { room: student.room, students: [] };
      nameMap.set(student.room, plan);
      rooms.push(plan);
    }
    nameMap.get(student.room).students.push(student);
  });

  rooms.forEach((plan) => {
    plan.students.sort(
      (a, b) => (a.row ?? Infinity) - (b.row ?? Infinity) || (a.col ?? Infinity) - (b.col ?? Infinity)
    );
  });

  const maxCol = Math.max(...seated.map((student) => student.col || 0), settings.cols);
  currentPlan = { ...currentPlan, cols: maxCol, rows: settings.rows };
  renderSeatingPlans(rooms, maxCol);
  renderLegend();
  return true;
}

function renderSeatingPlans(rooms, cols) {
  const container = byId("seatingPlans");
  container.replaceChildren();

  rooms.forEach((plan) => {
    const section = document.createElement("div");
    section.className = "seating-plan";

    const head = document.createElement("div");
    head.className = "plan-head";
    const title = document.createElement("h3");
    title.textContent = plan.room;
    const meta = document.createElement("span");
    meta.className = "plan-meta";
    meta.textContent = `${plan.students.length} seat${plan.students.length === 1 ? "" : "s"} filled`;
    head.appendChild(title);
    head.appendChild(meta);
    section.appendChild(head);

    const banner = document.createElement("div");
    banner.className = "board-banner";
    banner.textContent = "FRONT OF THE ROOM / BLACKBOARD";
    section.appendChild(banner);

    const grid = document.createElement("div");
    grid.className = "seating-grid";
    grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
    grid.setAttribute("role", "list");
    grid.setAttribute("aria-label", `Seats in ${plan.room}`);

    // Place students by their stored position; fall back to fill order.
    const seatMap = new Map();
    let nextFree = 0;
    plan.students.forEach((student) => {
      if (student.row && student.col) {
        seatMap.set(`${student.row}-${student.col}`, student);
        nextFree = Math.max(nextFree, (student.row - 1) * cols + student.col);
      }
    });
    plan.students.forEach((student) => {
      if (!(student.row && student.col)) {
        nextFree += 1;
        const row = Math.floor((nextFree - 1) / cols) + 1;
        const col = ((nextFree - 1) % cols) + 1;
        seatMap.set(`${row}-${col}`, student);
      }
    });

    const usedSeats = Math.max(nextFree, plan.students.length);
    const rowCount = Math.ceil(usedSeats / cols);

    for (let row = 1; row <= rowCount; row += 1) {
      for (let col = 1; col <= cols; col += 1) {
        const student = seatMap.get(`${row}-${col}`);
        grid.appendChild(buildSeatCard(student, row, col));
      }
    }

    section.appendChild(grid);
    container.appendChild(section);
  });
}

function buildSeatCard(student, row, col) {
  const card = document.createElement("div");
  card.className = "seat-card";
  card.setAttribute("role", "listitem");

  const label = document.createElement("div");
  label.className = "seat-label";
  const labelText = document.createElement("span");
  labelText.textContent = `R${row}-C${col}`;
  label.appendChild(labelText);

  if (!student) {
    card.classList.add("is-empty");
    card.appendChild(label);
    const empty = document.createElement("div");
    empty.className = "seat-usn";
    empty.textContent = "Empty";
    card.appendChild(empty);
    return card;
  }

  card.classList.add(student.branch);
  card.appendChild(label);

  const name = document.createElement("div");
  name.className = "seat-name";
  name.textContent = student.name;
  name.title = student.name;
  card.appendChild(name);

  const usn = document.createElement("div");
  usn.className = "seat-usn";
  usn.textContent = student.usn;
  card.appendChild(usn);

  const branch = document.createElement("span");
  branch.className = "seat-branch";
  branch.textContent = `(${student.branch})`;
  card.appendChild(branch);

  return card;
}

function renderLegend() {
  const legend = byId("branchLegend");
  legend.replaceChildren();
  const usedBranches = [...new Set(students.map((student) => student.branch))];
  if (!usedBranches.length) {
    setHidden(legend, true);
    return;
  }
  setHidden(legend, false);
  BRANCHES.filter((branch) => usedBranches.includes(branch)).forEach((branch) => {
    const item = document.createElement("li");
    const swatch = document.createElement("span");
    swatch.className = `swatch ${branch}`;
    item.appendChild(swatch);
    item.appendChild(document.createTextNode(branch));
    legend.appendChild(item);
  });
}

function printSeatingChart() {
  if (!byId("seatingPlans").querySelector(".seating-plan")) {
    notify("Generate a seating plan before printing the chart.", "error");
    return;
  }
  document.body.classList.add("printing-chart");
  window.print();
  document.body.classList.remove("printing-chart");
}

/* ------------------------------------------------------------------ */
/* Hall tickets                                                        */
/* ------------------------------------------------------------------ */

function renderTicketSuggestions() {
  const datalist = byId("usnSuggestions");
  if (!datalist) return;
  datalist.replaceChildren();
  students.slice(0, 500).forEach((student) => {
    const option = document.createElement("option");
    option.value = student.usn;
    option.label = student.name;
    datalist.appendChild(option);
  });
}

function showHallTicket() {
  const input = byId("searchUsnInput");
  const errorText = byId("ticketError");
  const query = input.value.trim().toUpperCase();

  if (!query) {
    showInlineError(input, errorText, "Enter a USN to look up a hall ticket.");
    input.focus();
    return;
  }

  const student = students.find((item) => item.usn === query);
  if (!student) {
    showInlineError(input, errorText, `No student with USN “${query}” is registered.`);
    input.focus();
    input.select();
    return;
  }

  clearInlineError(input, errorText);
  fillHallTicket(student);
  setHidden(byId("hallTicketBox"), false);
  byId("hallTicketBox").scrollIntoView({ behavior: "smooth", block: "start" });
}

function fillHallTicket(student) {
  if (!student) return;
  byId("htUsn").textContent = student.usn;
  byId("htName").textContent = student.name;
  byId("htBranch").textContent = student.branch;
  byId("htRoom").textContent = student.room;
  byId("htSeat").textContent = student.seat;

  const notice = byId("ticketNotice");
  if (student.room === NOT_ALLOTTED) {
    notice.textContent = "No seat allotted yet — generate a seating plan to complete this ticket.";
    setHidden(notice, false);
  } else {
    setHidden(notice, true);
  }
}

function printHallTicket() {
  if (byId("hallTicketBox").classList.contains("hidden")) {
    notify("Search for a student first to produce a hall ticket.", "error");
    return;
  }
  document.body.classList.add("printing-ticket");
  window.print();
  document.body.classList.remove("printing-ticket");
}

/* ------------------------------------------------------------------ */
/* CSV export                                                          */
/* ------------------------------------------------------------------ */

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function downloadCSV(filename, rows) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  // The BOM keeps USN/name text correct when the file opens in Excel.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportStudentsCSV() {
  if (!students.length) {
    notify("There are no students to export yet.", "error");
    return;
  }
  const rows = [["USN", "Name", "Branch", "Room", "Seat"]];
  students.forEach((student) => {
    rows.push([student.usn, student.name, student.branch, student.room, student.seat]);
  });
  const stamp = new Date().toISOString().slice(0, 10);
  downloadCSV(`exam-students-${stamp}.csv`, rows);
  notify(`Exported ${students.length} students to CSV.`, "success");
}

/* ------------------------------------------------------------------ */
/* Clearing data                                                       */
/* ------------------------------------------------------------------ */

async function clearAllData() {
  if (!students.length) {
    notify("There is nothing to clear.", "info");
    return;
  }
  const accepted = await askConfirm({
    title: "Clear all records?",
    message: `All ${students.length} student records and the saved seating settings in this browser will be removed.`,
    acceptLabel: "Clear everything",
  });
  if (!accepted) return;

  students = [];
  saveToStorage();
  renderPlaceholderSeating();
  renderLegend();
  setHidden(byId("hallTicketBox"), true);
  byId("htUsn").textContent = "";
  byId("searchUsnInput").value = "";
  notify("All records cleared.", "success");
}

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */

function init() {
  byId("roomNoInput").value = settings.room;
  byId("colsInput").value = settings.cols;
  byId("capacityInput").value = settings.rows;

  byId("addStudentForm").addEventListener("submit", (event) => {
    event.preventDefault();
    addStudent();
  });

  byId("usnInput").addEventListener("input", () => {
    clearInlineError(byId("usnInput"), byId("addStudentError"));
  });
  byId("nameInput").addEventListener("input", () => {
    byId("nameInput").removeAttribute("aria-invalid");
    setHidden(byId("addStudentError"), true);
  });

  byId("tableSearchInput").addEventListener("input", renderStudentList);

  byId("ticketForm").addEventListener("submit", (event) => {
    event.preventDefault();
    showHallTicket();
  });
  byId("searchUsnInput").addEventListener("input", () => {
    clearInlineError(byId("searchUsnInput"), byId("ticketError"));
  });

  byId("colsInput").addEventListener("input", renderCapacityHint);
  byId("capacityInput").addEventListener("input", renderCapacityHint);
  byId("roomNoInput").addEventListener("change", () => {
    settings = { ...settings, room: byId("roomNoInput").value.trim() || "Room 101" };
    saveSettings();
  });

  byId("confirmAccept").addEventListener("click", () => closeConfirm(true));
  byId("confirmCancel").addEventListener("click", () => closeConfirm(false));
  byId("confirmDialog").addEventListener("click", (event) => {
    if (event.target === byId("confirmDialog")) closeConfirm(false);
  });

  document.addEventListener("keydown", (event) => {
    if (byId("confirmDialog").classList.contains("hidden")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeConfirm(false);
      return;
    }
    if (event.key === "Tab") {
      const focusables = byId("confirmDialog").querySelectorAll("button");
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  updateStatus();

  // Reopen with the previous plan still on screen.
  redrawFromSavedPlan();
}

window.addEventListener("DOMContentLoaded", init);
