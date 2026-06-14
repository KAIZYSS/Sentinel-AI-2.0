import React, { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { isMock } from '../lib/supabase';

export default function DoctorAgentModal({ district, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [activeDisease, setActiveDisease] = useState(null);
  
  // Intelligence context
  const [districtIntel, setDistrictIntel] = useState(null);
  const [diseaseProfiles, setDiseaseProfiles] = useState([]);
  const [recentSignals, setRecentSignals] = useState([]);
  
  // New States for Gemini HealthBot MVP
  const [symptomState, setSymptomState] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [preview, setPreview] = useState(null);
  const [explainability, setExplainability] = useState(null);
  const [predictorTopMatch, setPredictorTopMatch] = useState(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showExplainability, setShowExplainability] = useState(false);
  const [verifiedResources, setVerifiedResources] = useState([]);
  const [loadingResources, setLoadingResources] = useState(false);
  
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // Fetch all context on mount: intelligence + profiles + signals
  useEffect(() => {
    const fetchContext = async () => {
      setIsTyping(true);
      try {
        const [signals, intel, profiles] = await Promise.all([
          api.getSignals(district),
          api.getIntelligence(district).catch(() => null),
          api.getDiseaseProfiles().catch(() => [])
        ]);
        
        setRecentSignals(signals || []);
        setDistrictIntel(intel);
        setDiseaseProfiles(profiles || []);
        
        const topSignal = signals?.sort((a, b) => b.confidence - a.confidence)[0];
        
        let greeting = `Hello. I am the Sentinel Medical AI. `;
        
        // Use real intelligence data for greeting
        if (intel && intel.threat_level && intel.threat_level !== 'low') {
          const dom = intel.dominant_disease || topSignal?.symptoms?.[0] || 'unknown infections';
          setActiveDisease(dom);
          greeting += `I see you are in **${district || 'this region'}**, currently at **${intel.threat_level.toUpperCase()}** threat level. `;
          greeting += `Our intelligence indicates **${dom}** as the primary disease driver. `;
          if (intel.confidence_level) greeting += `Confidence: **${intel.confidence_level}**. `;
        } else if (topSignal && topSignal.confidence > 50 && !isMock) {
          setActiveDisease(topSignal.symptoms?.[0] || 'unknown infections');
          greeting += `I see you are in **${district || 'this region'}**, where our sensors have detected a high risk of **${topSignal.symptoms?.[0] || 'an outbreak'}**. `;
        } else {
          greeting += `I am monitoring the live health network in **${district || 'your region'}**. `;
        }
        greeting += `\n\nPlease describe your symptoms, or upload a recent lab report/prescription for analysis.`;

        setTimeout(() => {
          setMessages([{ id: 'msg-0', type: 'ai', text: greeting, isGreeting: true }]);
          setIsTyping(false);
        }, 1200);
      } catch (err) {
        setIsTyping(false);
      }
    };
    fetchContext();
  }, [district]);

  // Fetch verified resources from OpenStreetMap near the district
  useEffect(() => {
    if (!district) return;
    const fetchResources = async () => {
      setLoadingResources(true);
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=clinic+OR+hospital+in+${encodeURIComponent(district)}&format=json&limit=3`);
        const data = await res.json();
        if (data && data.length > 0) {
          setVerifiedResources(data.map(d => ({
            name: d.name || d.display_name.split(',')[0],
            address: d.display_name,
            lat: d.lat,
            lon: d.lon,
            mapLink: `https://www.google.com/maps/search/?api=1&query=${d.lat},${d.lon}`
          })));
        }
      } catch (e) {
        console.error("Error fetching local resources:", e);
      } finally {
        setLoadingResources(false);
      }
    };
    fetchResources();
  }, [district]);

  useEffect(() => {
    const timer = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
    return () => clearTimeout(timer);
  }, [messages, isTyping, isScanning, showPreview, showExplainability, preview, explainability, verifiedResources]);

  const callHealthBotAPI = async (text, isFile = false, fileDetails = null) => {
    setIsTyping(true);

    const userMsg = isFile ? {
      id: `msg-${Date.now()}`,
      type: 'user',
      isFile: true,
      fileName: fileDetails.name,
      fileSize: fileDetails.size,
      text: `[Uploaded Document: ${fileDetails.name}]`
    } : {
      id: `msg-${Date.now()}`,
      type: 'user',
      text
    };

    // Calculate updated messages list to pass to the API
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);

    // Map history to format required by the backend
    const apiMessages = updatedMessages.map(m => ({
      role: m.type === 'user' ? 'user' : 'assistant',
      content: m.text
    }));

    try {
      const response = await api.chatHealthBot(district || 'New Delhi', apiMessages);
      
      setIsTyping(false);
      
      // Update states from backend response
      if (response) {
        setSymptomState(response.symptom_state);
        setShowPreview(response.show_preview);
        setPreview(response.preview);
        setExplainability(response.explainability);
        setPredictorTopMatch(response.predictor_top_match);
        
        // Add AI message to messages list
        setMessages(prev => [...prev, {
          id: `msg-${Date.now()}`,
          type: 'ai',
          text: response.response_text
        }]);
      }
    } catch (err) {
      setIsTyping(false);
      setMessages(prev => [...prev, {
        id: `msg-${Date.now()}`,
        type: 'ai',
        text: `Error connecting to Sentinel Medical AI: ${err.message}. Please try again.`
      }]);
    }
  };

  const handleSend = (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const currentInput = input.trim();
    setInput('');
    
    callHealthBotAPI(currentInput, false);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const fileName = file.name;
    const fileSize = (file.size / 1024).toFixed(1) + ' KB';

    // Trigger scanning animation
    setIsScanning(true);
    
    setTimeout(() => {
      setIsScanning(false);
      callHealthBotAPI(`[Uploaded Document Analysis: ${fileName}]`, true, { name: fileName, size: fileSize });
    }, 3000); // 3 seconds to "scan"
    
    // reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmitReport = async () => {
    if (!preview) return;
    setIsSubmitting(true);
    try {
      // Free text summary of the healthbot diagnostic session
      const chatLogs = messages
        .filter(m => m.type === 'user')
        .map(m => m.text)
        .join(' | ');
      const freeText = `Sentinel HealthBot Chat Session. Severity: ${preview.severity}, Duration: ${preview.duration_days} days. Context: ${chatLogs}`;
      
      await api.submitReport(district, preview.symptoms, freeText);
      setIsSubmitted(true);
    } catch (err) {
      console.error("Failed to submit report:", err);
      alert("Submission failed: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Utility to render bold markdown and links
  const renderMarkdown = (text) => {
    if (!text) return null;
    const parts = text.split(/(\*\*.*?\*\*|\[.*?\]\(.*?\))/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} style={{ color: 'var(--gold)' }}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('[') && part.includes('](') && part.endsWith(')')) {
        const titleMatch = part.match(/\[(.*?)\]/);
        const urlMatch = part.match(/\((.*?)\)/);
        if (titleMatch && urlMatch) {
          return (
            <a key={i} href={urlMatch[1]} target="_blank" rel="noopener noreferrer" 
               style={{ color: '#00ffcc', textDecoration: 'none', background: 'rgba(0,255,204,0.1)', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', border: '1px solid rgba(0,255,204,0.2)' }}>
              {titleMatch[1]}
            </a>
          );
        }
      }
      return part;
    });
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)',
      zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '2rem'
    }} onClick={onClose} className="animate-fade responsive-modal-overlay">
      
      <div 
        className="animate-in responsive-modal-box"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '800px', height: '85vh',
          background: 'linear-gradient(180deg, #0a0e14 0%, #05070a 100%)',
          borderRadius: '24px', border: '1px solid rgba(0, 255, 204, 0.1)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,255,204,0.1)'
        }}
      >
        {/* HEADER */}
        <div className="modal-header-resp" style={{
          borderBottom: '1px solid rgba(0,255,204,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(0, 255, 204, 0.02)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '12px',
              background: 'rgba(0, 255, 204, 0.1)', border: '1px solid rgba(0, 255, 204, 0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#00ffcc', fontSize: '24px', boxShadow: '0 0 20px rgba(0, 255, 204, 0.2)'
            }}>
              <i className="ti ti-brain" />
            </div>
            <div>
              <h2 style={{ margin: 0, color: 'var(--text)', fontSize: '20px', letterSpacing: '0.5px' }}>Sentinel Medical AI</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#00ffcc', marginTop: '4px' }}>
                <div className="live-dot" style={{ background: '#00ffcc', boxShadow: '0 0 8px #00ffcc' }} />
                System Online • Regional Context Active
              </div>
            </div>
          </div>
          
          <button onClick={onClose} className="close-btn" style={{
            background: 'rgba(255,255,255,0.05)', border: 'none', color: 'var(--text2)',
            width: '44px', height: '44px', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', fontSize: '20px', transition: 'background 0.2s'
          }} onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.1)'} 
             onMouseLeave={e => e.currentTarget.style.background='rgba(255,255,255,0.05)'}>
            <i className="ti ti-x" />
          </button>
        </div>

        {/* CHAT AREA */}
        <div className="chat-area" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          
          {/* Permanent Disclaimer Banner */}
          <div style={{
            background: 'rgba(255, 77, 77, 0.03)',
            border: '1px solid rgba(255, 77, 77, 0.15)',
            borderRadius: '12px',
            padding: '16px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            color: 'var(--text2)',
            fontSize: '13px',
            lineHeight: '1.5'
          }}>
            <i className="ti ti-alert-triangle" style={{ color: '#ff4d4d', fontSize: '18px', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong style={{ color: '#ff4d4d', display: 'block', marginBottom: '2px', fontSize: '12px', letterSpacing: '0.5px' }}>
                MEDICAL SAFETY DISCLAIMER
              </strong>
              Sentinel AI HealthBot is an experimental epidemiological assistant, not a doctor. This system is for disease surveillance and guidance, and does not substitute for professional medical advice, diagnosis, or treatment. Do not upload sensitive personally identifiable information (PII).
            </div>
          </div>

          {messages.map((msg) => {
            const isUser = msg.type === 'user';
            
            if (isUser) {
              return (
                <div key={msg.id} className="chat-bubble-enter" style={{ alignSelf: 'flex-end', maxWidth: '80%' }}>
                  <div style={{
                    background: 'rgba(0, 255, 204, 0.1)', border: '1px solid rgba(0, 255, 204, 0.2)',
                    padding: '16px 20px', borderRadius: '20px 20px 4px 20px',
                    color: 'var(--text)', fontSize: '15px', lineHeight: '1.5',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)'
                  }}>
                    {msg.isFile ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <i className="ti ti-file-text" style={{ fontSize: '24px', color: '#00ffcc' }} />
                        <div>
                          <div style={{ fontWeight: 600 }}>Uploaded Report</div>
                          <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{msg.fileName} • {msg.fileSize}</div>
                        </div>
                      </div>
                    ) : (
                      msg.text
                    )}
                  </div>
                </div>
              );
            }

            // AI Message
            return (
              <div key={msg.id} className="chat-bubble-enter" style={{ alignSelf: 'flex-start', maxWidth: '85%', display: 'flex', gap: '16px' }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(0, 255, 204, 0.1)', border: '1px solid rgba(0, 255, 204, 0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#00ffcc', fontSize: '18px', marginTop: '4px'
                }}>
                  <i className="ti ti-robot" />
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
                  <div style={{
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                    padding: '16px 20px', borderRadius: '4px 20px 20px 20px',
                    color: 'var(--text2)', fontSize: '15px', lineHeight: '1.6',
                    whiteSpace: 'pre-wrap'
                  }}>
                    {renderMarkdown(msg.text)}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Structured Incident Preview Card */}
          {showPreview && preview && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.06) 0%, rgba(10, 14, 23, 0.95) 100%)',
              border: '1px solid rgba(212, 175, 55, 0.25)',
              borderRadius: '16px',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              boxShadow: '0 8px 32px rgba(212, 175, 55, 0.05)',
              marginTop: '12px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--gold)', fontWeight: 700, fontSize: '14px', letterSpacing: '0.5px' }}>
                  <i className="ti ti-shield-alert" style={{ fontSize: '18px' }} />
                  STRUCTURED INCIDENT PREVIEW
                </div>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  background: preview.confidence_band === 'high' ? 'rgba(0, 255, 204, 0.1)' : preview.confidence_band === 'medium' ? 'rgba(212, 175, 55, 0.1)' : 'rgba(255, 77, 77, 0.1)',
                  color: preview.confidence_band === 'high' ? '#00ffcc' : preview.confidence_band === 'medium' ? 'var(--gold)' : '#ff4d4d',
                  border: `1px solid ${preview.confidence_band === 'high' ? 'rgba(0, 255, 204, 0.2)' : preview.confidence_band === 'medium' ? 'rgba(212, 175, 55, 0.2)' : 'rgba(255, 77, 77, 0.2)'}`
                }}>
                  Confidence: {preview.confidence_band}
                </span>
              </div>

              <div className="grid-responsive-2" style={{ gap: '16px' }}>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '6px', fontWeight: 600 }}>Extracted Symptoms</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {preview.symptoms && preview.symptoms.length > 0 ? (
                      preview.symptoms.map((s, idx) => (
                        <span key={idx} style={{
                          fontSize: '12px',
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          color: 'var(--text2)'
                        }}>
                          {s.replace(/_/g, ' ')}
                        </span>
                      ))
                    ) : (
                      <span style={{ fontSize: '12px', color: 'var(--text3)' }}>None extracted</span>
                    )}
                  </div>
                </div>
                <div>
                  <div style={{ display: 'flex', gap: '24px' }}>
                    <div>
                      <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '6px', fontWeight: 600 }}>Severity</div>
                      <span style={{
                        fontSize: '13px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: preview.severity === 'severe' ? 'rgba(255,77,77,0.1)' : preview.severity === 'moderate' ? 'rgba(212,175,55,0.1)' : 'rgba(0,255,204,0.1)',
                        color: preview.severity === 'severe' ? '#ff4d4d' : preview.severity === 'moderate' ? 'var(--gold)' : '#00ffcc'
                      }}>
                        {preview.severity.toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '6px', fontWeight: 600 }}>Duration</div>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text2)' }}>
                        {preview.duration_days} {preview.duration_days === 1 ? 'Day' : 'Days'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '8px', fontWeight: 600 }}>Possible Conditions (Predictor Match)</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {preview.possible_conditions && preview.possible_conditions.length > 0 ? (
                    preview.possible_conditions.map((c, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text2)' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--gold)', boxShadow: '0 0 6px var(--gold)' }} />
                        {c}
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: '13px', color: 'var(--text3)' }}>No matching profiles found</div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px', marginTop: '8px' }}>
                {isSubmitted ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#00ffcc', fontSize: '13px', fontWeight: 600 }}>
                    <i className="ti ti-circle-check" style={{ fontSize: '18px' }} />
                    Incident successfully submitted to Sentinel Intelligence! 🛡
                  </div>
                ) : (
                  <button
                    onClick={handleSubmitReport}
                    disabled={isSubmitting}
                    style={{
                      background: 'var(--gold)',
                      color: 'var(--bg)',
                      border: 'none',
                      padding: '10px 20px',
                      borderRadius: '20px',
                      fontWeight: 700,
                      fontSize: '13px',
                      cursor: isSubmitting ? 'default' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'all 0.2s',
                      boxShadow: '0 4px 12px rgba(212, 175, 55, 0.15)'
                    }}
                    onMouseEnter={e => { if (!isSubmitting) e.currentTarget.style.opacity = '0.9'; }}
                    onMouseLeave={e => { if (!isSubmitting) e.currentTarget.style.opacity = '1'; }}
                  >
                    <i className={`ti ti-${isSubmitting ? 'loader animate-spin' : 'shield-check'}`} />
                    {isSubmitting ? 'Submitting...' : 'Submit to Sentinel Intelligence'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Explainability Accordion Panel */}
          {showPreview && explainability && (
            <div style={{
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
              overflow: 'hidden',
              marginTop: '12px'
            }}>
              <button
                onClick={() => setShowExplainability(!showExplainability)}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  padding: '16px 20px',
                  color: 'var(--text2)',
                  fontSize: '14px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="ti ti-help-circle" style={{ color: 'var(--gold)', fontSize: '18px' }} />
                  Why did HealthBot suggest this? (Predictor & AI Transparency)
                </span>
                <i className={`ti ti-chevron-${showExplainability ? 'up' : 'down'}`} style={{ fontSize: '16px', color: 'var(--text3)' }} />
              </button>

              {showExplainability && (
                <div style={{
                  padding: '0 20px 20px 20px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  fontSize: '13px',
                  lineHeight: '1.6'
                }}>
                  {/* Predictor Top Match Block */}
                  {predictorTopMatch && (
                    <div style={{
                      background: 'rgba(212, 175, 55, 0.03)',
                      border: '1px solid rgba(212, 175, 55, 0.1)',
                      borderRadius: '8px',
                      padding: '12px 16px',
                      marginTop: '16px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontWeight: 600, color: 'var(--gold)' }}>Predictor Engine Top Candidate</span>
                        <span style={{
                          background: 'var(--gold)',
                          color: 'var(--bg)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 700
                        }}>
                          {(predictorTopMatch.score * 100).toFixed(0)}% MATCH
                        </span>
                      </div>
                      <div style={{ color: 'var(--text2)' }}>
                        The mathematical predictor engine matched the extracted symptoms against our reference disease database, identifying <strong style={{ color: 'var(--text)' }}>{predictorTopMatch.disease}</strong> as the highest probability agent.
                      </div>
                    </div>
                  )}

                  {/* Symptoms Used */}
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>1. Extracted Symptoms Logged</div>
                    <div style={{ color: 'var(--text3)' }}>
                      {explainability.symptoms_used && explainability.symptoms_used.length > 0
                        ? explainability.symptoms_used.join(', ')
                        : 'No symptoms extracted yet.'}
                    </div>
                  </div>

                  {/* Profile Matches */}
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>2. Disease Profile Match Details</div>
                    <div style={{ color: 'var(--text3)' }}>
                      {explainability.disease_profile_matches && explainability.disease_profile_matches.length > 0 ? (
                        <ul style={{ margin: 0, paddingLeft: '20px' }}>
                          {explainability.disease_profile_matches.map((m, idx) => (
                            <li key={idx}>{m}</li>
                          ))}
                        </ul>
                      ) : (
                        'No match logs.'
                      )}
                    </div>
                  </div>

                  {/* District Context Used */}
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>3. District Context Factor</div>
                    <div style={{ color: 'var(--text3)' }}>
                      {explainability.district_context_used || 'None applied.'}
                    </div>
                  </div>

                  {/* Gemini Reasoning */}
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>4. AI Reasoning (Gemini Explanation)</div>
                    <div style={{ color: 'var(--text3)', whiteSpace: 'pre-wrap' }}>
                      {explainability.predictor_reasoning || 'No explanation generated.'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Verified Local Resources Panel */}
          {showPreview && verifiedResources.length > 0 && (
            <div style={{
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
              padding: '20px',
              marginTop: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#00ffcc', fontWeight: 700, fontSize: '13px', letterSpacing: '0.5px', marginBottom: '16px' }}>
                <i className="ti ti-building-hospital" style={{ fontSize: '18px' }} />
                VERIFIED LOCAL MEDICAL RESOURCES ({district?.toUpperCase()})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {verifiedResources.map((res, idx) => (
                  <div key={idx} style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '12px'
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: '14px', marginBottom: '4px' }}>{res.name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text3)', lineHeight: '1.4' }}>📍 {res.address}</div>
                    </div>
                    <a
                      href={res.mapLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        background: 'rgba(0, 255, 204, 0.1)',
                        border: '1px solid rgba(0, 255, 204, 0.2)',
                        color: '#00ffcc',
                        textDecoration: 'none',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(0, 255, 204, 0.2)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'rgba(0, 255, 204, 0.1)'}
                    >
                      View on Map
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SCANNING ANIMATION */}
          {isScanning && (
            <div className="chat-bubble-enter" style={{ alignSelf: 'flex-start', marginLeft: '52px' }}>
              <div style={{
                background: 'rgba(0, 255, 204, 0.05)', border: '1px solid rgba(0, 255, 204, 0.2)',
                padding: '16px 24px', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '12px',
                width: '300px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#00ffcc', fontSize: '13px', fontWeight: 600 }}>
                  <i className="ti ti-scan spin-slow" /> Analyzing Document...
                </div>
                <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div className="scan-progress" style={{ height: '100%', width: '50%', background: '#00ffcc', borderRadius: '2px' }} />
                </div>
              </div>
            </div>
          )}

          {/* TYPING ANIMATION */}
          {isTyping && !isScanning && (
            <div className="chat-bubble-enter" style={{ alignSelf: 'flex-start', marginLeft: '52px' }}>
              <div className="typing-indicator" style={{ background: 'rgba(255,255,255,0.03)', padding: '12px 16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ background: '#00ffcc' }} /> <span style={{ background: '#00ffcc' }} /> <span style={{ background: '#00ffcc' }} />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* INPUT AREA */}
        <div className="modal-footer-resp" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.2)' }}>
          <form onSubmit={handleSend} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            
            {/* Hidden File Input */}
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              onChange={handleFileUpload} 
              accept="image/*,.pdf"
            />
            
            {/* Upload Button */}
            <button 
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isTyping || isScanning}
              style={{
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                color: 'var(--text2)', width: '48px', height: '48px', borderRadius: '12px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: (isTyping || isScanning) ? 'default' : 'pointer', fontSize: '20px', transition: 'all 0.2s'
              }}
              onMouseEnter={e => { if(!isTyping && !isScanning) e.currentTarget.style.background='rgba(255,255,255,0.1)' }}
              onMouseLeave={e => { if(!isTyping && !isScanning) e.currentTarget.style.background='rgba(255,255,255,0.05)' }}
            >
              <i className="ti ti-paperclip" />
            </button>

            {/* Text Input */}
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center',
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '12px', padding: '0 16px', height: '48px', transition: 'border 0.3s'
            }}>
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Describe your symptoms or ask a medical question..."
                disabled={isTyping || isScanning}
                style={{
                  flex: 1, background: 'transparent', border: 'none',
                  color: 'var(--text)', fontSize: '15px', outline: 'none'
                }}
              />
            </div>

            {/* Send Button */}
            <button 
              type="submit"
              disabled={isTyping || isScanning || !input.trim()}
              style={{
                background: input.trim() ? 'rgba(0, 255, 204, 0.15)' : 'rgba(255,255,255,0.05)',
                color: input.trim() ? '#00ffcc' : 'var(--text3)',
                border: input.trim() ? '1px solid #00ffcc' : '1px solid transparent',
                borderRadius: '12px', width: '48px', height: '48px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '20px', cursor: input.trim() ? 'pointer' : 'default',
                transition: 'all 0.2s'
              }}
            >
              <i className="ti ti-send" style={{ transform: 'rotate(45deg) translateX(-2px) translateY(2px)' }} />
            </button>
          </form>
          <div style={{ fontSize: '11px', color: 'var(--text3)', textAlign: 'center', marginTop: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <i className="ti ti-lock" /> Medical reports are processed securely and never stored without consent.
          </div>
        </div>

      </div>
    </div>
  );
}
