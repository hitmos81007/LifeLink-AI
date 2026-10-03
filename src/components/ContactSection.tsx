import React, { useState } from 'react';
import { Mail, Phone, MapPin, Send, CheckCircle2, ShieldCheck, AlertCircle, Building, User, FileText } from 'lucide-react';
import { ContactFormData } from '../types/landing';

export const ContactSection: React.FC = () => {
  const [formData, setFormData] = useState<ContactFormData>({
    fullName: '',
    email: '',
    organization: '',
    role: 'Hospital Administrator',
    phone: '',
    message: '',
    urgentInquiry: false,
  });

  const [submitted, setSubmitted] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName || !formData.email || !formData.message) return;

    setIsSending(true);
    setTimeout(() => {
      setIsSending(false);
      setSubmitted(true);
    }, 600);
  };

  return (
    <section id="contact" className="py-20 bg-white dark:bg-slate-950 relative border-b border-slate-200 dark:border-slate-800 transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-3 mb-16">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            <Mail className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span className="text-xs font-bold uppercase tracking-wider mono">
              Get In Touch
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Contact LifeLink AI Engineering Team
          </h2>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed font-normal">
            Interested in connecting your hospital, blood bank, or municipal ambulance fleet? Reach out for integration sandbox access or deployment inquiries.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start max-w-6xl mx-auto">
          
          {/* Left Contact Details & Quick Support Cards */}
          <div className="lg:col-span-5 space-y-6">
            
            <div className="bg-slate-900 dark:bg-slate-900 text-white rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl border border-slate-800">
              <h3 className="text-xl font-bold text-white tracking-tight">
                Emergency Integration Command
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Our healthcare integration architects provide 24/7 assistance for HL7 / FHIR connectors, FastAPI REST gateways, and city signal preemption setup.
              </p>

              <div className="space-y-4 pt-2 border-t border-slate-800">
                <div className="flex items-start space-x-3 text-xs">
                  <div className="p-2 rounded bg-slate-800 text-blue-400 shrink-0">
                    <Phone className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-bold text-white">Emergency Hotline</p>
                    <p className="text-slate-400 font-mono">+1 (800) 555-LIFELINK</p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 text-xs">
                  <div className="p-2 rounded bg-slate-800 text-emerald-400 shrink-0">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-bold text-white">Integration Engineering</p>
                    <p className="text-slate-400 font-mono">api-support@lifelink.ai</p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 text-xs">
                  <div className="p-2 rounded bg-slate-800 text-purple-400 shrink-0">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-bold text-white">Global Headquarters</p>
                    <p className="text-slate-400">Healthcare AI Innovation Hub, Tower 4, Suite 1200</p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1.5 font-semibold">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  HIPAA Secured Inquiry
                </span>
                <span className="mono text-[10px]">SLA Response: &lt; 2 hrs</span>
              </div>
            </div>

          </div>

          {/* Right Contact Form */}
          <div className="lg:col-span-7 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xs text-slate-900 dark:text-white">
            {submitted ? (
              <div className="text-center py-12 space-y-4 animate-in fade-in">
                <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">Message Received</h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 max-w-md mx-auto leading-relaxed">
                  Thank you, <strong>{formData.fullName}</strong>. A LifeLink AI Healthcare Integration Specialist will contact you at <strong>{formData.email}</strong> shortly.
                </p>
                <button
                  onClick={() => {
                    setSubmitted(false);
                    setFormData({
                      fullName: '',
                      email: '',
                      organization: '',
                      role: 'Hospital Administrator',
                      phone: '',
                      message: '',
                      urgentInquiry: false,
                    });
                  }}
                  className="px-5 py-2.5 text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 cursor-pointer"
                >
                  Send Another Inquiry
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-3">
                  Submit Integration Inquiry
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      placeholder="e.g. Dr. Sarah Jenkins"
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Work Email *
                    </label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="e.g. s.jenkins@metrohealth.org"
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Organization / Hospital *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.organization}
                      onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
                      placeholder="e.g. Metro General Hospital"
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Stakeholder Role
                    </label>
                    <select
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                    >
                      <option value="Hospital Administrator">Hospital Administrator</option>
                      <option value="Blood Bank Specialist">Blood Bank Specialist</option>
                      <option value="EMS Dispatch Director">EMS Dispatch Director</option>
                      <option value="Health Ministry Official">Health Ministry Official</option>
                      <option value="Healthcare IT / Developer">Healthcare IT / Developer</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Inquiry Message *
                  </label>
                  <textarea
                    rows={4}
                    required
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    placeholder="Describe your facility size, emergency response requirements, or integration timelines..."
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex items-center space-x-2 pt-1">
                  <input
                    type="checkbox"
                    id="urgentInquiry"
                    checked={formData.urgentInquiry}
                    onChange={(e) => setFormData({ ...formData, urgentInquiry: e.target.checked })}
                    className="accent-blue-600 w-4 h-4 cursor-pointer"
                  />
                  <label htmlFor="urgentInquiry" className="text-xs text-slate-700 dark:text-slate-300 font-semibold cursor-pointer">
                    Urgent Incident / Active Emergency Deployment Request
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={isSending}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-xs flex items-center justify-center space-x-2 cursor-pointer transition-colors"
                >
                  <Send className="w-4 h-4" />
                  <span>{isSending ? 'Transmitting Request...' : 'Submit Inquiry'}</span>
                </button>
              </form>
            )}
          </div>

        </div>

      </div>
    </section>
  );
};
