import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { QRCodeSVG } from 'qrcode.react';
import { Upload, Download, ArrowLeft, CheckCircle, Clock } from 'lucide-react';
import './index.css';

// Using VITE_BACKEND_URL for production, or local port 3000 for local dev
const SOCKET_URL = import.meta.env.PROD
  ? import.meta.env.VITE_BACKEND_URL || window.location.origin
  : `http://${window.location.hostname}:3000`;

const CHUNK_SIZE = 64 * 1024; // 64KB

function App() {
  const [role, setRole] = useState(null); // 'sender' | 'receiver' | 'history'

  return (
    <div className="app-container">
      {!role && (
        <>
          <h1 className="gradient-text">FileDrop</h1>
          <p className="subtitle">Seamlessly transfer files between devices</p>
          <div className="button-group">
            <button className="btn primary" onClick={() => setRole('sender')}>
              <Upload size={24} />
              Send File
            </button>
            <button className="btn" onClick={() => setRole('receiver')}>
              <Download size={24} />
              Receive
            </button>
            <button className="btn" onClick={() => setRole('history')}>
              <Clock size={24} />
              History
            </button>
          </div>
        </>
      )}

      {role === 'sender' && <Sender onBack={() => setRole(null)} />}
      {role === 'receiver' && <Receiver onBack={() => setRole(null)} />}
      {role === 'history' && <History onBack={() => setRole(null)} />}
    </div>
  );
}

function Sender({ onBack }) {
  const [socket, setSocket] = useState(null);
  const [pin, setPin] = useState('');
  const [file, setFile] = useState(null);
  const [receiverJoined, setReceiverJoined] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Waiting for connection...');

  const fileInputRef = useRef();

  useEffect(() => {
    const s = io(SOCKET_URL);
    setSocket(s);

    const generatedPin = Math.floor(100000 + Math.random() * 900000).toString();
    setPin(generatedPin);

    s.emit('create-room', { pin: generatedPin });

    s.on('receiver-joined', () => {
      setReceiverJoined(true);
      setStatus('Ready to send');
    });

    s.on('transfer-complete', () => {
      setStatus('Transfer Complete!');
    });

    s.on('sender-disconnected', () => {
      console.log('sender disconnected err');
    });

    return () => s.disconnect();
  }, []);

  const handleFileChange = (e) => {
    if (e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const sendFile = () => {
    if (!file || !socket) return;
    setStatus('Sending metadata...');

    socket.emit('file-metadata', {
      pin,
      metadata: {
        name: file.name,
        size: file.size,
        type: file.type
      }
    });

    setStatus('Sending file...');
    const reader = new FileReader();
    let offset = 0;

    reader.onload = (e) => {
      socket.emit('file-chunk', { pin, chunk: e.target.result });
      offset += e.target.result.byteLength;

      const percent = Math.round((offset / file.size) * 100);
      setProgress(percent);

      if (offset < file.size) {
        readSlice(offset);
      } else {
        socket.emit('transfer-complete', { pin });
        setStatus('Sent successfully!');
        setProgress(100);
      }
    };

    const readSlice = (o) => {
      const slice = file.slice(o, o + CHUNK_SIZE);
      reader.readAsArrayBuffer(slice);
    };

    // Give the receiver a moment to prepare before blasting chunks
    setTimeout(() => {
      readSlice(0);
    }, 500);
  };

  return (
    <div>
      <button className="back-btn" onClick={onBack}>
        <ArrowLeft size={16} /> Back
      </button>

      <h2 style={{ textAlign: 'center', marginBottom: '1rem' }}>Send a File</h2>

      {!receiverJoined ? (
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
            Share this PIN or scan QR on the receiving device
          </p>
          <div className="pin-display">{pin}</div>
          <div className="qr-container">
            {/* Provide URL with PIN attached for easiest access */}
            <QRCodeSVG value={`${window.location.origin}?pin=${pin}`} size={160} />
          </div>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{status}</p>
        </div>
      ) : (
        <div>
          {!file && (
            <div
              className="upload-area"
              onClick={() => fileInputRef.current.click()}
            >
              <Upload size={32} className="upload-icon" />
              <p>Click to select a file</p>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
            </div>
          )}

          {file && (
            <div style={{ textAlign: 'center', marginTop: '1rem' }}>
              <p style={{ fontWeight: '500', marginBottom: '0.5rem' }}>{file.name}</p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '2rem' }}>
                {(file.size / 1024 / 1024).toFixed(2)} MB • {file.type || 'Unknown'}
              </p>

              {progress === 0 && <button className="btn primary" onClick={sendFile} style={{ width: '100%' }}>Send Now</button>}

              {progress > 0 && (
                <div style={{ marginTop: '1rem', width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                    <span>{status}</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="progress-container">
                    <div className="progress-bar" style={{ width: `${progress}%` }} />
                  </div>
                  {progress === 100 && (
                    <div style={{ marginTop: '1rem', color: 'var(--accent-to)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                      <CheckCircle size={20} /> Transfer Done
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Receiver({ onBack }) {
  const [socket, setSocket] = useState(null);
  const [pin, setPin] = useState('');
  const [status, setStatus] = useState('Enter the 6-digit PIN');
  const [connected, setConnected] = useState(false);
  const [metadata, setMetadata] = useState(null);
  const [progress, setProgress] = useState(0);

  const chunksRef = useRef([]);
  const receivedBytesRef = useRef(0);

  // Check URL if PIN was embedded via QR code
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pinParam = params.get('pin');
    if (pinParam) {
      setPin(pinParam);
      // Auto-connect maybe? We'll let user click Receive to prevent unwanted conns.
    }

    const s = io(SOCKET_URL);
    setSocket(s);
    return () => s.disconnect();
  }, []);

  const connectToRoom = () => {
    if (!pin || pin.length !== 6 || !socket) return;
    setStatus('Connecting...');

    socket.emit('join-room', { pin }, (res) => {
      if (res.success) {
        setConnected(true);
        setStatus('Connected! Waiting for file...');
      } else {
        setStatus(res.message || 'Error joining room');
      }
    });

    socket.on('file-metadata', (meta) => {
      setMetadata(meta);
      chunksRef.current = [];
      receivedBytesRef.current = 0;
      setStatus('Receiving file...');
    });

    socket.on('file-chunk', (chunk) => {
      chunksRef.current.push(chunk);
      receivedBytesRef.current += chunk.byteLength || chunk.length;

      setMetadata(prev => {
        if (prev) {
          const percent = Math.round((receivedBytesRef.current / prev.size) * 100);
          setProgress(percent);
        }
        return prev;
      });
    });

    socket.on('transfer-complete', () => {
      setStatus('Complete!');
      setProgress(100);

      // Auto download
      const blob = new Blob(chunksRef.current);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // We need metadata object to be in state but we might read it late in a closure, so we read from state...
      // Wait, metadata state might be stale in closure? 
      // It's better to update metadata state normally and trigger download in a useEffect.
      // But we can trigger download here by using a ref if needed. 
    });

    socket.on('error', (err) => {
      setStatus(err);
    });
  };

  // Safe download trigger
  useEffect(() => {
    if (progress === 100 && metadata) {
      const blob = new Blob(chunksRef.current, { type: metadata.type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = metadata.name;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [progress, metadata]);

  return (
    <div>
      <button className="back-btn" onClick={onBack}>
        <ArrowLeft size={16} /> Back
      </button>

      <h2 style={{ textAlign: 'center', marginBottom: '1rem' }}>Receive a File</h2>

      {!connected ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '2rem' }}>
          <input
            className="pin-input"
            type="text"
            placeholder="000000"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))}
          />
          <button
            className="btn primary"
            onClick={connectToRoom}
            disabled={pin.length !== 6}
            style={{ opacity: pin.length === 6 ? 1 : 0.5 }}
          >
            Connect
          </button>
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '1rem' }}>
            {status}
          </p>
        </div>
      ) : (
        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>{status}</p>

          {metadata && (
            <div style={{ marginTop: '2rem' }}>
              <p style={{ fontWeight: '500', marginBottom: '0.5rem' }}>{metadata.name}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                <span>Downloading</span>
                <span>{progress}%</span>
              </div>
              <div className="progress-container">
                <div className="progress-bar" style={{ width: `${progress}%` }} />
              </div>
              {progress === 100 && (
                <div style={{ marginTop: '1rem', color: 'var(--accent-to)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                  <CheckCircle size={20} /> File Saved successfully!
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function History({ onBack }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch(`${SOCKET_URL}/api/history`);
        const data = await res.json();
        if (data.success) {
          setHistory(data.history);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, []);

  return (
    <div>
      <button className="back-btn" onClick={onBack}>
        <ArrowLeft size={16} /> Back
      </button>
      <h2 style={{ textAlign: 'center', marginBottom: '1rem' }}>Transfer History</h2>
      {loading ? (
        <p style={{ textAlign: 'center' }}>Loading...</p>
      ) : history.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No recent transfers found.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {history.map(item => (
            <div key={item.id} style={{ background: 'var(--surface-color)', padding: '1rem', borderRadius: '12px' }}>
              <h4 style={{ margin: '0 0 0.5rem 0' }}>{item.filename}</h4>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                <span>{(item.filesize / 1024 / 1024).toFixed(2)} MB • {item.filetype}</span>
                <span>{new Date(item.timestamp).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
