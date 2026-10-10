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
      text: `This is an informational assistant in a healthcare logistics prototype. Use synthetic examples only.

It can discuss general logistics concepts and help interpret information you provide. It is not connected to live hospital data and cannot diagnose, triage, recommend treatment, reserve resources, or dispatch services. Qualified humans remain responsible for decisions.

Do not enter patient details or personal health information.`,
      capability: 'all',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
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
        'What information should someone have ready when contacting a licensed clinician about a health concern? Keep this to communication and access steps, not diagnosis or treatment.',
        'In a fictional emergency, what information should a caller share with local emergency services? Do not provide triage or treatment advice.',
        'How can a patient ask their care team to explain an unfamiliar medical term?'
      ]
    },
    hospital_resource_prediction: {
      label: 'Hospital Resource Estimates',
      icon: Building2,
      color: 'text-indigo-600 bg-indigo-50 border-indigo-200',
      presetPrompts: [
        'Fictional example: 3 confirmed ICU-bed requests and 2 available ICU beds were recorded. Explain this simple comparison without claiming a future forecast or recommending an action.',
        'What data would be needed to estimate emergency-department wait times? Do not invent values.',
        'A fictional facility has 8 recorded general beds and 4 confirmed bed requests in 30 days. Explain the limits of using this small count as a demand estimate.'
      ]
    },
    medicine_stock_recommendation: {
      label: 'Medicine Inventory Discussion',
      icon: Pill,
      color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
      presetPrompts: [
        'Fictional inventory example: 120 units on hand and 60 units used in 30 days. Explain which additional inputs a qualified pharmacist would need before setting a reorder point; do not recommend a quantity.',
        'What inventory fields help a pharmacy review stock status? Use general logistics terms and do not give medication or treatment advice.',
        'How can a hospital document a human-reviewed medicine stock transfer in a synthetic example?'
      ]
    },
    blood_shortage_explanation: {
      label: 'Blood Inventory Discussion',
      icon: Droplet,
      color: 'text-rose-600 bg-rose-50 border-rose-200',
      presetPrompts: [
        'Fictional example: a blood bank reports 12 available units of one blood type. Explain what additional data is needed to assess regional stock status; do not discuss transfusion decisions.',
        'What fields should a synthetic blood-inventory transfer request contain for human review? Do not make compatibility or transfusion recommendations.',
        'How can a logistics dashboard show blood inventory counts without implying clinical suitability?'
      ]
    },
    disease_trend_explanation: {
      label: 'Synthetic Trend Concepts',
      icon: TrendingUp,
      color: 'text-amber-600 bg-amber-50 border-amber-200',
      presetPrompts: [
        'Fictional example: a region recorded 14 reports this week and 10 last week. Calculate the percentage change and state that this example does not establish an outbreak.',
        'What verified data sources and review steps would be needed before discussing a disease trend? Do not infer a current outbreak.',
        'Explain why a change in synthetic report counts alone is not enough to establish an epidemiological trend.'
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
          history: messages.map(m => ({
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
            model: data.model
          }
        ]);
      } else {
        throw new Error(data.error || 'Server returned invalid response');
      }
    } catch (err: any) {
      console.error('Error sending message to /chat:', err);
      // Fail clearly; never fabricate an answer when the model endpoint is unavailable.
      setMessages(prev => [
        ...prev,
        {
          id: `asst_err_${Date.now()}`,
          sender: 'assistant',
          text: 'The AI service is unavailable. No answer was generated and your request was not recorded. Please try again later.',
          capability: cap,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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
        text: `Use synthetic examples only. This assistant is informational and not for diagnosis, triage, treatment, or dispatch. Do not enter personal health information.`,
        capability: 'all',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
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
                LifeLink AI Prototype Assistant
              </h2>
              <span className="px-2 py-0.5 text-[10px] mono font-bold rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                Informational only
              </span>
            </div>
            <p className="text-xs text-slate-400 font-normal">
              AI output is advisory • human review required
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
                  handleSendMessage('What information should someone have ready when contacting a licensed clinician about a health concern? Keep this to communication and access steps, not diagnosis or treatment.', 'patient_questions');
                }}
                className="px-2.5 py-1 rounded-md bg-white hover:bg-blue-50 text-slate-800 border border-slate-200 text-xs font-medium cursor-pointer transition-colors"
              >
                🩺 Patient Symptom Query
              </button>
              <button
                onClick={() => {
                  setSelectedCapability('hospital_resource_prediction');
                  handleSendMessage('Fictional example: 3 confirmed ICU-bed requests and 2 available ICU beds were recorded. Explain this simple comparison without claiming a future forecast or recommending an action.', 'hospital_resource_prediction');
                }}
                className="px-2.5 py-1 rounded-md bg-white hover:bg-indigo-50 text-slate-800 border border-slate-200 text-xs font-medium cursor-pointer transition-colors"
              >
                🏥 ICU Bed Forecast
              </button>
              <button
                onClick={() => {
                  setSelectedCapability('medicine_stock_recommendation');
                  handleSendMessage('Fictional inventory example: 120 units on hand and 60 units used in 30 days. Explain which additional inputs a qualified pharmacist would need before setting a reorder point; do not recommend a quantity.', 'medicine_stock_recommendation');
                }}
                className="px-2.5 py-1 rounded-md bg-white hover:bg-emerald-50 text-slate-800 border border-slate-200 text-xs font-medium cursor-pointer transition-colors"
              >
                💊 Medicine Inventory
              </button>
              <button
                onClick={() => {
                  setSelectedCapability('blood_shortage_explanation');
                  handleSendMessage('Fictional example: a blood bank reports 12 available units of one blood type. Explain what additional data is needed to assess regional stock status; do not discuss transfusion decisions.', 'blood_shortage_explanation');
                }}
                className="px-2.5 py-1 rounded-md bg-white hover:bg-rose-50 text-slate-800 border border-slate-200 text-xs font-medium cursor-pointer transition-colors"
              >
                🩸 Blood Inventory Example
              </button>
              <button
                onClick={() => {
                  setSelectedCapability('disease_trend_explanation');
                  handleSendMessage('Fictional example: a region recorded 14 reports this week and 10 last week. Calculate the percentage change and state that this example does not establish an outbreak.', 'disease_trend_explanation');
                }}
                className="px-2.5 py-1 rounded-md bg-white hover:bg-amber-50 text-slate-800 border border-slate-200 text-xs font-medium cursor-pointer transition-colors"
              >
                📈 Synthetic Trend Example
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
                      {msg.model && <span>Model: {msg.model}</span>}
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
              <span className="font-medium font-mono">Generating an informational response...</span>
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
                ? "Ask a general question using a fictional example..."
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
          <span>Not for personal medical questions or emergency care. Do not enter patient details; use synthetic examples only.</span>
        </div>
      </div>

    </div>
  );
};
