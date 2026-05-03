import React, { useState } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import './App.css';
import { 
  User, Mail, Briefcase, Award, FileText, MessageSquare, 
  Sparkles, CheckCircle, Clock, Send, Check, RefreshCw,
  Edit2, Save, Eye, Trash2, Plus, Code, Clipboard, Search
} from 'lucide-react';

function App() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: '',
    experience: '',
    skills: '',
    message: ''
  });

  const [output, setOutput] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [sendingCandidateId, setSendingCandidateId] = useState(null);
  const [isEditingPersonalized, setIsEditingPersonalized] = useState(false);
  const [isEditingFollowUp, setIsEditingFollowUp] = useState(false);
  const [googleToken, setGoogleToken] = useState(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState(null);

  const login = useGoogleLogin({
    onSuccess: (tokenResponse) => {
      setGoogleToken(tokenResponse.access_token);
      setIsDemoMode(false);
      alert('Successfully connected to Google! You can now send emails directly from your account.');
    },
    onError: () => alert('Failed to connect to Google.'),
    scope: 'https://www.googleapis.com/auth/gmail.send',
  });

  const enterDemoMode = () => {
    setIsDemoMode(true);
    setGoogleToken('demo-token');
    alert('Demo Mode Active! You can now test the full workflow. Emails will be sent from the developer account for demonstration purposes.');
  };

  const sendGmail = async (to, subject, body) => {
    if (isDemoMode) {
      // Fallback to Google Apps Script for Demo Mode
      const response = await fetch("https://script.google.com/macros/s/AKfycbwEzLxeGt_-w-2ngzuyTh00znpLq5PEodCdNxb9h_DsTReDbnZ7uwvcQccz2GHp-E4n/exec", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({
          email: to,
          subject: subject,
          message: body
        })
      });
      const result = await response.json();
      if (result.status !== "success") {
        throw new Error(result.message || "Demo email failed");
      }
      return result;
    }

    if (!googleToken) {
      throw new Error("NOT_AUTHENTICATED");
    }

    // Prepare email message in RFC 5322 format
    const emailLines = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/html; charset=utf-8',
      'MIME-Version: 1.0',
      '',
      body.replace(/\n/g, '<br>')
    ];
    const email = emailLines.join('\r\n');

    // Base64url encode the message
    const encodedEmail = btoa(unescape(encodeURIComponent(email)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${googleToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        raw: encodedEmail
      }),
    });

    if (!response.ok) {
      let errorMessage = "Failed to send email";
      try {
        const errorData = await response.json();
        errorMessage = errorData.error?.message || errorData.message || errorMessage;
      } catch (e) {
        errorMessage = `Server returned status ${response.status}`;
      }
      throw new Error(errorMessage);
    }
    
    return await response.json();
  };

  const handleOutputChange = (field, value) => {
    setOutput(prev => ({ ...prev, [field]: value }));
  };

  // Initial dashboard data
  const [candidates, setCandidates] = useState([]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    setIsGenerating(true);
    
    const prompt = `You are an expert AI recruitment assistant. Based on the following candidate information, generate an insight, a personalized outreach message, a follow-up message, and 3 suggestions for the recruiter.
    
Candidate Name: ${formData.name || 'Not provided'}
Role: ${formData.role || 'Not provided'}
Experience: ${formData.experience || 'Not provided'}
Skills: ${formData.skills || 'Not provided'}
Custom Context: ${formData.message || 'None'}

Return ONLY a valid JSON object in the exact format below, with no markdown formatting or other text:
{
  "insight": "Brief analysis of the candidate's fit.",
  "subjectLine": "A compelling email subject line.",
  "personalizedMessage": "The initial outreach message.",
  "followUpMessage": "A short follow-up message.",
  "suggestions": ["Suggestion 1", "Suggestion 2", "Suggestion 3"]
}`;

    try {
      const googleApiKey = import.meta.env.VITE_GOOGLE_API_KEY || ''; // Add your key in .env as VITE_GOOGLE_API_KEY
      if (!googleApiKey) {
        alert("Please set VITE_GOOGLE_API_KEY in your .env file to use the AI generator.");
        setIsGenerating(false);
        return;
      }

      // Using Google Gemini API
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${googleApiKey}`,
        {
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.7,
            }
          }),
        }
      );

      if (!response.ok) {
        let errorMsg = "Failed to generate response.";
        try {
          const errData = await response.json();
          errorMsg = errData.error?.message || errData.error || errorMsg;
        } catch(e) {}
        throw new Error(`${errorMsg} (Status: ${response.status})`);
      }

      const result = await response.json();
      const generatedText = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
      
      // Attempt to extract and parse JSON from the text
      const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsedOutput = JSON.parse(jsonMatch[0]);
        setOutput(parsedOutput);
        
        // Add candidate to pipeline if email is provided and they don't already exist
        if (formData.name && formData.email) {
          setCandidates(prev => {
            const exists = prev.find(c => c.email === formData.email);
            if (!exists) {
              return [...prev, { 
                id: Date.now(), 
                name: formData.name, 
                email: formData.email, 
                status: 'Generated',
                subjectLine: parsedOutput.subjectLine,
                personalizedMessage: parsedOutput.personalizedMessage,
                followUpMessage: parsedOutput.followUpMessage
              }];
            }
            return prev.map(c => c.email === formData.email ? {
              ...c, 
              status: 'Generated',
              subjectLine: parsedOutput.subjectLine || c.subjectLine,
              personalizedMessage: parsedOutput.personalizedMessage || c.personalizedMessage,
              followUpMessage: parsedOutput.followUpMessage || c.followUpMessage
            } : c);
          });
        }
      } else {
        throw new Error("Failed to parse the generated response. Text received: " + generatedText.substring(0, 50) + "...");
      }
    } catch (error) {
      console.error("Generation error:", error);
      if (error.message.includes("Failed to fetch")) {
        alert("Network Error: Failed to fetch. This usually means your API Key is invalid, the model is still loading, or your browser is blocking the request (CORS/Adblocker).");
      } else {
        alert(`Error: ${error.message}`);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendEmail = async () => {
    if (!formData.email) {
      alert("Please provide the candidate's email address in the form.");
      return;
    }
    if (!googleToken) {
      login();
      return;
    }
    
    setIsSendingEmail(true);
    try {
      await sendGmail(
        formData.email,
        output.subjectLine || "Job Opportunity",
        output.personalizedMessage
      );
      
      alert("Email sent successfully!");
      setCandidates(prev => {
        const exists = prev.find(c => c.email === formData.email);
        if (exists) {
          return prev.map(c => c.email === formData.email ? { ...c, status: 'Sent' } : c);
        } else {
          return [...prev, { id: Date.now(), name: formData.name, email: formData.email, status: 'Sent' }];
        }
      });
    } catch (error) {
      if (error.message === "NOT_AUTHENTICATED") {
        login();
      } else {
        alert("Email Error: " + error.message);
      }
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleTableSendEmail = async (candidate) => {
    if (!candidate.personalizedMessage) {
      alert("No message generated for this candidate yet.");
      return;
    }
    if (!googleToken) {
      login();
      return;
    }
    setSendingCandidateId(candidate.id);
    try {
      await sendGmail(
        candidate.email,
        candidate.subjectLine || "Job Opportunity",
        candidate.personalizedMessage
      );
      alert("Email sent successfully!");
      setCandidates(prev => prev.map(c => c.id === candidate.id ? { ...c, status: 'Sent' } : c));
    } catch (error) {
      if (error.message === "NOT_AUTHENTICATED") {
        login();
      } else {
        alert("Email Error: " + error.message);
      }
    } finally {
      setSendingCandidateId(null);
    }
  };

  const handleTableSendFollowUp = async (candidate) => {
    if (!candidate.followUpMessage) {
      alert("No follow-up message generated for this candidate yet.");
      return;
    }
    if (!googleToken) {
      login();
      return;
    }
    setSendingCandidateId(candidate.id + '_followup');
    try {
      await sendGmail(
        candidate.email,
        "Following up: " + (candidate.subjectLine || "Job Opportunity"),
        candidate.followUpMessage
      );
      alert("Follow-up email sent successfully!");
      setCandidates(prev => prev.map(c => c.id === candidate.id ? { ...c, status: 'Sent' } : c));
    } catch (error) {
      if (error.message === "NOT_AUTHENTICATED") {
        login();
      } else {
        alert("Email Error: " + error.message);
      }
    } finally {
      setSendingCandidateId(null);
    }
  };

  const handleTableMarkReplied = (candidateId) => {
    setCandidates(prev => prev.map(c => c.id === candidateId ? { ...c, status: 'Replied' } : c));
  };

  const handleTableDelete = (candidateId) => {
    if (window.confirm("Are you sure you want to remove this candidate from the pipeline?")) {
      setCandidates(prev => prev.filter(c => c.id !== candidateId));
    }
  };

  const handleViewDetails = (candidate) => {
    setSelectedCandidate(candidate);
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Generated':
        return <span className="badge badge-purple"><Sparkles size={12} className="icon-sm" /> Generated</span>;
      case 'Sent':
        return <span className="badge badge-blue"><Clock size={12} className="icon-sm" /> Sent</span>;
      case 'Replied':
        return <span className="badge badge-green"><CheckCircle size={12} className="icon-sm" /> Replied</span>;
      case 'No Response':
        return <span className="badge badge-gray"><RefreshCw size={12} className="icon-sm" /> No Response</span>;
      default:
        return <span className="badge badge-gray">{status}</span>;
    }
  };

  return (
    <div className="app-container">
      <header className="header">
        <div className="logo-section">
          <div className="logo">
            <Sparkles className="logo-icon" size={24} />
            <h1>RecruitAI</h1>
          </div>
          <p className="subtitle">AI-Powered Recruitment Assistant</p>
        </div>
        <div className="auth-section">
          {!googleToken ? (
            <div className="auth-buttons">
              <button className="btn-secondary-outline" onClick={enterDemoMode}>
                Try Demo Mode
              </button>
              <button className="btn-secondary" onClick={() => login()}>
                Connect Google Account
              </button>
            </div>
          ) : (
            <div className="auth-status connected">
              <CheckCircle size={16} /> {isDemoMode ? 'Demo Mode Active' : 'Google Connected'}
            </div>
          )}
        </div>
      </header>

      <main className="main-content">
        <div className="top-section">
          {/* Form Section */}
          <section className="card form-section">
            <div className="card-header">
              <h2>Candidate Details</h2>
              <p>Enter candidate information to generate AI insights</p>
            </div>
            <form onSubmit={handleGenerate}>
              <div className="form-grid">
                <div className="form-group">
                  <label>
                    <User size={16} /> Name
                  </label>
                  <input 
                    type="text" 
                    name="name" 
                    value={formData.name} 
                    onChange={handleChange} 
                    placeholder="John Doe" 
                  />
                </div>
                <div className="form-group">
                  <label>
                    <Mail size={16} /> Email
                  </label>
                  <input 
                    type="email" 
                    name="email" 
                    value={formData.email} 
                    onChange={handleChange} 
                    placeholder="john@example.com" 
                  />
                </div>
                <div className="form-group">
                  <label>
                    <Briefcase size={16} /> Role
                  </label>
                  <input 
                    type="text" 
                    name="role" 
                    value={formData.role} 
                    onChange={handleChange} 
                    placeholder="Frontend Engineer" 
                  />
                </div>
                <div className="form-group">
                  <label>
                    <Award size={16} /> Experience
                  </label>
                  <input 
                    type="text" 
                    name="experience" 
                    value={formData.experience} 
                    onChange={handleChange} 
                    placeholder="5 years" 
                  />
                </div>
                <div className="form-group full-width">
                  <label>
                    <FileText size={16} /> Skills
                  </label>
                  <input 
                    type="text" 
                    name="skills" 
                    value={formData.skills} 
                    onChange={handleChange} 
                    placeholder="React, Node.js, TypeScript" 
                  />
                </div>
                <div className="form-group full-width">
                  <label>
                    <MessageSquare size={16} /> Custom Context / Message
                  </label>
                  <textarea 
                    name="message" 
                    value={formData.message} 
                    onChange={handleChange} 
                    placeholder="Add any specific context for the AI..."
                    rows="3"
                  ></textarea>
                </div>
              </div>
              <div className="form-actions">
                <button 
                  type="submit" 
                  className="btn-primary" 
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <><RefreshCw size={18} className="spin" /> Generating...</>
                  ) : (
                    <><Sparkles size={18} /> Generate Insights</>
                  )}
                </button>
              </div>
            </form>
          </section>

          {/* Output Section */}
          <section className="card output-section">
            <div className="card-header">
              <h2>AI Generation Output</h2>
              <p>Generated insights and messages</p>
            </div>
            <div className="output-content">
              {!output && !isGenerating ? (
                <div className="empty-state">
                  <Sparkles size={48} className="empty-icon" />
                  <p>Fill out the form and click Generate to see AI insights.</p>
                </div>
              ) : isGenerating ? (
                <div className="loading-state">
                  <div className="skeleton title"></div>
                  <div className="skeleton line"></div>
                  <div className="skeleton line"></div>
                  <div className="skeleton box"></div>
                  <div className="skeleton box"></div>
                </div>
              ) : (
                <div className="generated-results">
                  <div className="result-block">
                    <h3>Insight</h3>
                    <p>{output.insight}</p>
                  </div>
                  <div className="result-block">
                    <div className="result-header">
                      <h3>Personalized Message</h3>
                      <div className="action-buttons">
                        <button 
                          className="btn-icon-text" 
                          onClick={() => setIsEditingPersonalized(!isEditingPersonalized)}
                        >
                          {isEditingPersonalized ? <><Save size={14} /> Save</> : <><Edit2 size={14} /> Edit</>}
                        </button>
                        <button 
                          className="btn-primary-small"
                          onClick={handleSendEmail}
                          disabled={isSendingEmail}
                        >
                          {isSendingEmail ? <><RefreshCw size={14} className="spin"/> Sending...</> : <><Send size={14} /> Send Email</>}
                        </button>
                      </div>
                    </div>
                    {output.subjectLine && (
                      <div className="subject-line">
                        <strong>Subject:</strong> {output.subjectLine}
                      </div>
                    )}
                    {isEditingPersonalized ? (
                      <textarea
                        className="message-textarea"
                        value={output.personalizedMessage}
                        onChange={(e) => handleOutputChange('personalizedMessage', e.target.value)}
                        rows="5"
                      />
                    ) : (
                      <div className="message-box">
                        {output.personalizedMessage}
                      </div>
                    )}
                  </div>
                  <div className="result-block">
                    <div className="result-header">
                      <h3>Follow-up Message</h3>
                      <button 
                        className="btn-icon-text" 
                        onClick={() => setIsEditingFollowUp(!isEditingFollowUp)}
                      >
                        {isEditingFollowUp ? <><Save size={14} /> Save</> : <><Edit2 size={14} /> Edit</>}
                      </button>
                    </div>
                    {isEditingFollowUp ? (
                      <textarea
                        className="message-textarea secondary"
                        value={output.followUpMessage}
                        onChange={(e) => handleOutputChange('followUpMessage', e.target.value)}
                        rows="4"
                      />
                    ) : (
                      <div className="message-box secondary">
                        {output.followUpMessage}
                      </div>
                    )}
                  </div>
                  <div className="result-block">
                    <h3>Suggestions</h3>
                    <ul className="suggestions-list">
                      {output.suggestions.map((suggestion, index) => (
                        <li key={index}>
                          <CheckCircle size={16} className="text-blue" />
                          {suggestion}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Dashboard Table Section */}
        <section className="card table-section">
          <div className="card-header">
            <h2>Candidate Pipeline</h2>
            <p>Manage your outreach candidates</p>
          </div>
          <div className="table-responsive">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((candidate) => (
                  <tr key={candidate.id}>
                    <td className="font-medium">{candidate.name}</td>
                    <td className="text-muted">{candidate.email}</td>
                    <td>{getStatusBadge(candidate.status)}</td>
                    <td>
                      <div className="action-buttons">
                        <button 
                          className="btn-icon tooltip" 
                          title="View Details"
                          onClick={() => handleViewDetails(candidate)}
                        >
                          <Eye size={16} />
                        </button>
                        <button 
                          className="btn-icon tooltip" 
                          title="Send Email"
                          onClick={() => handleTableSendEmail(candidate)}
                          disabled={sendingCandidateId === candidate.id}
                        >
                          {sendingCandidateId === candidate.id ? <RefreshCw size={16} className="spin" /> : <Send size={16} />}
                        </button>
                        <button 
                          className="btn-icon tooltip" 
                          title="Mark Replied"
                          onClick={() => handleTableMarkReplied(candidate.id)}
                        >
                          <Check size={16} />
                        </button>
                        <button 
                          className="btn-icon tooltip" 
                          title="Send Follow-up" 
                          onClick={() => handleTableSendFollowUp(candidate)}
                          disabled={sendingCandidateId === candidate.id + '_followup'}
                        >
                          {sendingCandidateId === candidate.id + '_followup' ? <RefreshCw size={16} className="spin" /> : <RefreshCw size={16} />}
                        </button>
                        <button 
                          className="btn-icon tooltip delete-btn" 
                          title="Delete Candidate"
                          onClick={() => handleTableDelete(candidate.id)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {/* Details Modal */}
      {selectedCandidate && (
        <div className="modal-overlay" onClick={() => setSelectedCandidate(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Candidate Details: {selectedCandidate.name}</h3>
              <button className="close-btn" onClick={() => setSelectedCandidate(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="detail-item">
                <label>Email</label>
                <p>{selectedCandidate.email}</p>
              </div>
              <div className="detail-item">
                <label>Status</label>
                {getStatusBadge(selectedCandidate.status)}
              </div>
              
              {selectedCandidate.subjectLine && (
                <div className="detail-item">
                  <label>Subject Line</label>
                  <div className="message-box">{selectedCandidate.subjectLine}</div>
                </div>
              )}
              
              {selectedCandidate.personalizedMessage && (
                <div className="detail-item">
                  <label>Personalized Message</label>
                  <div className="message-box" dangerouslySetInnerHTML={{ __html: selectedCandidate.personalizedMessage.replace(/\n/g, '<br>') }}></div>
                </div>
              )}
              
              {selectedCandidate.followUpMessage && (
                <div className="detail-item">
                  <label>Follow-up Message</label>
                  <div className="message-box" dangerouslySetInnerHTML={{ __html: selectedCandidate.followUpMessage.replace(/\n/g, '<br>') }}></div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setSelectedCandidate(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
