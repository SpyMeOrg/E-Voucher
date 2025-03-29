const express = require('express');
const { NodeSSH } = require('node-ssh');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const ssh = new NodeSSH();

app.post('/connect', async (req, res) => {
  try {
    const { ip, pemKey } = req.body;
    await ssh.connect({
      host: ip,
      username: 'ubuntu',
      privateKey: pemKey
    });
    res.json({ status: 'connected' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.post('/install', async (req, res) => {
  try {
    if (!ssh.isConnected()) {
      return res.status(400).json({ status: 'error', message: 'Not connected to server' });
    }

    await ssh.execCommand('sudo apt-get update');
    await ssh.execCommand('sudo apt-get install -y python3-pip');
    await ssh.execCommand('pip3 install selenium webdriver-manager');
    
    res.json({ status: 'installed' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.post('/disconnect', async (req, res) => {
  try {
    if (ssh.isConnected()) {
      ssh.dispose();
    }
    res.json({ status: 'disconnected' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 