from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_cors import CORS
import sqlite3
import json
import os

app = Flask(__name__)
CORS(app)

DB = os.path.join(os.path.dirname(__file__), "todo.db")

def get_db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS tasks (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            text      TEXT NOT NULL,
            done      INTEGER DEFAULT 0,
            cat       TEXT DEFAULT 'General',
            priority  TEXT DEFAULT 'moderate',
            due       TEXT,
            subtasks  TEXT DEFAULT '[]',
            position  INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS history (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id     INTEGER,
            text        TEXT NOT NULL,
            cat         TEXT,
            priority    TEXT,
            due         TEXT,
            subtasks    TEXT DEFAULT '[]',
            deleted_at  TEXT
        );
    """)
    conn.commit()
    conn.close()

def row_to_task(row):
    return {
        "id":       row["id"],
        "text":     row["text"],
        "done":     bool(row["done"]),
        "cat":      row["cat"],
        "priority": row["priority"],
        "due":      row["due"] or "",
        "subtasks": json.loads(row["subtasks"] or "[]"),
        "position": row["position"],
    }

def row_to_history(row):
    return {
        "id":        row["id"],
        "task_id":   row["task_id"],
        "text":      row["text"],
        "cat":       row["cat"],
        "priority":  row["priority"],
        "due":       row["due"] or "",
        "subtasks":  json.loads(row["subtasks"] or "[]"),
        "deletedAt": row["deleted_at"],
    }

# ── Tasks ──────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html")
@app.route("/tasks", methods=["GET"])
def get_tasks():
    conn = get_db()
    rows = conn.execute("SELECT * FROM tasks ORDER BY position, id").fetchall()
    conn.close()
    return jsonify([row_to_task(r) for r in rows])

@app.route("/tasks", methods=["POST"])
def add_task():
    data = request.json
    conn = get_db()
    max_pos = conn.execute("SELECT COALESCE(MAX(position),0) FROM tasks").fetchone()[0]
    cur = conn.execute(
        "INSERT INTO tasks (text, done, cat, priority, due, subtasks, position) VALUES (?,?,?,?,?,?,?)",
        (data["text"], 0, data.get("cat","General"), data.get("priority","moderate"),
         data.get("due",""), json.dumps(data.get("subtasks",[])), max_pos + 1)
    )
    conn.commit()
    row = conn.execute("SELECT * FROM tasks WHERE id=?", (cur.lastrowid,)).fetchone()
    conn.close()
    return jsonify(row_to_task(row)), 201


@app.route("/tasks/reorder", methods=["PUT"])
def reorder_tasks():
    order = request.json.get("order", [])  # list of ids in new order
    conn = get_db()
    for pos, task_id in enumerate(order):
        conn.execute("UPDATE tasks SET position=? WHERE id=?", (pos, task_id))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})
@app.route("/tasks/<int:task_id>", methods=["PUT"])
def update_task(task_id):
    data = request.json
    conn = get_db()
    conn.execute(
        "UPDATE tasks SET text=?, done=?, cat=?, priority=?, due=?, subtasks=? WHERE id=?",
        (data["text"], int(data["done"]), data["cat"], data["priority"],
         data.get("due",""), json.dumps(data.get("subtasks",[])), task_id)
    )
    conn.commit()
    row = conn.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
    conn.close()
    return jsonify(row_to_task(row))

@app.route("/tasks/<int:task_id>", methods=["DELETE"])
def delete_task(task_id):
    conn = get_db()
    row = conn.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
    if row:
        conn.execute(
            "INSERT INTO history (task_id,text,cat,priority,due,subtasks,deleted_at) VALUES (?,?,?,?,?,?,date('now'))",
            (row["id"], row["text"], row["cat"], row["priority"], row["due"], row["subtasks"])
        )
        conn.execute("DELETE FROM tasks WHERE id=?", (task_id,))
        conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/tasks/clear-done", methods=["DELETE"])
def clear_done():
    conn = get_db()
    rows = conn.execute("SELECT * FROM tasks WHERE done=1").fetchall()
    for row in rows:
        conn.execute(
            "INSERT INTO history (task_id,text,cat,priority,due,subtasks,deleted_at) VALUES (?,?,?,?,?,?,date('now'))",
            (row["id"], row["text"], row["cat"], row["priority"], row["due"], row["subtasks"])
        )
    conn.execute("DELETE FROM tasks WHERE done=1")
    conn.commit()
    conn.close()
    return jsonify({"ok": True})

# ── History ────────────────────────────────────────────

@app.route("/history", methods=["GET"])
def get_history():
    conn = get_db()
    rows = conn.execute("SELECT * FROM history ORDER BY id DESC LIMIT 50").fetchall()
    conn.close()
    return jsonify([row_to_history(r) for r in rows])

@app.route("/history/<int:hist_id>/restore", methods=["POST"])
def restore_task(hist_id):
    conn = get_db()
    row = conn.execute("SELECT * FROM history WHERE id=?", (hist_id,)).fetchone()
    if not row:
        return jsonify({"error": "Not found"}), 404
    max_pos = conn.execute("SELECT COALESCE(MAX(position),0) FROM tasks").fetchone()[0]
    cur = conn.execute(
        "INSERT INTO tasks (text, done, cat, priority, due, subtasks, position) VALUES (?,0,?,?,?,?,?)",
        (row["text"], row["cat"], row["priority"], row["due"], row["subtasks"], max_pos + 1)
    )
    conn.execute("DELETE FROM history WHERE id=?", (hist_id,))
    conn.commit()
    new_row = conn.execute("SELECT * FROM tasks WHERE id=?", (cur.lastrowid,)).fetchone()
    conn.close()
    return jsonify(row_to_task(new_row)), 201

if __name__ == "__main__":
    init_db()
    app.run(debug=True, port=5000)