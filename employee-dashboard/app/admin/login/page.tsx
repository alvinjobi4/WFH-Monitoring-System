"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { Eye, EyeOff } from "lucide-react";

export default function AdminLoginPage() {
  const router = useRouter();
  const [adminId, setAdminId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const trimmedAdminId = adminId.trim();
    const trimmedPassword = password.trim();

    if (trimmedAdminId !== "admin") {
      setError("Invalid credentials or access denied");
      setLoading(false);
      return;
    }

    try {
      const { data: adminData, error: dbError } = await supabase
        .from("employees")
        .select("*")
        .eq("id", "admin")
        .eq("role", "admin")
        .single();

      setLoading(false);

      if (dbError || !adminData) {
        setError("Admin profile not found in database");
        return;
      }

      if (trimmedPassword !== (adminData.password || "password")) {
        setError("Invalid credentials or access denied");
        return;
      }

      const userName = adminData.name || "Admin";

      localStorage.setItem("userRole", "admin");
      localStorage.setItem("userName", userName);

      router.push("/admin");
    } catch (err) {
      setError("An error occurred during login.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b13] text-slate-100 flex flex-col items-center justify-center p-6 font-sans relative overflow-hidden">
      <div className="fixed inset-0 bg-[#070b13] -z-10" />

      <div className="relative max-w-sm w-full mx-auto">
        <div className="relative bg-[#121826] border border-slate-800 rounded-[14px] shadow-sm p-6 md:p-8">
          <h2 className="text-xl font-semibold text-slate-100 tracking-tight text-center mb-6">Admin Login</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider ml-0.5">Admin ID</label>
              <input
                type="text"
                required
                value={adminId}
                onChange={(e) => setAdminId(e.target.value)}
                className="w-full px-3 py-2 bg-[#111827] border border-slate-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs text-white placeholder-slate-500 transition-all font-mono"
                placeholder="Enter Admin ID"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider ml-0.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-3 pr-10 py-2 bg-[#111827] border border-slate-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs text-white placeholder-slate-500 transition-all"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 focus:outline-none cursor-pointer"
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="w-4.5 h-4.5" />
                  ) : (
                    <Eye className="w-4.5 h-4.5" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/10 text-rose-400 text-xs text-center font-medium">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer mt-2"
            >
              {loading ? "Signing In..." : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
