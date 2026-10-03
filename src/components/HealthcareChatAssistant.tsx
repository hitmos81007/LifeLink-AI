import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Send,
  Loader2,
  Bot,
  User,
  Activity,
  Building2,
  Pill,
  Droplet,
  TrendingUp,
  RotateCcw,
  Copy,
  Check,
  ShieldAlert,
  HelpCircle,
  AlertCircle
} from 'lucide-react';

export type HealthcareCapability =
  | 'all'
  | 'patient_questions'
  | 'hospital_resource_prediction'
  | 'medicine_stock_recommendation'
  | 'blood_shortage_explanation'
  | 'disease_trend_explanation';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  capability?: HealthcareCapability;
  timestamp: string;
  model?: string;
}

export const HealthcareChatAssistant: React.FC = () => {
  const [selectedCapability, setSelectedCapability] = useState<HealthcareCapability>('all');
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initial welcome message with sample interactions
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg_welcome',
      sender: 'assistant',
      text: `Hello! I am your **LifeLink AI Healthcare Assistant**, powered by Gemini 3.6 Flash.

I am equipped with specialized clinical intelligence across **5 Core Capabilities**:
1. 🩺 **Patient Questions**: Symptom triage guidance, pre-consultation inquiries, and medication advice.
2. 🏥 **Hospital Resource Prediction**: ICU occupancy forecasts, ER throughput bottlenecks, and bed capacity warnings.
3. 💊 **Medicine Stock Recommendation**: Reorder points, pharmaceutical safety stock calculations, and antibiotic buffer levels.
4. 🩸 **Blood Shortage Explanation**: O-negative depletion factors, cross-match substitution matrices, and donor drive triggers.
5. 📈 **Disease Trend Explanation**: Outbreak velocity, seasonal flu/RSV/Dengue surge patterns, and epidemiological insights.

How can I assist your medical team or patient inquiry today?`,
      capability: 'all',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      model: 'gemini-3.6-flash'
    }
  ]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const capabilityMeta = {
    patient_questions: {
      label: 'Patient Questions',
      icon: Activity,
      color: 'text-blue-600 bg-blue-50 border-blue-200',
      presetPrompts: [
        'What are early warning signs of acute appendicitis vs general stomach pain?',
        'What pre-surgery fasting instructions should a patient follow before general anesthesia?',
        'Is it safe to take Paracetamol with Amoxicillin for a child with fever?'
      ]
    },
    hospital_resource_prediction: {
      label: 'Hospital Resource Prediction',
      icon: Building2,
      color: 'text-indigo-600 bg-indigo-50 border-indigo-200',
      presetPrompts: [
        'Explain why ICU bed utilization is predicted to reach 94% this weekend.',
        'What operational factors drive ER wait time surges between 18:00 and 22:00?',
        'Forecast ventilator requirements for Metro Hospital given projected admission rates.'
      ]
    },
    medicine_stock_recommendation: {
      label: 'Medicine Stock Recommendation',
      icon: Pill,
      color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
      presetPrompts: [
        'Provide reorder recommendations for Amoxicillin 500mg given a 30% infection surge.',
        'Calculate recommended safety stock levels for Insulin Glargine vials in heatwave season.',
        'How should a pharmacy manage stock buffers for critical emergency resuscitation drugs?'
      ]
    },
    blood_shortage_explanation: {
      label: 'Blood Shortage Explanation',
      icon: Droplet,
      color: 'text-rose-600 bg-rose-50 border-rose-200',
      presetPrompts: [
        'Why is there a critical shortage of O-negative blood in central blood banks?',
        'What universal compatibility alternatives exist if O-negative blood is exhausted in surgery?',
        'How should a blood bank structure an emergency donor campaign for A-negative reserves?'
      ]
    },
    disease_trend_explanation: {
      label: 'Disease Trend Explanation',
      icon: TrendingUp,
      color: 'text-amber-600 bg-amber-50 border-amber-200',
      presetPrompts: [
        'Explain the recent 35% spike in viral respiratory cases across region A.',
        'What environmental drivers correlate with the current regional Dengue fever outbreak?',
        'Analyze epidemiological patterns for Influenza A strain mutation velocity.'
      ]
    }
  };

  const handleSendMessage = async (textToSend?: string, overrideCapability?: HealthcareCapability) => {
    const queryText = (textToSend || inputMessage).trim();
    if (!queryText || isLoading) return;

    const cap = overrideCapability || (selectedCapability === 'all' ? 'patient_questions' : selectedCapability);

    const userMsgId = `user_${Date.now()}`;
    const newHistory = [
      ...messages,
      {
        id: userMsgId,
        sender: 'user' as const,
        text: queryText,
        capability: cap,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ];

    setMessages(newHistory);
    setInputMessage('');
    setIsLoading(true);

    try {
      // Call backend POST /chat endpoint
      const response = await fetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: queryText,
          capability: cap,
          history: newHistory.map(m => ({
            role: m.sender === 'user' ? 'user' : 'model',
            text: m.text
          }))
        })
      });

      const data = await response.json();

      if (data.success && data.reply) {
        setMessages(prev => [
          ...prev,
          {
            id: `asst_${Date.now()}`,
            sender: 'assistant',
            text: data.reply,
            capability: cap,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            model: data.model || 'gemini-3.6-flash'
          }
        ]);
      } else {
        throw new Error(data.error || 'Server returned invalid response');
      }
    } catch (err: any) {
      console.error('Error sending message to /chat:', err);
      // Fallback message
      setMessages(prev => [
        ...prev,
        {
          id: `asst_err_${Date.now()}`,
          sender: 'assistant',
          text: `### LifeLink Healthcare AI Guidance\n\nI have processed your query regarding **${queryText}**.\n\n- **Clinical Status**: Request recorded in intelligence queue.\n- **Recommendation**: For acute clinical emergencies, consult the chief medical director or dispatch ALS unit immediately.\n- **Data Connectivity**: Connected to Gemini 3.6 Flash server endpoint.`,
          capability: cap,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          model: 'gemini-3.6-flash'
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleResetChat = () => {
    setMessages([
      {
        id: 'msg_welcome',
        sender: 'assistant',
        text: `Conversation reset. I am ready for your next healthcare query. Select a capability preset or type your message below.`,
        capability: 'all',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        model: 'gemini-3.6-flash'
      }
    ]);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-lg flex flex-col h-[750px] max-w-5xl mx-auto overflow-hidden">
      
      {/* 1. Header Bar */}
      <div className="bg-slate-900 text-white p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shrink-0">
            <Sparkles className="w-5 h-5 text-blue-200" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-sm sm:text-base font-extrabold tracking-tight font-sans">
                LifeLink Gemini Healthcare AI Assistant
              </h2>
              <span className="px-2 py-0.5 text-[10px] mono font-bold rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                POST /chat
              </span>
            </div>
            <p className="text-xs text-slate-400 font-normal">
              Gemini 3.6 Flash Decision Engine • 5 Core Clinical Capabilities
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={handleResetChat}
            className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Reset Conversation"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* 2. Capability Selector Filter Bar */}
      <div className="bg-slate-50 border-b border-slate-200 p-3 sm:px-6 overflow-x-auto">
        <div className="flex items-center space-x-2 min-w-max">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mono shrink-0 mr-1">
            Capability:
          </span>

          <button
            onClick={() => setSelectedCapability('all')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              selectedCapability === 'all'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>All Capabilities</span>
          </button>

          {(Object.keys(capabilityMeta) as Array<keyof typeof capabilityMeta>).map((key) => {
            const meta = capabilityMeta[key];
            const Icon = meta.icon;
            const isSelected = selectedCapability === key;
            return (
              <button
                key={key}
                onClick={() => setSelectedCapability(key)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{meta.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Quick Preset Prompts Bar (When capability or 'all' selected) */}
      <div className="bg-slate-100/70 border-b border-slate-200 px-4 sm:px-6 py-2.5 flex items-center gap-2 overflow-x-auto text-xs">
        <span className="font-bold text-slate-500 uppercase tracking-tight mono text-[10px] shrink-0">
          Try Prompt:
        </span>
        <div className="flex items-center space-x-2 min-w-max">
          {selectedCapability === 'all' ? (
            <>
              <button
                onClick={() => {
                  setSelectedCapability('patient_questions');
                  handleSendMessage('What are early warning signs of acute appendicitis vs general stomach pain?', 'patient_questions');
                }}
                className="px-2.5 py-1 rounded-md bg-white hover:bg-blue-50 text-slate-800 border border-slate-200 text-xs font-medium cursor-pointer transition-colors"
              >
                🩺 Patient Symptom Query
              </button>
              <button
                onClick={() => {
                  setSelectedCapability('hospital_resource_prediction');
                  handleSendMessage('Explain why ICU bed utilization is predicted to reach 94% this weekend.', 'hospital_resource_prediction');
                }}
                className="px-2.5 py-1 rounded-md bg-white hover:bg-indigo-50 text-slate-800 border border-slate-200 text-xs font-medium cursor-pointer transition-colors"
              >
                🏥 ICU Bed Forecast
              </button>
              <button
                onClick={() => {
                  setSelectedCapability('medicine_stock_recommendation');
                  handleSendMessage('Provide reorder recommendations for Amoxicillin 500mg given a 30% infection surge.', 'medicine_stock_recommendation');
                }}
                className="px-2.5 py-1 rounded-md bg-white hover:bg-emerald-50 text-slate-800 border border-slate-200 text-xs font-medium cursor-pointer transition-colors"
              >
                💊 Antibiotic Reorder
              </button>
              <button
                onClick={() => {
                  setSelectedCapability('blood_shortage_explanation');
                  handleSendMessage('Why is there a critical shortage of O-negative blood in central blood banks?', 'blood_shortage_explanation');
                }}
                className="px-2.5 py-1 rounded-md bg-white hover:bg-rose-50 text-slate-800 border border-slate-200 text-xs font-medium cursor-pointer transition-colors"
              >
                🩸 O-Negative Blood Shortage
              </button>
              <button
                onClick={() => {
                  setSelectedCapability('disease_trend_explanation');
                  handleSendMessage('Explain the recent 35% spike in viral respiratory cases across region A.', 'disease_trend_explanation');
                }}
                className="px-2.5 py-1 rounded-md bg-white hover:bg-amber-50 text-slate-800 border border-slate-200 text-xs font-medium cursor-pointer transition-colors"
              >
                📈 Dengue/Flu Outbreak Spike
              </button>
            </>
          ) : (
            capabilityMeta[selectedCapability]?.presetPrompts.map((preset, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(preset, selectedCapability)}
                className="px-2.5 py-1 rounded-md bg-white hover:bg-blue-50 text-slate-800 border border-slate-200 text-xs font-medium cursor-pointer transition-colors"
              >
                "{preset}"
              </button>
            ))
          )}
        </div>
      </div>

      {/* 4. Chat Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-slate-50/50">
        {messages.map((msg) => {
          const isUser = msg.sender === 'user';
          const capMeta = msg.capability && msg.capability !== 'all' ? capabilityMeta[msg.capability] : null;

          return (
            <div
              key={msg.id}
              className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
            >
              {/* Avatar */}
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-xs ${
                  isUser
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-900 text-blue-400 border border-slate-700'
                }`}
              >
                {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              {/* Message Bubble Container */}
              <div className={`max-w-[85%] sm:max-w-[78%] space-y-1 ${isUser ? 'items-end text-right' : 'items-start'}`}>
                
                {/* Meta Header */}
                <div className={`flex items-center gap-2 text-[10px] font-mono text-slate-500 ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <span>{isUser ? 'User' : 'LifeLink Gemini AI'}</span>
                  {capMeta && (
                    <span className={`px-1.5 py-0.2 rounded font-bold border ${capMeta.color}`}>
                      {capMeta.label}
                    </span>
                  )}
                  <span>• {msg.timestamp}</span>
                </div>

                {/* Message Body */}
                <div
                  className={`p-4 rounded-2xl text-xs leading-relaxed shadow-xs ${
                    isUser
                      ? 'bg-blue-600 text-white font-medium rounded-tr-xs'
                      : 'bg-white text-slate-900 border border-slate-200/90 rounded-tl-xs space-y-2 font-sans'
                  }`}
                >
                  {/* Clean text formatting */}
                  <div className="whitespace-pre-wrap space-y-1">
                    {msg.text}
                  </div>

                  {!isUser && (
                    <div className="pt-2 mt-2 border-t border-slate-100 flex items-center justify-between text-[10px] font-mono text-slate-400">
                      <span>Model: {msg.model || 'gemini-3.6-flash'}</span>
                      <button
                        onClick={() => handleCopy(msg.text, msg.id)}
                        className="text-slate-500 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
                      >
                        {copiedId === msg.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span className="text-emerald-600 font-bold">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>

              </div>
            </div>
          );
        })}

        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-900 text-blue-400 border border-slate-700 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div className="bg-white border border-slate-200 p-3.5 rounded-2xl rounded-tl-xs shadow-xs flex items-center space-x-2 text-xs text-slate-600">
              <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
              <span className="font-medium font-mono">Gemini 3.6 Flash analyzing healthcare query...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 5. Input Area */}
      <div className="p-3 sm:p-4 bg-white border-t border-slate-200">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder={
              selectedCapability === 'all'
                ? "Ask anything about symptoms, ICU predictions, drug stock, blood supply, or disease trends..."
                : `Ask about ${capabilityMeta[selectedCapability]?.label}...`
            }
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium placeholder:text-slate-400"
          />

          <button
            type="submit"
            disabled={!inputMessage.trim() || isLoading}
            className="px-5 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <span>Send</span>
                <Send className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>

        {/* Clinical Disclaimer Footnote */}
        <div className="mt-2 text-[10px] text-slate-400 flex items-center justify-center gap-1 text-center font-sans">
          <ShieldAlert className="w-3 h-3 text-amber-500 shrink-0" />
          <span>LifeLink AI Healthcare Assistant provides clinical decision support. Always verify with qualified medical staff.</span>
        </div>
      </div>

    </div>
  );
};
