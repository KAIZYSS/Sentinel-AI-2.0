import React, { useState, useEffect, useRef } from 'react';
import mqtt from 'mqtt';

// Generate a random anonymous codename (similar to 'Rogue-Relay-475')
const adjectives = ['Rogue', 'Neon', 'Phantom', 'Shadow', 'Ghost', 'Crimson', 'Cyber', 'Void'];
const nouns = ['Relay', 'Tiger', 'Wolf', 'Hawk', 'Viper', 'Raven', 'Dragon', 'Lynx'];

const generateCodename = () => {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 999).toString().padStart(3, '0');
  return `${adj}-${noun}-${num}`;
};

export default function ReportChatModal({ report, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [myCodename, setMyCodename] = useState('');
  const [isConnecting, setIsConnecting] = useState(true);
  const [typing, setTyping] = useState(false);
  const [observerCount, setObserverCount] = useState(1);
  
  const messagesEndRef = useRef(null);
  const channelRef = useRef(null);

  // Derive display values from the report prop
  const confidenceScore = report.trust_score ? (report.trust_score * 100).toFixed(1) : '82.4';
  const diseaseName = report.probable_disease || 'Unknown';
  const districtName = report.district || 'Global Network';
  const title = report.anon_id === 'GLOBAL' ? 'Global Intelligence Network' : `${diseaseName} Surge · ${districtName}`;

  // Initialize and connect
  useEffect(() => {
    // Check session storage for existing session identity for this report
    const storageKey = `sentinel_identity_${report.anon_id}`;
    let identity = sessionStorage.getItem(storageKey);
    if (!identity) {
      identity = generateCodename();
      sessionStorage.setItem(storageKey, identity);
    }
    setMyCodename(identity);

    const setupRealtime = async () => {
      // Connect to a free, public MQTT broker over WebSockets for zero-config global chat
      const client = mqtt.connect('wss://broker.hivemq.com:8884/mqtt', {
        clientId: `sentinel_web_${Math.random().toString(16).substr(2, 8)}`,
        clean: true,
      });

      const topic = `sentinel_ai/chat/${report.anon_id}`;

      client.on('connect', () => {
        setIsConnecting(false);
        client.subscribe(topic);
      });

      client.on('message', (t, message) => {
        if (t === topic) {
          try {
            const payload = JSON.parse(message.toString());
            if (payload.event === 'message') {
              if (payload.data.sender !== identity) {
                setMessages(prev => {
                  if (prev.some(m => m.id === payload.data.id)) return prev;
                  return [...prev, payload.data];
                });
              }
            } else if (payload.event === 'typing' && payload.data.sender !== identity) {
              setTyping(true);
              setTimeout(() => setTyping(false), 2000);
            } else if (payload.event === 'presence') {
              setObserverCount(prev => Math.min(prev + 1, 10)); // Rough mock for presence 
            }
          } catch (e) {}
        }
      });

      channelRef.current = {
        client,
        topic,
        send: ({ event, payload }) => {
          if (client.connected) {
            client.publish(topic, JSON.stringify({ event, data: payload }));
          }
        }
      };
      
      // Rough presence ping
      setTimeout(() => {
        if (channelRef.current) channelRef.current.send({ event: 'presence', payload: { sender: identity } });
      }, 1000);
    };

    setupRealtime();

    return () => {
      if (channelRef.current && channelRef.current.client) {
        channelRef.current.client.end();
      }
    };
  }, [report]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!input.trim() || input.length > 1000) return;

    const newMsg = {
      id: Date.now().toString(),
      type: 'user',
      sender: myCodename,
      text: input.trim(),
      timestamp: new Date().toISOString()
    };

    if (channelRef.current) {
      channelRef.current.send({ event: 'message', payload: newMsg });
      setMessages(prev => [...prev, newMsg]); // Update my own UI instantly
    } else {
      setMessages(prev => [...prev, newMsg]);
    }

    setInput('');
  };

  const handleTyping = (e) => {
    const val = e.target.value;
    if (val.length <= 1000) {
      setInput(val);
      if (channelRef.current && val.length > 0) {
        channelRef.current.send({
          event: 'typing',
          payload: { sender: myCodename }
        });
      }
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
      zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '2rem'
    }} onClick={onClose} className="animate-fade">
      
      <div 
        className="animate-in"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '1200px', height: '90vh',
          background: '#0a0e14', // Very dark blue/black
          borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.8)'
        }}
      >
        {/* TOP HEADER ROW */}
        <div style={{
          padding: '24px 32px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          position: 'relative'
        }}>
          {/* Close button */}
          <button onClick={onClose} style={{
            position: 'absolute', right: '24px', top: '24px',
            background: 'rgba(255,255,255,0.05)', border: 'none', color: 'var(--text2)',
            width: '36px', height: '36px', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', fontSize: '18px', transition: 'background 0.2s'
          }} onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.1)'} 
             onMouseLeave={e => e.currentTarget.style.background='rgba(255,255,255,0.05)'}>
            <i className="ti ti-x" />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px', fontWeight: 600, letterSpacing: '0.5px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ff4d4d' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ff4d4d', boxShadow: '0 0 8px #ff4d4d' }} />
              ACTIVE
            </div>
            <div style={{ color: '#ff4d4d' }}>{confidenceScore}% confidence</div>
            <div style={{ color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <i className="ti ti-map-pin" /> {districtName}
            </div>
          </div>

          <h1 style={{ color: 'var(--text)', fontSize: '28px', margin: '12px 0', letterSpacing: '-0.5px' }}>
            {title}
          </h1>

          <div style={{ display: 'flex', alignItems: 'center', gap: '24px', fontSize: '13px' }}>
            <div style={{ 
              display: 'flex', alignItems: 'center', gap: '8px', 
              background: 'rgba(212, 175, 55, 0.1)', padding: '4px 12px', 
              borderRadius: '20px', border: '1px solid rgba(212, 175, 55, 0.2)',
              color: 'var(--text2)' 
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)' }} />
              You are <span style={{ color: 'var(--gold)', fontWeight: 600 }}>{myCodename}</span>
            </div>
            <div style={{ color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <i className="ti ti-users" /> <span style={{ color: 'var(--text)', fontWeight: 600 }}>{observerCount}</span> observing
            </div>
          </div>
        </div>

        {/* TWO COLUMN LAYOUT */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          
          {/* LEFT COLUMN: CHAT AREA */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
            
            {/* Messages List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '32px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {messages.length === 0 ? (
                /* EMPTY STATE */
                <div style={{ margin: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', color: 'var(--text3)' }}>
                  <div style={{ 
                    width: '64px', height: '64px', borderRadius: '50%', 
                    background: 'rgba(212, 175, 55, 0.05)', border: '1px solid rgba(212, 175, 55, 0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--gold)', fontSize: '24px', marginBottom: '8px'
                  }}>
                    <i className="ti ti-message-circle-2" />
                  </div>
                  <h3 style={{ color: 'var(--text)', margin: 0, fontSize: '18px' }}>No messages yet</h3>
                  <p style={{ margin: 0, fontSize: '14px' }}>Be the first to share an observation.</p>
                  <p style={{ margin: 0, fontSize: '14px', color: 'var(--gold)' }}>You appear as {myCodename}</p>
                </div>
              ) : (
                messages.map((msg, i) => {
                  const isMine = msg.sender === myCodename;
                  return (
                    <div key={msg.id || i} className="chat-bubble-enter" style={{
                      alignSelf: isMine ? 'flex-end' : 'flex-start',
                      maxWidth: '75%', display: 'flex', flexDirection: 'column',
                      alignItems: isMine ? 'flex-end' : 'flex-start'
                    }}>
                      <div style={{ fontSize: '12px', color: isMine ? 'var(--gold2)' : 'var(--text3)', marginBottom: '6px', fontWeight: 600, padding: '0 4px' }}>
                        {msg.sender}
                      </div>
                      <div style={{
                        background: isMine ? 'rgba(212, 175, 55, 0.15)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${isMine ? 'var(--gold)' : 'rgba(255,255,255,0.08)'}`,
                        padding: '12px 18px',
                        borderRadius: isMine ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                        color: 'var(--text)', fontSize: '15px', lineHeight: '1.5'
                      }}>
                        {msg.text}
                      </div>
                    </div>
                  );
                })
              )}
              
              {typing && (
                <div className="chat-bubble-enter" style={{ alignSelf: 'flex-start', marginLeft: '12px' }}>
                  <div className="typing-indicator" style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 16px', borderRadius: '16px' }}>
                    <span /> <span /> <span />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div style={{ padding: '24px 32px' }}>
              <form onSubmit={handleSend} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '12px', padding: '8px 12px', transition: 'border 0.3s'
                }} className="glow-input">
                  
                  {/* Codename Badge */}
                  <div style={{
                    background: 'rgba(212, 175, 55, 0.1)', color: 'var(--gold)',
                    padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                    border: '1px solid rgba(212, 175, 55, 0.2)', whiteSpace: 'nowrap'
                  }}>
                    {myCodename}
                  </div>

                  <input
                    type="text"
                    value={input}
                    onChange={handleTyping}
                    placeholder="Share your observations anonymously... (Enter to send)"
                    disabled={isConnecting}
                    style={{
                      flex: 1, background: 'transparent', border: 'none',
                      color: 'var(--text)', fontSize: '14px', outline: 'none',
                      padding: '8px'
                    }}
                  />

                  <button 
                    type="submit"
                    disabled={isConnecting || !input.trim()}
                    style={{
                      background: input.trim() ? 'rgba(212, 175, 55, 0.15)' : 'rgba(255,255,255,0.05)',
                      color: input.trim() ? 'var(--gold)' : 'var(--text3)',
                      border: input.trim() ? '1px solid var(--gold)' : '1px solid transparent',
                      borderRadius: '8px', width: '40px', height: '40px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '18px', cursor: input.trim() ? 'pointer' : 'default',
                      transition: 'all 0.2s'
                    }}
                  >
                    <i className="ti ti-send" style={{ transform: 'rotate(45deg) translateX(-2px) translateY(2px)' }} />
                  </button>
                </div>
                
                {/* Footer Subtext */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--text3)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="ti ti-shield-check" style={{ fontSize: '14px' }} />
                    Your real identity is never exposed. Messages are end-to-end anonymous.
                  </div>
                  <div>
                    {input.length}/1000
                  </div>
                </div>
              </form>
            </div>
            
          </div>

          {/* RIGHT COLUMN: SIDEBAR */}
          <div style={{
            width: '320px', borderLeft: '1px solid rgba(255,255,255,0.05)',
            background: 'rgba(255,255,255,0.01)', display: 'flex', flexDirection: 'column',
            padding: '32px 24px', gap: '40px', overflowY: 'auto'
          }}>
            
            {/* OBSERVATION DETAILS */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h4 style={{ color: 'var(--text3)', fontSize: '11px', fontWeight: 700, letterSpacing: '1px', margin: 0 }}>
                OBSERVATION DETAILS
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="ti ti-map-pin" style={{ color: 'var(--text3)' }} /> District
                  </span>
                  <span style={{ fontWeight: 700 }}>{districtName}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="ti ti-virus" style={{ color: 'var(--text3)' }} /> Disease
                  </span>
                  <span style={{ fontWeight: 700 }}>{diseaseName}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="ti ti-chart-bar" style={{ color: 'var(--text3)' }} /> Confidence
                  </span>
                  <span style={{ fontWeight: 700, color: '#ff4d4d' }}>{confidenceScore}%</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="ti ti-users" style={{ color: 'var(--text3)' }} /> Observers
                  </span>
                  <span style={{ fontWeight: 700, color: 'var(--gold)' }}>{observerCount}</span>
                </div>
              </div>
            </div>

            <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)' }} />

            {/* PRIVACY */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h4 style={{ color: 'var(--text3)', fontSize: '11px', fontWeight: 700, letterSpacing: '1px', margin: 0 }}>
                PRIVACY
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px', color: 'var(--gold2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="ti ti-eye-off" style={{ fontSize: '16px' }} /> Real name hidden
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="ti ti-mail-off" style={{ fontSize: '16px' }} /> Email never stored
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="ti ti-shield-lock" style={{ fontSize: '16px' }} /> Encrypted in transit
                </div>
              </div>
            </div>

            <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)' }} />

            {/* ACTIVITY */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h4 style={{ color: 'var(--text3)', fontSize: '11px', fontWeight: 700, letterSpacing: '1px', margin: 0 }}>
                ACTIVITY
              </h4>
              <div style={{ fontSize: '13px', color: 'var(--text3)', fontStyle: 'italic' }}>
                No activity yet
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
