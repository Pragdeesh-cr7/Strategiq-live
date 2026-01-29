require("dotenv").config();
const express = require("express");
const { Pool } = require("pg");
const path = require("path");

const app = express();

/* ===================== BASIC MIDDLEWARE ===================== */
app.use(express.json());
app.use(express.static("public"));

/* ===================== DATABASE ===================== */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/* ===================== HEALTH CHECK ===================== */
app.get("/health", (req, res) => {
  res.send("OK");
});

/* ===================== TEAMS ===================== */
app.post("/addTeam", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).send("Team name required");

    await pool.query(
      "INSERT INTO teams(name, score) VALUES($1, 1200) ON CONFLICT DO NOTHING",
      [name]
    );

    res.send("Team added");
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to add team");
  }
});

app.get("/teams", async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT name FROM teams ORDER BY name"
    );
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to fetch teams");
  }
});

/* ===================== SCORING ===================== */
app.post("/logQuestion", async (req, res) => {
  try {
    const { question, team, points, roundLabel } = req.body;
    if (!team || points === undefined)
      return res.status(400).send("Invalid payload");

    await pool.query(
      "INSERT INTO question_logs(question, team, points, round_label) VALUES($1,$2,$3,$4)",
      [question, team, points, roundLabel]
    );

    await pool.query(
      "UPDATE teams SET score = score + $1 WHERE name = $2",
      [points, team]
    );

    res.send("Logged");
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to log question");
  }
});

/* ===================== EDIT SCORE ===================== */
app.post("/updateLog", async (req, res) => {
  try {
    const { id, newPoints } = req.body;

    const oldEntry = await pool.query(
      "SELECT * FROM question_logs WHERE id = $1",
      [id]
    );

    if (oldEntry.rows.length === 0)
      return res.status(404).send("Log not found");

    const { team, points: oldPoints } = oldEntry.rows[0];
    const diff = newPoints - oldPoints;

    await pool.query(
      "UPDATE question_logs SET points = $1 WHERE id = $2",
      [newPoints, id]
    );

    await pool.query(
      "UPDATE teams SET score = score + $1 WHERE name = $2",
      [diff, team]
    );

    res.send("Updated");
  } catch (err) {
    console.error(err);
    res.status(500).send("Update failed");
  }
});

/* ===================== DELETE SCORE ===================== */
app.post("/deleteLog", async (req, res) => {
  try {
    const { id } = req.body;

    const oldEntry = await pool.query(
      "SELECT * FROM question_logs WHERE id = $1",
      [id]
    );

    if (oldEntry.rows.length === 0)
      return res.status(404).send("Log not found");

    const { team, points } = oldEntry.rows[0];

    await pool.query(
      "UPDATE teams SET score = score - $1 WHERE name = $2",
      [points, team]
    );

    await pool.query(
      "DELETE FROM question_logs WHERE id = $1",
      [id]
    );

    res.send("Deleted");
  } catch (err) {
    console.error(err);
    res.status(500).send("Delete failed");
  }
});

/* ===================== LEADERBOARD ===================== */
app.get("/scores", async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT name, score FROM teams ORDER BY score DESC"
    );
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to fetch scores");
  }
});

app.get("/questionLogs", async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT * FROM question_logs ORDER BY id DESC"
    );
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to fetch logs");
  }
});

/* ===================== CSV EXPORT ===================== */
app.get("/downloadSheet", async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT * FROM question_logs ORDER BY id ASC"
    );

    let csv = "Log ID,Round,Team,Points,Timestamp\n";

    r.rows.forEach(row => {
      const teamName = `"${row.team.replace(/"/g, '""')}"`;
      const round = row.round_label || `Q${row.question}`;
      const time = row.time ? new Date(row.time).toISOString() : "";
      csv += `${row.id},${round},${teamName},${row.points},${time}\n`;
    });

    res.header("Content-Type", "text/csv");
    res.attachment("Strategiq_Master_Sheet.csv");
    res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).send("CSV generation failed");
  }
});

/* ===================== RESET LOGIC ===================== */
app.post("/resetScores", async (req, res) => {
  try {
    await pool.query("UPDATE teams SET score = 1200");
    await pool.query("DELETE FROM question_logs");
    res.send("Scores reset");
  } catch (err) {
    console.error(err);
    res.status(500).send("Reset failed");
  }
});

app.post("/resetTournament", async (req, res) => {
  try {
    await pool.query("DELETE FROM teams");
    await pool.query("DELETE FROM question_logs");
    res.send("Tournament reset");
  } catch (err) {
    console.error(err);
    res.status(500).send("Tournament reset failed");
  }
});

/* ===================== FALLBACK ===================== */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "leaderboard.html"));
});

/* ===================== START ===================== */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log("Server running on port " + PORT)
);
