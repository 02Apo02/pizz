const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data', 'users');

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// helper
async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}
function userFilePath(id) {
  return path.join(DATA_DIR, `${id}.json`);
}

// Get user data
app.get('/api/user/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const file = userFilePath(id);
    const exists = await fs.stat(file).then(()=>true).catch(()=>false);
    if (!exists) {
      // create default user
      const defaultUser = {
        id,
        username: `user_${id}`,
        coins: 0,
        level: 1,
        messages: [],
        createdAt: new Date().toISOString()
      };
      await fs.writeFile(file, JSON.stringify(defaultUser, null, 2));
      return res.json(defaultUser);
    }
    const raw = await fs.readFile(file, 'utf8');
    return res.json(JSON.parse(raw));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'read-failed' });
  }
});

// Update user (replace or partial)
app.post('/api/user/:id', async (req, res) => {
  const id = req.params.id;
  const data = req.body;
  try {
    const file = userFilePath(id);
    const exists = await fs.stat(file).then(()=>true).catch(()=>false);
    let user = exists ? JSON.parse(await fs.readFile(file, 'utf8')) : { id, createdAt: new Date().toISOString() };
    // merge (shallow)
    user = { ...user, ...data, id };
    await fs.writeFile(file, JSON.stringify(user, null, 2));
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'write-failed' });
  }
});

// Add message to user's messages (from 'admin' or 'player')
app.post('/api/user/:id/message', async (req, res) => {
  const id = req.params.id;
  const { from, text } = req.body;
  if (!from || !text) return res.status(400).json({ error: 'missing fields' });
  try {
    const file = userFilePath(id);
    const exists = await fs.stat(file).then(()=>true).catch(()=>false);
    if (!exists) {
      await fs.writeFile(file, JSON.stringify({ id, messages: [], coins:0, createdAt:new Date().toISOString() }, null, 2));
    }
    const user = JSON.parse(await fs.readFile(file, 'utf8'));
    user.messages = user.messages || [];
    user.messages.push({ from, text, date: new Date().toISOString() });
    await fs.writeFile(file, JSON.stringify(user, null, 2));
    res.json({ ok: true, message: user.messages[user.messages.length-1] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'message-failed' });
  }
});

// Admin: list users (filenames -> ids)
app.get('/api/admin/users', async (req, res) => {
  try {
    await ensureDataDir();
    const files = await fs.readdir(DATA_DIR);
    const users = [];
    for (const f of files) {
      if (f.endsWith('.json')) {
        const raw = await fs.readFile(path.join(DATA_DIR, f), 'utf8');
        users.push(JSON.parse(raw));
      }
    }
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'list-failed' });
  }
});

// Admin: send broadcast message to all users
app.post('/api/admin/broadcast', async (req, res) => {
  const { from = 'admin', text } = req.body;
  if (!text) return res.status(400).json({ error: 'missing text' });
  try {
    await ensureDataDir();
    const files = await fs.readdir(DATA_DIR);
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const p = path.join(DATA_DIR, f);
      const user = JSON.parse(await fs.readFile(p, 'utf8'));
      user.messages = user.messages || [];
      user.messages.push({ from, text, date: new Date().toISOString() });
      await fs.writeFile(p, JSON.stringify(user, null, 2));
    }
    res.json({ ok: true, sentTo: files.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'broadcast-failed' });
  }
});

// start
ensureDataDir().then(() => {
  app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
});