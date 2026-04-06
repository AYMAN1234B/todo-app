// ── Config ──────────────────────────────────────────────
const API = "http://localhost:5000";

// ── State ───────────────────────────────────────────────
let tasks = [];
let history = [];
let filter = 'all';
let activeCat = 'All';
let expanded = {};
let showHistory = false;
let dark = localStorage.getItem('todo-dark') === 'true';
let dragSrc = null;

// ── Dark mode (keep in localStorage — it's just a preference) ──
document.addEventListener('DOMContentLoaded', () => {
  if (dark) {
    document.getElementById('app').classList.add('dark');
    document.body.classList.add('dark');
  }
});

function saveDark() {
  localStorage.setItem('todo-dark', dark);
}

function toggleDark() {
  dark = !dark;
  document.getElementById('app').classList.toggle('dark', dark);
  document.body.classList.toggle('dark', dark);
  document.querySelector('.dark-toggle').textContent = dark ? 'Light mode' : 'Dark mode';
  saveDark();
}

// ── API helpers ─────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const res = await fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Load all data from server ───────────────────────────
async function loadAll() {
  [tasks, history] = await Promise.all([
    apiFetch("/tasks"),
    apiFetch("/history"),
  ]);
  render();
}

// ── Category & filter ───────────────────────────────────
function setCat(cat, btn) {
  activeCat = cat;
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  render();
}

function setFilter(f, btn) {
  filter = f;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  render();
}

// ── Date helpers ─────────────────────────────────────────
function isOverdue(due) {
  if (!due) return false;
  return new Date(due) < new Date(new Date().toDateString());
}

function isToday(due) {
  if (!due) return false;
  return due === new Date().toISOString().split('T')[0];
}

function fmtDate(due) {
  if (!due) return '';
  const d = new Date(due + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// ── Task actions ─────────────────────────────────────────
async function addTask() {
  const input = document.getElementById('task-input');
  const text = input.value.trim();
  if (!text) return;
  const cat = activeCat === 'All' ? 'General' : activeCat;
  const priority = document.getElementById('priority-select').value;
  const due = document.getElementById('due-date').value;

  const newTask = await apiFetch("/tasks", {
    method: "POST",
    body: JSON.stringify({ text, cat, priority, due, subtasks: [] }),
  });

  tasks.push(newTask);
  input.value = '';
  render();
}

async function toggle(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  const updated = await apiFetch(`/tasks/${id}`, {
    method: "PUT",
    body: JSON.stringify({ ...task, done: !task.done }),
  });
  tasks = tasks.map(t => t.id === id ? updated : t);

  // Refresh history in case task was completed (backend may log it)
  history = await apiFetch("/history");
  render();
}

async function remove(id) {
  await apiFetch(`/tasks/${id}`, { method: "DELETE" });
  tasks = tasks.filter(t => t.id !== id);
  history = await apiFetch("/history");
  render();
}

function startEdit(id) {
  const el = document.querySelector(`[data-edit="${id}"]`);
  if (!el) return;
  el.contentEditable = true;
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);

  el.onblur = async () => {
    const newText = el.innerText.trim();
    if (newText) {
      const task = tasks.find(t => t.id === id);
      const updated = await apiFetch(`/tasks/${id}`, {
        method: "PUT",
        body: JSON.stringify({ ...task, text: newText }),
      });
      tasks = tasks.map(t => t.id === id ? updated : t);
    }
    el.contentEditable = false;
    render();
  };
  el.onkeydown = e => {
    if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
  };
}

function toggleExpand(id) {
  expanded[id] = !expanded[id];
  render();
}

async function addSubtask(id) {
  const input = document.getElementById('sub-' + id);
  const text = input.value.trim();
  if (!text) return;
  const task = tasks.find(t => t.id === id);
  const newSubs = [...(task.subtasks || []), { id: Date.now(), text, done: false }];
  const updated = await apiFetch(`/tasks/${id}`, {
    method: "PUT",
    body: JSON.stringify({ ...task, subtasks: newSubs }),
  });
  tasks = tasks.map(t => t.id === id ? updated : t);
  input.value = '';
  expanded[id] = true;
  render();
}

async function toggleSub(tid, sid) {
  const task = tasks.find(t => t.id === tid);
  const newSubs = task.subtasks.map(s => s.id === sid ? { ...s, done: !s.done } : s);
  const updated = await apiFetch(`/tasks/${tid}`, {
    method: "PUT",
    body: JSON.stringify({ ...task, subtasks: newSubs }),
  });
  tasks = tasks.map(t => t.id === tid ? updated : t);
  render();
}

async function removeSub(tid, sid) {
  const task = tasks.find(t => t.id === tid);
  const newSubs = task.subtasks.filter(s => s.id !== sid);
  const updated = await apiFetch(`/tasks/${tid}`, {
    method: "PUT",
    body: JSON.stringify({ ...task, subtasks: newSubs }),
  });
  tasks = tasks.map(t => t.id === tid ? updated : t);
  render();
}

async function clearDone() {
  await apiFetch("/tasks/clear-done", { method: "DELETE" });
  tasks = tasks.filter(t => !t.done);
  history = await apiFetch("/history");
  render();
}

// ── History ──────────────────────────────────────────────
function toggleHistory() {
  showHistory = !showHistory;
  document.getElementById('history-panel').style.display = showHistory ? 'block' : 'none';
  document.querySelectorAll('.bottom-btn')[1].textContent = showHistory ? 'Hide history' : 'View history';
  if (showHistory) renderHistory();
}

async function restoreTask(hid) {
  const restored = await apiFetch(`/history/${hid}/restore`, { method: "POST" });
  tasks.push(restored);
  history = history.filter(h => h.id !== hid);
  render();
  renderHistory();
}

function renderHistory() {
  const panel = document.getElementById('history-panel');
  if (!history.length) {
    panel.innerHTML = '<div class="history-header">History</div><div style="padding:1rem;font-size:13px;color:var(--text3);text-align:center">No history yet</div>';
    return;
  }
  panel.innerHTML = '<div class="history-header">Completed & deleted tasks</div>' +
    history.map(h => `
      <div class="history-item">
        <span class="history-text">${h.text}</span>
        <span class="priority-badge p-${h.priority || 'moderate'}">${h.priority || 'moderate'}</span>
        <span class="history-meta">${h.deletedAt}</span>
        <button class="restore-btn" onclick="restoreTask(${h.id})">Restore</button>
      </div>
    `).join('');
}

// ── Render ───────────────────────────────────────────────
function render() {
  const list = document.getElementById('task-list');
  const search = document.getElementById('search-input').value.toLowerCase();

  let filtered = tasks.filter(t => {
    const catMatch = activeCat === 'All' || t.cat === activeCat;
    const statusMatch =
      filter === 'all'    ? true :
      filter === 'done'   ? t.done :
      filter === 'active' ? !t.done :
      filter === 'overdue'? (!t.done && isOverdue(t.due)) :
      filter === 'high'   ? t.priority === 'critical' : true;
    const searchMatch = !search || t.text.toLowerCase().includes(search);
    return catMatch && statusMatch && searchMatch;
  });

  filtered.sort((a, b) => {
    const po = { critical: 0, moderate: 1, minor: 2 };
    if (!a.done && b.done) return -1;
    if (a.done && !b.done) return 1;
    if (a.position !== b.position) return a.position - b.position;
    return (po[a.priority] || 1) - (po[b.priority] || 1);
  });

  if (!filtered.length) {
    list.innerHTML = '<div class="empty">No tasks found</div>';
  } else {
    list.innerHTML = filtered.map(t => {
      const subs = t.subtasks || [];
      const subDone = subs.filter(s => s.done).length;
      const progress = subs.length ? Math.round((subDone / subs.length) * 100) : 0;
      const overdue = !t.done && isOverdue(t.due);
      const todayDue = !t.done && isToday(t.due);
      const isExp = expanded[t.id];

      return `
        <div class="task-card ${t.done ? 'done-card' : ''} ${overdue ? 'overdue' : ''}"
          draggable="true"
          data-id="${t.id}"
          ondragstart="dragStart(event, ${t.id})"
          ondragover="dragOver(event)"
          ondrop="drop(event, ${t.id})"
          ondragend="dragEnd(event)">

          <div class="task-header">
            <div class="task-check ${t.done ? 'checked' : ''}" onclick="toggle(${t.id})"></div>
            <div class="task-main">
              <div class="task-text" data-edit="${t.id}" ondblclick="startEdit(${t.id})">${t.text}</div>
              <div class="task-meta">
                <span class="priority-badge p-${t.priority}">${t.priority}</span>
                <span class="cat-tag">${t.cat}</span>
                ${t.due ? `<span class="due-tag ${overdue ? 'overdue' : todayDue ? 'today' : ''}">
                  ${overdue ? 'Overdue · ' : todayDue ? 'Today · ' : ''}${fmtDate(t.due)}
                </span>` : ''}
              </div>
            </div>
            <button class="expand-btn" onclick="toggleExpand(${t.id})">
              ${isExp ? '▲' : '▼'} ${subs.length ? subDone + '/' + subs.length : 'sub'}
            </button>
            <div class="task-actions">
              <button class="icon-btn" onclick="startEdit(${t.id})" title="Edit">✎</button>
              <button class="icon-btn del-btn" onclick="remove(${t.id})">✕</button>
            </div>
          </div>

          ${subs.length ? `
            <div class="progress-bar">
              <div class="progress-fill" style="width:${progress}%"></div>
            </div>` : ''}

          ${isExp ? `
            <div class="subtask-area">
              <div class="sub-input-row">
                <input type="text" id="sub-${t.id}" placeholder="Add subtask..." maxlength="60"
                  onkeydown="if(event.key==='Enter') addSubtask(${t.id})" />
                <button onclick="addSubtask(${t.id})">Add</button>
              </div>
              ${subs.map(s => `
                <div class="subtask-item">
                  <div class="sub-check ${s.done ? 'checked' : ''}" onclick="toggleSub(${t.id}, ${s.id})"></div>
                  <span class="sub-text ${s.done ? 'done' : ''}">${s.text}</span>
                  <button class="sub-del" onclick="removeSub(${t.id}, ${s.id})">✕</button>
                </div>
              `).join('')}
            </div>` : ''}
        </div>
      `;
    }).join('');
  }

  const done = tasks.filter(t => t.done).length;
  const overdue = tasks.filter(t => !t.done && isOverdue(t.due)).length;
  document.getElementById('stat-total').textContent = tasks.length;
  document.getElementById('stat-done').textContent = done;
  document.getElementById('stat-remaining').textContent = tasks.length - done;
  document.getElementById('stat-overdue').textContent = overdue;

  if (showHistory) renderHistory();
}

// ── Drag and drop ────────────────────────────────────────
function dragStart(e, id) {
  dragSrc = id;
  e.target.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function dragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.task-card').forEach(c => c.classList.remove('drag-over'));
  e.currentTarget.classList.add('drag-over');
}

async function drop(e, id) {
  e.preventDefault();
  if (dragSrc === id) return;
  const fromIdx = tasks.findIndex(t => t.id === dragSrc);
  const toIdx   = tasks.findIndex(t => t.id === id);
  const moved   = tasks.splice(fromIdx, 1)[0];
  tasks.splice(toIdx, 0, moved);

  // Persist new order to server
  await apiFetch("/tasks/reorder", {
    method: "PUT",
    body: JSON.stringify({ order: tasks.map(t => t.id) }),
  });
  render();
}

function dragEnd(e) {
  e.target.classList.remove('dragging');
  document.querySelectorAll('.task-card').forEach(c => c.classList.remove('drag-over'));
}

// ── Enter key to add task ────────────────────────────────
// ── Boot ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('task-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') addTask();
  });
  loadAll();
});