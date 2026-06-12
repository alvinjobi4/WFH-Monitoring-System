"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import Link from "next/link";
import { 
  Globe, Trash2, Plus, Search, ArrowLeft, 
  AlertCircle, ShieldCheck, ShieldX, RefreshCw 
} from "lucide-react";

interface DomainRule {
  domain: string;
  type: "whitelist" | "blacklist" | "neutral";
  score: number;
  created_at?: string;
}

export default function ManageDomainsPage() {
  const router = useRouter();
  const [rules, setRules] = useState<DomainRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [adminName, setAdminName] = useState("");

  // Add domain form states
  const [newDomain, setNewDomain] = useState("");
  const [newType, setNewType] = useState<"whitelist" | "blacklist" | "neutral">("whitelist");
  const [newScore, setNewScore] = useState<number | string>(10);
  const [formMessage, setFormMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Inline editing states
  const [editingDomain, setEditingDomain] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    domain: string;
    type: "whitelist" | "blacklist" | "neutral";
    score: number | string;
  }>({ domain: "", type: "whitelist", score: 10 });
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Search & Filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<"all" | "whitelist" | "blacklist" | "neutral">("all");

  // Authentication Guard
  useEffect(() => {
    const role = localStorage.getItem("userRole");
    const name = localStorage.getItem("userName");
    if (role !== "admin") {
      router.push("/");
    } else {
      setAdminName(name || "Admin");
      setIsLoading(false);
    }
  }, [router]);

  // Adjust score automatically when adding a new type, if user hasn't touched it
  useEffect(() => {
    if (newType === "neutral") {
      setNewScore(0);
    } else {
      setNewScore(newType === "whitelist" ? 10 : -10);
    }
  }, [newType]);

  const fetchRules = async () => {
    try {
      const { data, error } = await supabase
        .from("domain_rules")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Failed to fetch domain rules:", error.message);
      } else if (data) {
        const mapped = data.map((r: any) => ({
          domain: r.domain,
          type: r.type,
          score: typeof r.score === "number" ? r.score : (r.type === "whitelist" ? 10 : r.type === "blacklist" ? -10 : 0),
          created_at: r.created_at
        }));
        setRules(mapped);
      }
    } catch (err) {
      console.error("Unexpected error fetching rules:", err);
    }
  };

  useEffect(() => {
    if (!isLoading) {
      fetchRules();
    }
  }, [isLoading]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchRules();
    setIsRefreshing(false);
  };

  const cleanDomainInput = (input: string): string => {
    let cleaned = input.trim().toLowerCase();
    // Strip http:// or https://
    cleaned = cleaned.replace(/^(https?:\/\/)/, "");
    // Strip www.
    cleaned = cleaned.replace(/^www\./, "");
    // Strip paths, queries, or trailing slashes (e.g. "google.com/search?q=1" -> "google.com")
    cleaned = cleaned.split("/")[0] || "";
    cleaned = cleaned.split("?")[0] || "";
    return cleaned;
  };

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormMessage("");
    setIsSubmitting(true);

    const domain = cleanDomainInput(newDomain);

    if (!domain) {
      setFormMessage("Error: Please enter a valid domain name or keyword.");
      setIsSubmitting(false);
      return;
    }

    try {
      const { error } = await supabase
        .from("domain_rules")
        .insert([{ domain, type: newType, score: parseInt(String(newScore)) || 0 }]);

      if (error) {
        if (error.code === "23505") { // Unique constraint violation
          setFormMessage(`Error: Rule for "${domain}" already exists.`);
        } else {
          setFormMessage(`Error: ${error.message}`);
        }
      } else {
        setFormMessage(`Rule for "${domain}" created successfully!`);
        setNewDomain("");
        fetchRules();
      }
    } catch (err) {
      setFormMessage("An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEdit = (rule: DomainRule) => {
    setEditingDomain(rule.domain);
    setEditForm({
      domain: rule.domain,
      type: rule.type,
      score: rule.score
    });
  };

  const handleSaveEdit = async () => {
    if (!editingDomain) return;
    setIsSavingEdit(true);
    setFormMessage("");

    const cleanedDomain = cleanDomainInput(editForm.domain);
    if (!cleanedDomain) {
      setFormMessage("Error: Domain Name or Keyword cannot be empty.");
      setIsSavingEdit(false);
      return;
    }

    try {
      const { error } = await supabase
        .from("domain_rules")
        .update({
          domain: cleanedDomain,
          type: editForm.type,
          score: parseInt(String(editForm.score)) || 0
        })
        .eq("domain", editingDomain);

      if (error) {
        setFormMessage(`Error: ${error.message}`);
      } else {
        setEditingDomain(null);
        setFormMessage("Domain rule updated successfully!");
        fetchRules();
      }
    } catch (err) {
      setFormMessage("An unexpected error occurred while saving.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteRule = async (domain: string) => {
    if (!window.confirm(`Are you sure you want to delete the rule for "${domain}"?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from("domain_rules")
        .delete()
        .eq("domain", domain);

      if (error) {
        alert(`Error deleting rule: ${error.message}`);
      } else {
        fetchRules();
      }
    } catch (err) {
      alert("An unexpected error occurred while deleting.");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("userRole");
    localStorage.removeItem("userName");
    router.push("/");
  };

  // Filtered rules logic
  const filteredRules = useMemo(() => {
    let list = rules;

    if (filterType !== "all") {
      list = list.filter(r => r.type === filterType);
    }

    const term = searchTerm.trim().toLowerCase();
    if (!term) return list;

    return list.filter(r => r.domain.includes(term));
  }, [rules, searchTerm, filterType]);

  const whitelistCount = useMemo(() => rules.filter(r => r.type === "whitelist").length, [rules]);
  const blacklistCount = useMemo(() => rules.filter(r => r.type === "blacklist").length, [rules]);
  const neutralCount = useMemo(() => rules.filter(r => r.type === "neutral").length, [rules]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#070b13] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-white/10 border-t-blue-500 rounded-full animate-spin"></div>
          <div className="text-slate-400 text-xs font-medium tracking-wide mt-1">Loading database...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070b13] text-slate-100 p-4 md:p-6 font-sans selection:bg-blue-500/30 overflow-x-hidden relative">
      <div className="fixed inset-0 bg-[#070b13] -z-10" />

      <div className="max-w-7xl mx-auto space-y-4 relative z-10">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-3 border-b border-slate-800 pb-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
              Domain Filters <span className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-900 text-slate-400 border border-slate-800 rounded">Console</span>
            </h1>
            <p className="text-[10px] text-slate-400 mt-0.5 font-medium tracking-wide uppercase">
              Operational Domain Whitelists and Blacklists
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href="/admin"
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded transition-all text-xs font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
            </Link>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 bg-red-950/20 hover:bg-red-950/40 text-red-400 border border-red-900/20 rounded transition-all text-xs font-medium cursor-pointer"
            >
              Logout
            </button>
          </div>
        </header>

        {/* Info stats widgets */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-[#121826] border border-slate-800 rounded p-2.5 flex flex-col justify-center shadow-sm hover:bg-[#121826]/80 transition-colors">
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Total Active Rules</span>
            <span className="text-xl font-bold font-mono tracking-tight mt-0.5 text-blue-400">{rules.length}</span>
            <span className="text-[9px] text-slate-500 font-medium mt-0.5">Whitelisted + Blacklisted + Neutral</span>
          </div>
          <div className="bg-[#121826] border border-slate-800 rounded p-2.5 flex flex-col justify-center shadow-sm hover:bg-[#121826]/80 transition-colors">
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Whitelisted Domains</span>
            <span className="text-xl font-bold font-mono tracking-tight mt-0.5 text-emerald-400">{whitelistCount}</span>
            <span className="text-[9px] text-slate-500 font-medium mt-0.5">Bypasses AI to mark as Productive</span>
          </div>
          <div className="bg-[#121826] border border-slate-800 rounded p-2.5 flex flex-col justify-center shadow-sm hover:bg-[#121826]/80 transition-colors">
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Blacklisted Domains</span>
            <span className="text-xl font-bold font-mono tracking-tight mt-0.5 text-rose-400">{blacklistCount}</span>
            <span className="text-[9px] text-slate-500 font-medium mt-0.5">Bypasses AI to mark as Unproductive</span>
          </div>
          <div className="bg-[#121826] border border-slate-800 rounded p-2.5 flex flex-col justify-center shadow-sm hover:bg-[#121826]/80 transition-colors">
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Neutral Domains</span>
            <span className="text-xl font-bold font-mono tracking-tight mt-0.5 text-blue-400">{neutralCount}</span>
            <span className="text-[9px] text-slate-500 font-medium mt-0.5">Bypasses AI to mark as Neutral</span>
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          
          {/* Add rule form card */}
          <div className="col-span-1 space-y-4">
            <div className="relative bg-[#121826] border border-slate-800 rounded overflow-hidden">
              <div className="px-4 py-2 border-b border-slate-800 bg-[#111827]/80 flex items-center justify-between">
                <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Add Domain Rule</h2>
              </div>
              <div className="p-4">
                <form onSubmit={handleAddRule} className="space-y-4">
                  {formMessage && (
                    <div className={`p-2.5 rounded text-xs font-medium border ${
                      formMessage.toLowerCase().includes("error")
                        ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                        : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    }`}>
                      {formMessage}
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider ml-0.5">Domain Name / Keyword</label>
                    <input
                      type="text"
                      required
                      value={newDomain}
                      onChange={(e) => setNewDomain(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-[#111827] border border-slate-800 rounded focus:outline-none focus:ring-1 focus:ring-blue-500/50 text-xs text-white placeholder-slate-600 transition-all font-mono"
                      placeholder="e.g. facebook.com, instagram"
                    />
                    <span className="text-[8px] text-slate-500 block ml-0.5 leading-normal mt-0.5">
                      Accepts domain formats or keyword keywords. Subdomains are matched automatically.
                    </span>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider ml-0.5">Rule Type</label>
                    <div className="grid grid-cols-3 gap-2 mt-1">
                      <button
                        type="button"
                        onClick={() => setNewType("whitelist")}
                        className={`py-1.5 px-1 rounded text-[10px] font-semibold border transition-all flex items-center justify-center gap-1 cursor-pointer ${
                          newType === "whitelist"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                            : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <ShieldCheck className="w-3 h-3" /> Whitelist
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewType("blacklist")}
                        className={`py-1.5 px-1 rounded text-[10px] font-semibold border transition-all flex items-center justify-center gap-1 cursor-pointer ${
                          newType === "blacklist"
                            ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                            : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <ShieldX className="w-3 h-3" /> Blacklist
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewType("neutral")}
                        className={`py-1.5 px-1 rounded text-[10px] font-semibold border transition-all flex items-center justify-center gap-1 cursor-pointer ${
                          newType === "neutral"
                            ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
                            : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <Globe className="w-3 h-3" /> Neutral
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider ml-0.5">Productivity Score</label>
                    <input
                      type="text"
                      required
                      disabled={newType === "neutral"}
                      value={newType === "neutral" ? 0 : newScore}
                      onChange={(e) => {
                        if (newType === "neutral") return;
                        const val = e.target.value;
                        if (val === "" || val === "-") {
                          setNewScore(val);
                        } else if (/^-?\d*$/.test(val)) {
                          const parsed = parseInt(val);
                          if (parsed >= -10 && parsed <= 10) {
                            setNewScore(parsed);
                          }
                        }
                      }}
                      className={`w-full px-2.5 py-1.5 bg-[#111827] border border-slate-800 rounded focus:outline-none focus:ring-1 focus:ring-blue-500/50 text-xs text-white placeholder-slate-600 transition-all font-mono ${
                        newType === "neutral" ? "opacity-50 cursor-not-allowed" : ""
                      }`}
                      placeholder="e.g. 10 or -10"
                    />
                    <span className="text-[8px] text-slate-500 block ml-0.5 leading-normal mt-0.5">
                      {newType === "neutral" 
                        ? "Neutral rules automatically have a score of 0."
                        : "Set a custom score from -10 (unproductive) to 10 (productive)."}
                    </span>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded border border-blue-700/30 transition-all text-xs font-semibold cursor-pointer mt-1 flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Rule
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* Rules List table card */}
          <div className="col-span-1 lg:col-span-2 space-y-4">
            <div className="bg-[#121826] border border-slate-800 rounded overflow-hidden flex flex-col h-full">
              <div className="px-4 py-2 border-b border-slate-800 bg-[#111827]/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Configured Rules ({filteredRules.length})</h2>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  {/* Filters */}
                  <div className="flex bg-[#111827] border border-slate-800 p-0.5 rounded-lg text-[10px] font-semibold">
                    <button
                      onClick={() => setFilterType("all")}
                      className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                        filterType === "all" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      ALL
                    </button>
                    <button
                      onClick={() => setFilterType("whitelist")}
                      className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                        filterType === "whitelist" ? "bg-emerald-950/40 text-emerald-400" : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      WHITELIST
                    </button>
                    <button
                      onClick={() => setFilterType("blacklist")}
                      className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                        filterType === "blacklist" ? "bg-rose-950/40 text-rose-455 text-rose-400" : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      BLACKLIST
                    </button>
                    <button
                      onClick={() => setFilterType("neutral")}
                      className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                        filterType === "neutral" ? "bg-blue-950/40 text-blue-455 text-blue-400" : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      NEUTRAL
                    </button>
                  </div>

                  {/* Search */}
                  <div className="relative w-44">
                    <input
                      type="text"
                      placeholder="Search domain..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-[#121826] hover:bg-[#121826]/80 border border-white/5 rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs font-medium transition-colors"
                    />
                    {searchTerm && (
                      <button
                        onClick={() => setSearchTerm("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs focus:outline-none cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Refresh */}
                  <button
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="p-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-slate-200 border border-slate-800 rounded transition-all cursor-pointer flex items-center justify-center"
                    title="Refresh list"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-blue-400" : "text-slate-400"}`} />
                  </button>
                </div>
              </div>

              {/* Table wrapper */}
              <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="text-[10px] uppercase font-bold tracking-wider text-slate-400 bg-[#111827]/40 border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-2 font-semibold">Domain Name</th>
                      <th className="px-4 py-2 font-semibold">Rule Type</th>
                      <th className="px-4 py-2 font-semibold">Productivity Score</th>
                      <th className="px-4 py-2 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredRules.map((rule) => {
                      const isEditing = editingDomain === rule.domain;
                      return (
                        <tr key={rule.domain} className={`hover:bg-slate-800/30 transition-colors group/row ${isEditing ? 'bg-blue-500/5' : ''}`}>
                          <td className="px-4 py-1.5 font-mono text-xs text-slate-200">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editForm.domain}
                                onChange={(e) => setEditForm({ ...editForm, domain: e.target.value })}
                                className="px-2 py-0.5 bg-[#111827] border border-slate-800 rounded focus:outline-none focus:ring-1 focus:ring-blue-500/50 text-xs text-white max-w-[150px]"
                              />
                            ) : (
                              rule.domain
                            )}
                          </td>
                          <td className="px-4 py-1.5">
                            {isEditing ? (
                              <select
                                value={editForm.type}
                                onChange={(e) => {
                                  const type = e.target.value as "whitelist" | "blacklist" | "neutral";
                                  setEditForm({ 
                                    ...editForm, 
                                    type,
                                    score: type === "neutral" ? 0 : (type === "whitelist" ? 10 : -10)
                                  });
                                }}
                                className="px-1.5 py-0.5 bg-[#111827] border border-slate-800 rounded focus:outline-none focus:ring-1 focus:ring-blue-500/50 text-xs text-white uppercase tracking-wider"
                              >
                                <option value="whitelist">Whitelist</option>
                                <option value="blacklist">Blacklist</option>
                                <option value="neutral">Neutral</option>
                              </select>
                            ) : rule.type === "whitelist" ? (
                              <span className="inline-flex items-center gap-1 text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider">
                                <ShieldCheck className="w-2.5 h-2.5" /> Whitelist
                              </span>
                            ) : rule.type === "blacklist" ? (
                              <span className="inline-flex items-center gap-1 text-[9px] bg-rose-500/10 text-rose-400 border border-rose-500/20 px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider">
                                <ShieldX className="w-2.5 h-2.5" /> Blacklist
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[9px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider">
                                <Globe className="w-2.5 h-2.5" /> Neutral
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-1.5 font-mono text-xs">
                            {isEditing ? (
                              <input
                                type="text"
                                disabled={editForm.type === "neutral"}
                                value={editForm.type === "neutral" ? 0 : editForm.score}
                                onChange={(e) => {
                                  if (editForm.type === "neutral") return;
                                  const val = e.target.value;
                                  if (val === "" || val === "-") {
                                    setEditForm({ ...editForm, score: val });
                                  } else if (/^-?\d*$/.test(val)) {
                                    const parsed = parseInt(val);
                                    if (parsed >= -10 && parsed <= 10) {
                                      setEditForm({ ...editForm, score: parsed });
                                    }
                                  }
                                }}
                                className={`px-2 py-0.5 bg-[#111827] border border-slate-800 rounded focus:outline-none focus:ring-1 focus:ring-blue-500/50 text-xs text-white font-mono max-w-[75px] ${
                                  editForm.type === "neutral" ? "opacity-50 cursor-not-allowed" : ""
                                }`}
                              />
                            ) : (
                              <span className={rule.score > 0 ? "text-emerald-455 text-emerald-400 font-semibold" : rule.score < 0 ? "text-rose-455 text-rose-400 font-semibold" : "text-slate-400 font-semibold"}>
                                {rule.score > 0 ? `+${rule.score}` : rule.score} ({rule.type === "whitelist" ? "Productive" : rule.type === "blacklist" ? "Unproductive" : "Neutral"})
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-1.5 text-right sticky right-0 border-l border-slate-800/60 z-20">
                            {isEditing ? (
                              <div className="flex justify-end gap-1.5">
                                <button
                                  onClick={handleSaveEdit}
                                  disabled={isSavingEdit}
                                  className="p-1 text-emerald-500 hover:bg-emerald-500/10 rounded transition-all cursor-pointer"
                                  title="Save Changes"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12"></polyline>
                                  </svg>
                                </button>
                                <button
                                  onClick={() => setEditingDomain(null)}
                                  className="p-1 text-slate-500 hover:bg-slate-500/10 rounded transition-all cursor-pointer"
                                  title="Cancel"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                  </svg>
                                </button>
                              </div>
                            ) : (
                              <div className="flex justify-end gap-1.5 opacity-0 group-hover/row:opacity-100 transition-all">
                                <button
                                  onClick={() => handleStartEdit(rule)}
                                  className="p-1 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-all cursor-pointer"
                                  title="Edit Rule"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                  </svg>
                                </button>
                                <button
                                  onClick={() => handleDeleteRule(rule.domain)}
                                  className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-all cursor-pointer"
                                  title="Delete Rule"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {filteredRules.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-slate-500 font-mono text-xs">
                          {searchTerm || filterType !== "all" 
                            ? "No matching domain rules found." 
                            : "No domain rules configured yet."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
