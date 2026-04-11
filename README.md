# Todo App — Full Stack Setup

## Project Structure
```
your-project/
├── index.html          ← your existing file (unchanged)
├── style.css           ← your existing file (unchanged)
├── script.js           ← REPLACE with the new script.js
├── app.py              ← NEW: Python backend
├── requirements.txt    ← NEW: Python dependencies
└── todo.db             ← auto-created when you run the server
```

## Setup (one time)

### 1. Install Python dependencies
```bash
pip install -r requirements.txt
```

### 2. Start the backend server
```bash
python app.py
```
You should see:
```
* Running on http://127.0.0.1:5000
```

### 3. Open your frontend
Open `index.html` in your browser as usual.
Your tasks now save to a real SQLite database instead of localStorage!

---

## API Endpoints (for your learning)

| Method | Endpoint                     | What it does              |
|--------|------------------------------|---------------------------|
| GET    | /tasks                       | Get all tasks             |
| POST   | /tasks                       | Add a new task            |
| PUT    | /tasks/<id>                  | Update a task             |
| DELETE | /tasks/<id>                  | Delete a task             |
| PUT    | /tasks/reorder               | Save drag-and-drop order  |
| DELETE | /tasks/clear-done            | Delete all completed tasks|
| GET    | /history                     | Get history               |
| POST   | /history/<id>/restore        | Restore a task            |

## Database (SQL)

The app uses **SQLite** — a file-based database, perfect for learning.
You can inspect it with:
```bash
sqlite3 todo.db
```
Then try SQL queries like:
```sql
SELECT * FROM tasks;
SELECT * FROM tasks WHERE done = 1;
SELECT cat, COUNT(*) FROM tasks GROUP BY cat;
```